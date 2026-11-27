const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data', 'orders.json');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'catalog.js'), 'utf8') + ';this.products=products;this.categories=categories;', ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'store-config.js'), 'utf8') + ';this.STORE=STORE;', ctx);
const { products, categories, STORE } = ctx;
// Frete Full cobrado no servidor com as mesmas regras do store-config.js (o navegador não decide o preço)
const FULL = STORE.fullShipping || { enabled: false };
const shippingFee = (method, subtotal, cep) => {
  if (method !== 'full' || !FULL.enabled) return 0;
  const digits = String(cep || '').replace(/\D/g, '');
  if (FULL.cepPrefixes?.length && !FULL.cepPrefixes.some(p => digits.startsWith(p))) throw new Error('Envio Full indisponível para este CEP');
  return Math.round(Math.min(FULL.max, Math.max(FULL.min, subtotal * FULL.pct / 100)) * 100) / 100;
};
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.json':'application/json' };
const STATIC = new Set(['index.html', 'app.js', 'catalog.js', 'store-config.js', 'styles.css']);
const SHIPPING_DAYS = process.env.SHIPPING_DAYS || '3 a 7 dias úteis';

const readOrders = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return []; } };
const writeOrders = orders => { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(orders, null, 2)); };
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 1e5) { reject(new Error('payload')); req.destroy(); } });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
});

// Pagamento via Pix com a SUA conta Mercado Pago (API oficial).
// Defina MP_ACCESS_TOKEN com o Access Token de produção da sua conta
// (mercadopago.com.br/developers > Suas integrações > Credenciais).
// O recebedor exibido no app do banco do cliente será a SUA razão social.
const MP_API = 'https://api.mercadopago.com/v1/payments';
const payment = {
  async createCharge(order) {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return { provider: 'none', status: 'aguardando_configuracao_de_pagamento' };
    const [first, ...rest] = String(order.customer.name).trim().split(/\s+/);
    const r = await fetch(MP_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': order.id },
      body: JSON.stringify({
        transaction_amount: order.total,
        description: `Pedido ${order.id.slice(0, 8).toUpperCase()}`,
        payment_method_id: 'pix',
        external_reference: order.id,
        payer: { email: order.customer.email, first_name: first, last_name: rest.join(' ') || first, identification: { type: 'CPF', number: String(order.customer.cpf).replace(/\D/g, '') } }
      })
    });
    const data = await r.json();
    if (!r.ok) { console.error('Mercado Pago:', data); throw new Error('Não foi possível gerar o Pix. Tente novamente.'); }
    const tx = data.point_of_interaction?.transaction_data || {};
    return { provider: 'mercadopago', id: data.id, status: data.status, qrCode: tx.qr_code, qrCodeBase64: tx.qr_code_base64, expiresAt: data.date_of_expiration };
  },
  async refresh(order) {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token || !order.payment?.id || order.status === 'pago') return order;
    const r = await fetch(`${MP_API}/${order.payment.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return order;
    const data = await r.json();
    order.payment.status = data.status;
    if (data.status === 'approved') order.status = 'pago';
    else if (['cancelled', 'rejected', 'expired'].includes(data.status)) order.status = 'cancelado';
    return order;
  }
};

async function shipping(cep) {
  const digits = String(cep).replace(/\D/g, '');
  if (digits.length !== 8) return { error: 'CEP inválido', status: 400 };
  const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await r.json();
  if (data.erro) return { error: 'CEP não encontrado', status: 404 };
  return { status: 200, address: { cep: data.cep, street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf }, price: 0, label: `Frete grátis · entrega em ${SHIPPING_DAYS}` };
}

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

async function api(req, res, url) {
  const { pathname } = url;
  if (req.method === 'GET' && pathname === '/api/products') return send(res, 200, { products, categories });
  if (req.method === 'GET' && pathname === '/api/shipping') {
    const { status, ...rest } = await shipping(url.searchParams.get('cep') || '');
    return send(res, status, rest);
  }
  if (req.method === 'POST' && pathname === '/api/orders') {
    const { items, customer, address, shippingMethod } = await body(req);
    const required = ['name', 'email', 'cpf', 'phone'];
    if (!customer || required.some(k => !String(customer[k] || '').trim())) return send(res, 400, { error: 'Dados do cliente incompletos' });
    if (!address || !String(address.cep || '').trim() || !String(address.street || '').trim()) return send(res, 400, { error: 'Endereço incompleto' });
    const { lines, total: subtotal } = priceItems(items);
    const fee = shippingFee(shippingMethod, subtotal, address.cep);
    const total = Math.round((subtotal + fee) * 100) / 100;
    const order = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pendente', items: lines, subtotal, shipping: { method: fee ? 'full' : 'free', fee }, total, customer, address };
    order.payment = await payment.createCharge(order);
    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);
    return send(res, 201, { id: order.id, total, status: order.status, payment: order.payment });
  }
  if (req.method === 'GET' && pathname.startsWith('/api/orders/')) {
    const orders = readOrders();
    const order = orders.find(o => o.id === pathname.split('/')[3]);
    if (!order) return send(res, 404, { error: 'Pedido não encontrado' });
    const before = order.status;
    await payment.refresh(order).catch(() => {});
    if (order.status !== before) writeOrders(orders);
    return send(res, 200, { id: order.id, status: order.status, total: order.total, items: order.items, createdAt: order.createdAt });
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const ok = STATIC.has(rel) || /^assets\/(products|banners|brand)\/[\w-]+\.(svg|jpe?g|png|webp)$/.test(rel);
    if (!ok) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(path.join(ROOT, rel)).pipe(res);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`Lojão do Barateiro em http://localhost:${PORT}`));
