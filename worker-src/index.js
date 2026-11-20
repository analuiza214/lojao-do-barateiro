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

async function shipping(cep) {
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
      label: 'Frete grátis (prazo estimado: 3 a 7 dias úteis)'
    });
  } catch {
    return json({ error: 'Falha ao consultar CEP' }, 502);
  }
}

async function handleOrder(request, env) {
  const { items, customer, address, paymentMethod } = await request.json();
  const required = ['name', 'email', 'cpf', 'phone'];
  if (!customer || required.some(k => !String(customer[k] || '').trim())) {
    return json({ error: 'Dados do cliente incompletos' }, 400);
  }
  if (!address || !String(address.cep || '').trim() || !String(address.street || '').trim()) {
    return json({ error: 'Endereço incompleto' }, 400);
  }

  const { lines, total } = priceItems(items);
  const id = crypto.randomUUID();

  // Lê variáveis do painel da Cloudflare caso configuradas (env.*)
  const provider = paymentMethod || env.PAYMENT_PROVIDER || 'pix';

  const order = {
    id,
    createdAt: new Date().toISOString(),
    status: 'pendente',
    items: lines,
    total,
    customer,
    address,
    payment: {
      provider,
      status: 'aguardando_pagamento'
    }
  };

  // Se você vincular um KV (ORDERS_KV) no painel da Cloudflare, salva o pedido:
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
          return shipping(url.searchParams.get('cep') || '');
        }

        if (request.method === 'POST' && path === '/api/orders') {
          return handleOrder(request, env);
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
