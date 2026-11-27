// Lojão do Barateiro — Cloudflare Worker
// Todas as variáveis são lidas dinamicamente do objeto `env` configurado no painel da Cloudflare.
// Nenhuma chave, credencial ou e-mail fica exposto no código ou no GitHub.

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const digits = (value) => String(value || '').replace(/\D/g, '');

// Catálogo de produtos (embutido na compilação)
import catalog from '../catalog-data.json';
const { products, categories } = catalog;

function priceItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('Carrinho inválido');
  let cents = 0;
  const lines = items.map(({ id, variant, qty }) => {
    const p = products.find(x => x.id === id);
    const v = p?.variants[variant];
    if (!v || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('Item inválido');
    const unit = Math.round(v[1] * 100);
    cents += unit * qty;
    return { id, variant: v[0], qty, unit: unit / 100 };
  });
  return { lines, total: cents / 100 };
}

async function shipping(cep, env) {
  const clean = digits(cep);
  if (clean.length !== 8) return json({ error: 'CEP inválido' }, 400);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await r.json();
    if (data.erro) return json({ error: 'CEP não encontrado' }, 404);
    return json({
      address: {
        cep: data.cep,
        street: data.logradouro,
        district: data.bairro,
        city: data.localidade,
        state: data.uf
      },
      price: 0,
      days: 7,
      label: `Frete grátis · entrega em ${env.SHIPPING_DAYS || '3 a 7 dias úteis'}`
    });
  } catch {
    return json({ error: 'Falha ao consultar CEP' }, 502);
  }
}

// Pix com a SUA conta Mercado Pago (API oficial). Configure o secret MP_ACCESS_TOKEN
// em Workers & Pages > seu Worker > Settings > Variables and Secrets.
const MP_API = 'https://api.mercadopago.com/v1/payments';
async function createPix(order, env) {
  if (!env.MP_ACCESS_TOKEN) return { provider: 'none', status: 'aguardando_configuracao_de_pagamento' };
  const [first, ...rest] = String(order.customer.name).trim().split(/\s+/);
  const r = await fetch(MP_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': order.id },
    body: JSON.stringify({
      transaction_amount: order.total,
      description: `Pedido ${order.id.slice(0, 8).toUpperCase()}`,
      payment_method_id: 'pix',
      external_reference: order.id,
      payer: { email: order.customer.email, first_name: first, last_name: rest.join(' ') || first, identification: { type: 'CPF', number: digits(order.customer.cpf) } }
    })
  });
  const data = await r.json();
  if (!r.ok) { console.error('Mercado Pago:', JSON.stringify(data)); throw new Error('Não foi possível gerar o Pix. Tente novamente.'); }
  const tx = data.point_of_interaction?.transaction_data || {};
  return { provider: 'mercadopago', id: data.id, status: data.status, qrCode: tx.qr_code, qrCodeBase64: tx.qr_code_base64, expiresAt: data.date_of_expiration };
}

async function getOrder(id, env, pid) {
  // Sem KV: confirma direto no Mercado Pago pelo id do pagamento, conferindo que pertence a este pedido.
  if (!env.ORDERS_KV) {
    if (!pid || !env.MP_ACCESS_TOKEN || !/^\d+$/.test(pid)) return json({ error: 'Pedido não encontrado' }, 404);
    const r = await fetch(`${MP_API}/${pid}`, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
    if (!r.ok) return json({ error: 'Pedido não encontrado' }, 404);
    const data = await r.json();
    if (data.external_reference !== id) return json({ error: 'Pedido não encontrado' }, 404);
    const status = data.status === 'approved' ? 'pago' : ['cancelled', 'rejected', 'expired'].includes(data.status) ? 'cancelado' : 'pendente';
    return json({ id, status, total: data.transaction_amount });
  }
  const raw = await env.ORDERS_KV.get(`order:${id}`);
  if (!raw) return json({ error: 'Pedido não encontrado' }, 404);
  const order = JSON.parse(raw);
  if (env.MP_ACCESS_TOKEN && order.payment?.id && order.status !== 'pago') {
    const r = await fetch(`${MP_API}/${order.payment.id}`, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } });
    if (r.ok) {
      const data = await r.json();
      const before = order.status;
      order.payment.status = data.status;
      if (data.status === 'approved') order.status = 'pago';
      else if (['cancelled', 'rejected', 'expired'].includes(data.status)) order.status = 'cancelado';
      if (order.status !== before) await env.ORDERS_KV.put(`order:${id}`, JSON.stringify(order));
    }
  }
  return json({ id: order.id, status: order.status, total: order.total, items: order.items, createdAt: order.createdAt });
}

// Frete Full: mantenha igual ao fullShipping do store-config.js (ou sobrescreva pelas variáveis no painel).
function shippingFee(method, subtotal, cep, env) {
  if (method !== 'full') return 0;
  const pct = Number(env.FULL_PCT || 12), min = Number(env.FULL_MIN || 14.9), max = Number(env.FULL_MAX || 39.9);
  const prefixes = String(env.FULL_CEP_PREFIXES || '').split(',').map(x => x.trim()).filter(Boolean);
  if (prefixes.length && !prefixes.some(p => digits(cep).startsWith(p))) throw new Error('Envio Full indisponível para este CEP');
  return Math.round(Math.min(max, Math.max(min, subtotal * pct / 100)) * 100) / 100;
}

async function handleOrder(request, env) {
  const { items, customer, address, shippingMethod } = await request.json();
  const required = ['name', 'email', 'cpf', 'phone'];
  if (!customer || required.some(k => !String(customer[k] || '').trim())) {
    return json({ error: 'Dados do cliente incompletos' }, 400);
  }
  if (!address || !String(address.cep || '').trim() || !String(address.street || '').trim()) {
    return json({ error: 'Endereço incompleto' }, 400);
  }

  const { lines, total: subtotal } = priceItems(items);
  const fee = shippingFee(shippingMethod, subtotal, address.cep, env);
  const total = Math.round((subtotal + fee) * 100) / 100;
  const id = crypto.randomUUID();

  const order = {
    id,
    createdAt: new Date().toISOString(),
    status: 'pendente',
    items: lines,
    subtotal,
    shipping: { method: fee ? 'full' : 'free', fee },
    total,
    customer,
    address,
    payment: await createPix({ id, total, customer }, env)
  };

  // Vincule um KV chamado ORDERS_KV no painel da Cloudflare para salvar os pedidos.
  if (env.ORDERS_KV) {
    try {
      await env.ORDERS_KV.put(`order:${id}`, JSON.stringify(order));
    } catch (e) {
      console.error('Erro ao salvar no KV:', e);
    }
  }

  return json({ id: order.id, total, status: order.status, payment: order.payment }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Rotas de API ──
    if (path.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          }
        });
      }

      try {
        if (request.method === 'GET' && path === '/api/products') {
          return json({ products, categories });
        }

        if (request.method === 'GET' && path === '/api/shipping') {
          return shipping(url.searchParams.get('cep') || '', env);
        }

        if (request.method === 'POST' && path === '/api/orders') {
          return handleOrder(request, env);
        }

        if (request.method === 'GET' && path.startsWith('/api/orders/')) {
          return getOrder(path.split('/')[3], env, url.searchParams.get('pid'));
        }

        return json({ error: 'Rota não encontrada' }, 404);
      } catch (e) {
        return json({ error: e.message || 'Erro interno' }, 400);
      }
    }

    // ── Arquivos Estáticos servidos pelo Cloudflare Assets ──
    if (path === '/') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }

    return env.ASSETS.fetch(request);
  }
};
