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
const { products, categories } = ctx;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.json':'application/json' };
const STATIC = new Set(['index.html', 'app.js', 'catalog.js', 'styles.css']);

const readOrders = () => { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return []; } };
const writeOrders = orders => { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(orders, null, 2)); };
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 1e5) { reject(new Error('payload')); req.destroy(); } });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
});

const payment = {
  async createCharge(order) {
    if (!process.env.PAYMENT_PROVIDER) return { provider: 'none', status: 'aguardando_configuracao_de_pagamento' };
    throw new Error('Integre o gateway em payment.createCharge (ver README).');
  }
};

async function shipping(cep) {
  const digits = String(cep).replace(/\D/g, '');
  if (digits.length !== 8) return { error: 'CEP inválido', status: 400 };
  const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await r.json();
  if (data.erro) return { error: 'CEP não encontrado', status: 404 };
  return { status: 200, address: { cep: data.cep, street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf }, price: 0, days: 7, label: 'Frete grátis (prazo de exemplo: configure transportadoras)' };
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
    const { items, customer, address } = await body(req);
    const required = ['name', 'email', 'cpf', 'phone'];
    if (!customer || required.some(k => !String(customer[k] || '').trim())) return send(res, 400, { error: 'Dados do cliente incompletos' });
    if (!address || !String(address.cep || '').trim() || !String(address.street || '').trim()) return send(res, 400, { error: 'Endereço incompleto' });
    const { lines, total } = priceItems(items);
    const order = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pendente', items: lines, total, customer, address };
    order.payment = await payment.createCharge(order);
    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);
    return send(res, 201, { id: order.id, total, status: order.status, payment: order.payment });
  }
  if (req.method === 'GET' && pathname.startsWith('/api/orders/')) {
    const order = readOrders().find(o => o.id === pathname.split('/')[3]);
    if (!order) return send(res, 404, { error: 'Pedido não encontrado' });
    return send(res, 200, { id: order.id, status: order.status, total: order.total, items: order.items, createdAt: order.createdAt });
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const ok = STATIC.has(rel) || /^assets\/(products|banners)\/[\w-]+\.(svg|jpe?g|png|webp)$/.test(rel);
    if (!ok) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream' });
    fs.createReadStream(path.join(ROOT, rel)).pipe(res);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`Lojão do Barateiro em http://localhost:${PORT}`));
