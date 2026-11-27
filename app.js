const site = 'assets/';
const app = document.querySelector('#app');
const overlay = document.querySelector('#overlay');
const status = document.querySelector('#status');
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const format = value => money.format(value);
const productLink = product => '#/produto/' + product.id;
const productImage = path => site + 'products/' + path;
const lookup = id => products.find(product => product.id === id);
const fold = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const safe = value => String(value ?? '').replace(/[&<>"']/g, token => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[token]));
const info = typeof PRODUCT_INFO !== 'undefined' ? PRODUCT_INFO : {};

// ---------- Configuração da loja ----------
const isDev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const promoEnd = new Date(STORE.promoEndsAt);
const promoActive = () => Date.now() < promoEnd.getTime();
const promoDate = promoEnd.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', timeZone:'America/Sao_Paulo' });
const waNumber = String(STORE.whatsapp || '').replace(/\D/g, '');
const waLink = text => waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}` : '#/atendimento';
const waDisplay = () => {
  const d = waNumber.replace(/^55/, '');
  return d.length >= 10 ? `(${d.slice(0,2)}) ${d.slice(2, d.length-4)}-${d.slice(-4)}` : '';
};
const missing = [['legalName','razão social'],['cnpj','CNPJ'],['email','e-mail'],['whatsapp','WhatsApp']].filter(([k]) => !STORE[k]).map(([,l]) => l);
// Campo legal: mostra o valor; no localhost, se vazio, mostra aviso para preencher; em produção, se vazio, não mostra nada.
const legalField = (label, value) => value ? `<p>${label}: ${safe(value)}</p>` : (isDev ? `<p>${label}: <mark class="todo">preencha em store-config.js</mark></p>` : '');
const payText = price => STORE.acceptsCard
  ? `em <span class="green">${STORE.maxInstallments}x de ${format(price / STORE.maxInstallments)} sem juros</span>`
  : `<span class="green">à vista no Pix</span>`;

const policies = [
  ['termos','Termos de uso'], ['privacidade','Política de privacidade'],
  ['politica-de-envio','Política de envio'], ['politica-de-reembolso','Política de reembolso'],
  ['trocas-e-devolucoes','Trocas e devoluções']
];

let cart = [];
try {
  const saved = JSON.parse(localStorage.getItem('barateiro-cart') || '[]');
  cart = saved.filter(item => lookup(item.id)?.variants[item.variant] && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 99);
} catch {}

let activeProduct;
let variant = 0;
let photo = 0;
let quantity = 1;
let step = 0;
let statusTimer;
let pollTimer;
let summaryOpen = true;
let placing = false;
let lastOrder = null;

let checkoutData = { name:'', email:'', cpf:'', phone:'', cep:'', address:'', number:'', complement:'', neighborhood:'', city:'', state:'' };

// CEP consultado fica salvo no aparelho e já preenche o endereço no checkout.
let savedCep = null;
try { savedCep = JSON.parse(localStorage.getItem('barateiro-cep') || 'null'); } catch {}
const applyCep = a => {
  savedCep = { cep: a.cep, street: a.street || '', district: a.district || '', city: a.city || '', state: a.state || '' };
  try { localStorage.setItem('barateiro-cep', JSON.stringify(savedCep)); } catch {}
  Object.assign(checkoutData, { cep: savedCep.cep, address: savedCep.street || checkoutData.address, neighborhood: savedCep.district || checkoutData.neighborhood, city: savedCep.city, state: savedCep.state });
};
if (savedCep) Object.assign(checkoutData, { cep: savedCep.cep, address: savedCep.street, neighborhood: savedCep.district, city: savedCep.city, state: savedCep.state });

// Previsão de entrega em datas, a partir de STORE.shippingDays (ex.: '3 a 7 dias úteis'). Pula sábados e domingos.
const addBusinessDays = n => { const d = new Date(); let left = n; while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) left--; } return d; };
const shipRange = () => { const m = String(STORE.shippingDays).match(/(\d+)\D+(\d+)/); return m ? [+m[1], +m[2]] : [3, 7]; };
const dayLabel = d => d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' });
// "Terça 01/12"
const longDay = d => { const w = d.toLocaleDateString('pt-BR', { weekday:'long' }).replace('-feira', ''); return w[0].toUpperCase() + w.slice(1) + ' ' + d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }); };
const deliveryWindowLong = () => { const [a, b] = shipRange(); return `${longDay(addBusinessDays(a))} e ${longDay(addBusinessDays(b))}`; };
// Envio Full
const FULL = STORE.fullShipping || { enabled: false };
const fullFee = subtotal => Math.round(Math.min(FULL.max, Math.max(FULL.min, subtotal * FULL.pct / 100)) * 100) / 100;
const fullAvailable = () => FULL.enabled && (!FULL.cepPrefixes?.length || FULL.cepPrefixes.some(pre => String(checkoutData.cep).replace(/\D/g, '').startsWith(pre)));
const fullEta = () => {
  const d = addBusinessDays(1), t = new Date(); t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString() ? 'Chega amanhã' : `Chega ${longDay(d).replace(/ .*/, '').toLowerCase()}`;
};
let shipMethod = 'free';
const deliveryWindow = () => { const [a, b] = shipRange(); return `${dayLabel(addBusinessDays(a))} e ${dayLabel(addBusinessDays(b))}`; };
const cepPlace = () => savedCep ? `${savedCep.district ? savedCep.district + ', ' : ''}${savedCep.city}/${savedCep.state}` : '';

const sumOld = () => cart.reduce((total, item) => {
  const p = lookup(item.id);
  return total + Math.round((p?.old || 0) * 100) * item.qty;
}, 0) / 100;
const sum = () => cart.reduce((total, item) => total + Math.round(lookup(item.id).variants[item.variant][1] * 100) * item.qty, 0) / 100;
const count = () => cart.reduce((total,item) => total + item.qty,0);
const save = () => { try { localStorage.setItem('barateiro-cart',JSON.stringify(cart)); } catch {} };
const pct = (price,old) => Math.round((1-price/old)*100);
const priceText = price => {
  const [whole,cents] = format(price).replace(/^R\$\s*/, '').split(',');
  return `<div class="price"><small>R$</small> <strong>${whole}<sup>${cents}</sup></strong></div>`;
};

// ---------- Ícones ----------
const ico = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const cartIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M1 3h3l3 12h12l3-9H5M8 19h.01M19 19h.01" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
const icons = {
  home: ico('<path d="M3 11l9-8 9 8v10H3z"/><path d="M9 21v-7h6v7"/>'),
  tag: ico('<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>'),
  truck: ico('<path d="M1 5h13v11H1zM14 9h5l4 4v3h-9"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'),
  box: ico('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  shield: ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  lock: ico('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  back: ico('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  chat: ico('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  user: ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  card: ico('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
  cart: cartIcon
};
// Símbolo do Pix desenhado em SVG (nítido em qualquer tela, sem depender de imagem externa)
const pixMark = (size = 22) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><g fill="none" stroke="#32bcad" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 24h7l11.2-11.2a4 4 0 0 1 5.6 0L38 24h7"/><path d="M10 24l11.2 11.2a4 4 0 0 0 5.6 0L38 24"/></g></svg>`;
const pixIcon = pixMark(22);
const waIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2z"/></svg>';

// ---------- Componentes ----------
// Foto de produto real que representa cada categoria (troque o id se quiser outra foto)
const categoryPhotos = { 'ofertas':'kit-4em1-48v', 'ferramentas-eletricas':'parafusadeira', 'construcao':'escada-telescopica', 'mecanica':'kit-ferramentas-maleta-110-216', 'acessorios':'camera-ptz-dupla' };
const categoryLinks = () => categories.map(([id,label,icon],i) => {
  const p = lookup(categoryPhotos[id]);
  return `<a class="cat-tile reveal" style="--d:${i*70}ms" href="#/categoria/${id}"><span class="cat-img" aria-hidden="true">${p ? `<img src="${productImage(p.image)}" alt="" loading="lazy">` : icon}</span>${label}</a>`;
}).join('');
const logo = () => '<a href="#/" class="logo"><span aria-hidden="true">⚒</span> Lojão do <b>Barateiro</b></a>';
const devBanner = () => isDev && missing.length ? `<div class="dev-banner"><strong>Modo configuração (só aparece no localhost):</strong> preencha ${missing.join(', ')} em <code>store-config.js</code> antes de publicar.</div>` : '';
const promoStrip = () => `<div class="promo-strip">${promoActive() ? `<span><span aria-hidden="true">♨</span> ${safe(STORE.promoName.toUpperCase())} ATÉ ${promoDate}</span>` : ''}<span>FRETE GRÁTIS PARA TODO O BRASIL</span><span>${STORE.returnDays} DIAS PARA DEVOLVER</span><span>PAGAMENTO SEGURO</span></div>`;
const header = query => `${devBanner()}<header>${promoStrip()}<div class="head"><button class="plain" data-action="menu" aria-label="Abrir menu">☰</button>${logo()}<form class="search" data-form="search"><input aria-label="Buscar produtos" name="query" value="${safe(query || '')}" placeholder="Buscar ferramentas, kits e acessórios..."><button aria-label="Buscar">⌕</button></form><button class="plain cart-toggle" data-action="cart" aria-label="Abrir carrinho">${cartIcon}${count() ? `<span class="count">${count()}</span>` : ''}</button><button class="delivery" data-action="cep"><span aria-hidden="true">⌖</span> ${savedCep ? `Entregar em ${safe(cepPlace())} · ${safe(savedCep.cep)}` : 'Consultar prazo de entrega pelo CEP'} <span style="float:right">›</span></button></div></header>`;

const trustItems = () => [
  ['truck', 'Frete grátis', `Para todo o Brasil · ${STORE.shippingDays}`],
  ['back', `${STORE.returnDays} dias para devolver`, 'Não gostou? Reembolso no Pix na hora'],
  ['lock', 'Pagamento seguro', STORE.acceptsCard ? 'Pix ou cartão em ambiente protegido' : 'Pix com confirmação na hora'],
  ['chat', 'Atendimento humano', waNumber ? `WhatsApp ${waDisplay()}` : (STORE.email || STORE.hours)]
];
const trustBar = () => `<section class="trust-bar" aria-label="Por que comprar no Lojão"><div class="wrap trust-grid">${trustItems().map(([i,t,s],n) => `<div class="trust-item reveal" style="--d:${n*90}ms"><span>${icons[i]}</span><div><strong>${t}</strong><small>${safe(s)}</small></div></div>`).join('')}</div></section>`;

const storefront = (cls = '') => `<figure class="storefront ${cls}"><img src="assets/brand/fachada-loja.webp" alt="Fachada da loja ${safe(STORE.name)}" loading="lazy" width="1400" height="788"><figcaption>Fachada da loja</figcaption></figure>`;
const about = () => `<section class="about panel">${storefront()}<div><p class="eyebrow">SOBRE NÓS</p><h2>Ferramentas para quem constrói, reforma e faz acontecer.</h2><p>O ${safe(STORE.name)} vende ferramentas elétricas, kits e acessórios para obra, oficina e uso doméstico, com frete grátis para todo o Brasil e atendimento de verdade antes e depois da compra.</p><a class="outline" href="#/sobre-nos">Conhecer a loja</a> <a class="outline" href="#/meus-pedidos">Acompanhar meu pedido</a></div></section>`;

const paymentBadges = () => `<div class="pay-badges">${STORE.acceptsPix ? `<span class="pix-badge" title="Aceitamos Pix"><img src="assets/brand/pix-logo.png" alt="Pix" width="120" height="44" loading="lazy"></span>` : ''}${STORE.acceptsCard ? '<span>Visa</span><span>Mastercard</span><span>Elo</span>' : ''}</div>`;

const footer = () => `<footer><div class="wrap footer-grid"><div>${logo()}<p>${safe(STORE.tagline)}</p><h3>FORMAS DE PAGAMENTO</h3>${paymentBadges()}</div><div><h3>INSTITUCIONAL</h3><a href="#/sobre-nos">Sobre nós</a><a href="#/atendimento">Atendimento</a><a href="#/meus-pedidos">Acompanhar pedido</a>${STORE.reclameAquiUrl ? `<a href="${safe(STORE.reclameAquiUrl)}" target="_blank" rel="noopener">Reclame Aqui</a>` : ''}</div><div><h3>TERMOS E POLÍTICAS</h3>${policies.map(([id,label])=>`<a href="#/${id}">${label}</a>`).join('')}</div><div><h3>ATENDIMENTO</h3>${waNumber ? `<a href="${waLink('Olá! Vim pelo site do Lojão do Barateiro.')}" target="_blank" rel="noopener">WhatsApp ${waDisplay()}</a>` : ''}${STORE.email ? `<a href="mailto:${safe(STORE.email)}">${safe(STORE.email)}</a>` : ''}<p class="hours">${safe(STORE.hours)}</p></div></div><div class="wrap legal">${legalField('Razão social', STORE.legalName)}${legalField('CNPJ', STORE.cnpj)}${(STORE.address ? legalField('Endereço', STORE.address) : '')}<p>© ${new Date().getFullYear()} ${safe(STORE.name)}. Todos os direitos reservados.</p></div></footer>`;

const waFloat = () => (waNumber || isDev) ? `<a class="wa-float" href="${waLink('Olá! Tenho uma dúvida sobre um produto.')}" ${waNumber ? 'target="_blank" rel="noopener"' : ''} aria-label="Falar no WhatsApp" title="${waNumber ? 'Falar no WhatsApp' : 'Configure STORE.whatsapp'}">${waIcon}</a>` : '';

const card = p => `<article class="card"><a href="${productLink(p)}"><div class="cover"><img loading="lazy" src="${productImage(p.image)}" alt="${safe(p.name)}">${STORE.bestsellers.includes(p.id) ? '<span class="badge">MAIS VENDIDO</span>' : ''}<span class="off">-${pct(p.price,p.old)}%</span></div></a><div class="copy"><a class="name" href="${productLink(p)}">${safe(p.name)}</a><div class="prices"><s>${format(p.old)}</s><b>${pct(p.price,p.old)}% OFF</b></div>${priceText(p.price)}<div class="install">${payText(p.price)}</div><b class="green shipping">FRETE GRÁTIS</b>${p.variants.length>1 ? `<a class="outline wide" href="${productLink(p)}">Escolher opção</a>` : `<button class="outline wide" data-action="add" data-id="${p.id}">🛒 Adicionar</button>`}</div></article>`;

function hero(){
  const featured = lookup('parafusadeira');
  return `<section class="hero"><div class="wrap hero-inner"><div class="hero-copy">${promoActive() ? `<span class="hero-tag">${safe(STORE.promoName)} · ofertas até ${promoDate} às 23h59</span>` : ''}<h1>Ferramentas de verdade, com preço de <b>Barateiro</b>.</h1><ul class="hero-points"><li>✓ Frete grátis para todo o Brasil</li><li>✓ ${STORE.returnDays} dias para devolver</li><li>✓ Pagamento seguro via Pix</li></ul><a class="action hero-cta" href="#/categoria/ofertas">Ver ofertas ${promoActive() ? 'da ' + safe(STORE.promoName) : ''} ›</a></div>${featured ? `<a class="hero-product" href="${productLink(featured)}"><img src="${productImage(featured.image)}" alt="${safe(featured.name)}"><span>A partir de <b>${format(featured.price)}</b></span></a>` : ''}</div></section>`;
}

function listing(category,query) {
  const index = categories.findIndex(([id])=>id===category);
  const title = query ? 'Resultados para “' + query + '”' : categories[index]?.[1] || 'Ofertas do dia';
  const list = products.filter(p => (index<=0 || p.category===index) && (!query || fold(p.name).includes(fold(query))));
  const home = !category && !query;
  return `${header(query)}${home ? hero() : ''}<nav class="cats" aria-label="Categorias"><div class="wrap catrow">${categoryLinks()}</div></nav>${home ? trustBar() : ''}<main class="wrap listing"><div class="section-head"><h2>${safe(title)}</h2>${home ? '<a href="#/categoria/ofertas">Ver todas ›</a>' : ''}</div>${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : '<p class="empty">Nenhum produto encontrado.</p>'}</main><div class="wrap">${about()}</div>${footer()}${waFloat()}`;
}

function photos(p){
  if (p.id === 'escada-telescopica') return [p.image, ...Array.from({length:8}, (_, i) => `${p.id}-${i+2}.webp`)];
  return [p.image, ...(extraProductPhotos[p.id] || [])];
}

const faq = () => [
  ['Qual é o prazo de entrega?', `O frete é grátis para todo o Brasil. ${STORE.dispatchText}. A entrega leva em média ${STORE.shippingDays}, e você recebe o código de rastreio por e-mail${waNumber ? ' e WhatsApp' : ''}. Consulte o prazo exato para o seu CEP no botão "Calcular prazo de entrega".`],
  ['E se eu não gostar ou o produto vier com defeito?', `Você tem ${STORE.returnDays} dias corridos após o recebimento para desistir da compra, sem precisar justificar, e nós pagamos o frete de volta. Em caso de defeito de fabricação, vale a ${STORE.warrantyText.toLowerCase()}.`],
  ['O pagamento é seguro?', STORE.acceptsCard ? 'Sim. O pagamento é processado por um intermediador de pagamentos certificado. Não armazenamos dados do seu cartão.' : 'Sim. O pagamento é feito por Pix, com aprovação imediata. Guarde o comprovante: se o pagamento não for confirmado em alguns minutos, é só enviar o comprovante e liberamos seu pedido na hora.'],
  ['Como falo com a loja?', `${waNumber ? `Pelo WhatsApp ${waDisplay()}` : ''}${waNumber && STORE.email ? ' ou ' : ''}${STORE.email ? `pelo e-mail ${safe(STORE.email)}` : ''}${waNumber || STORE.email ? '. ' : ''}Horário: ${safe(STORE.hours)}.`]
];

// Vendidos, nota e ranking: SÓ com números reais da sua loja (PRODUCT_INFO[id].stats em catalog.js).
// Sem dados reais, em produção não aparece nada; no localhost aparece um exemplo marcado.
const fmtInt = n => Number(n).toLocaleString('pt-BR');
const stars = r => { const full = Math.round(Number(r)); return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full); };
function proofBlock(p, pi){
  const real = pi.stats;
  const st = real || (isDev ? { sold: 120, rating: 4.8, reviews: 37, rank: '1º em ' + (categories[p.category]?.[1] || 'sua categoria') } : null);
  const best = STORE.bestsellers.includes(p.id) || (!real && isDev);
  if (!st) return '<div class="product-meta"><span>Novo</span></div>';
  const demo = !real;
  return `<div class="proof ${demo ? 'proof-demo' : ''}">
    <div class="product-meta"><span>Novo${st.sold ? ` | +${fmtInt(st.sold)} vendidos` : ''}</span>${st.rating ? `<span class="product-rating">${String(st.rating).replace('.', ',')} <span aria-hidden="true">${stars(st.rating)}</span> <small>(${fmtInt(st.reviews || 0)})</small></span>` : ''}</div>
    ${best || st.rank ? `<div class="product-rank">${best ? '<strong>MAIS VENDIDO</strong>' : ''} ${st.rank ? `<span>${safe(st.rank)}</span>` : ''}${demo ? '<small>Exemplo (só no localhost): preencha <code>stats</code> em PRODUCT_INFO com seus números reais</small>' : ''}</div>` : ''}
  </div>`;
}

function detail(p){
  const images = photos(p);
  const [label, price] = p.variants[variant];
  const hasOptions = p.variants.length > 1;
  const pi = info[p.id] || {};
  const buyButton = classes => `<button class="${classes}" data-action="buy" data-id="${p.id}">Comprar agora</button>`;
  const options = hasOptions ? `<p>Opção: <strong>${safe(label)}</strong></p><div class="variants" aria-label="Opções disponíveis">${p.variants.map(([name,cost],i)=>`<button class="outline" data-action="variant" data-index="${i}" aria-pressed="${i===variant}">${safe(name)}<br>${format(cost)}</button>`).join('')}</div>` : '';
  const description = pi.description
    ? `<p>${safe(pi.description)}</p>`
    : `<p>${safe(p.name)}</p>${isDev ? `<p class="todo-box">Adicione a descrição, a ficha técnica e o conteúdo da caixa deste produto em <code>catalog.js</code> (objeto <code>PRODUCT_INFO</code>).</p>` : ''}`;
  const list = (title, items) => items?.length ? `<h2>${title}</h2><ul>${items.map(i => `<li>${safe(i)}</li>`).join('')}</ul>` : '';
  const specs = pi.specs?.length ? `<h2>Ficha técnica</h2><table class="specs">${pi.specs.map(([k,v]) => `<tr><th>${safe(k)}</th><td>${safe(v)}</td></tr>`).join('')}</table>` : '';
  return `${header()}<main class="wrap product"><div class="product-layout">
    <div class="product-title">
      <p><a class="link" href="#/">‹ &nbsp; Voltar para a página inicial</a></p>
      ${proofBlock(p, pi)}
    </div>
    <section class="panel gallery" aria-label="Fotos do produto">
      <h1 class="gallery-title">${safe(p.name)}</h1>
      <div class="gallery-main">
        <img src="${productImage(images[photo])}" alt="${safe(p.name)} — foto ${photo+1}">
        ${images.length>1 ? `<span class="photo-counter">${photo+1}/${images.length}</span><div class="arrows"><button aria-label="Foto anterior" data-action="photo" data-index="${(photo+images.length-1)%images.length}">‹</button><button aria-label="Próxima foto" data-action="photo" data-index="${(photo+1)%images.length}">›</button></div>` : ''}
      </div>
      ${images.length>1 ? `<div class="thumbs">${images.map((image,i)=>`<button data-action="photo" data-index="${i}" aria-label="Ver imagem ${i+1}" aria-pressed="${i===photo}"><img loading="lazy" src="${productImage(image)}" alt=""></button>`).join('')}</div>` : ''}
    </section>
    <section class="panel purchase">
      ${promoActive() ? `<span class="bf">◆ ${safe(STORE.promoName.toUpperCase())} · até ${promoDate}</span>` : ''}
      <div class="prices"><s>${format(p.old)}</s><b>${pct(price,p.old)}% OFF</b></div>
      ${priceText(price)}<p>${payText(price)}</p>
      ${options}
      <div class="ship-box">${icons.truck}<div><strong>Frete grátis para todo o Brasil</strong>${savedCep ? `<span class="same-day">⚡ ${safe(STORE.dispatchShort)}</span><small>Chega entre <b>${deliveryWindow()}</b> em ${safe(cepPlace())} · com rastreio</small><button class="link-btn" data-action="cep">Trocar CEP (${safe(savedCep.cep)})</button>` : `<span class="same-day">⚡ ${safe(STORE.dispatchShort)}</span><small>Entrega em ${STORE.shippingDays} · com código de rastreio</small><button class="link-btn" data-action="cep">Calcular prazo para o meu CEP</button>`}</div></div>
      <label>Quantidade: <select id="quantity">${Array.from({length:10},(_,i)=>`<option ${quantity===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>
      ${buyButton('action wide')}
      <button class="outline wide" data-action="add" data-id="${p.id}">Adicionar ao carrinho</button>
      <ul class="buy-trust">
        <li>${icons.lock}<span><b>Compra segura.</b> Pagamento ${STORE.acceptsCard ? 'via Pix ou cartão' : 'via Pix'}, com recebedor identificado.</span></li>
        <li>${icons.back}<span><b>Reembolso no Pix na hora.</b> Não ficou satisfeito? Você recebe seu dinheiro de volta na mesma hora.</span></li>
        <li>${icons.shield}<span><b>${safe(STORE.warrantyText)}.</b></span></li>
      </ul>
      ${(waNumber || isDev) ? `<a class="wa-inline" href="${waLink('Olá! Tenho uma dúvida sobre: ' + p.name)}" ${waNumber ? 'target="_blank" rel="noopener"' : ''}>${waIcon} Dúvida sobre este produto? Fale no WhatsApp</a>` : ''}
    </section>
  </div>
  <section class="panel content product-content">
    <h2>Informações da loja</h2>
    <p class="store-line">${safe(STORE.name)}${STORE.cnpj ? ` · CNPJ ${safe(STORE.cnpj)}` : ''}</p>
    <div class="product-services">
      <button class="outline" data-action="payment">${icons.lock} Meios de pagamento</button>
      <button class="outline" data-action="info" data-id="envio">${icons.truck} Política de envio</button>
      <button class="outline" data-action="info" data-id="trocas">${icons.back} Trocas e devoluções</button>
      <button class="outline" data-action="info" data-id="atendimento">${icons.chat} Atendimento</button>
    </div>
    ${list('O que você precisa saber', pi.highlights)}
    <h2>Descrição</h2>${description}
    ${list('O que vem na caixa', pi.box)}
    ${specs}
    <h2>Perguntas e respostas</h2>
    ${hasOptions ? `<details><summary>Quais opções estão disponíveis?</summary><p>${p.variants.map(([name,cost])=>`${safe(name)} (${format(cost)})`).join(', ')}.</p></details>` : ''}
    ${(pi.faq || []).map(([q,a]) => `<details><summary>${safe(q)}</summary><p>${safe(a)}</p></details>`).join('')}
    ${faq().map(([q,a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
  </section>
  ${about()}</main>${footer()}
  <aside class="mobile-buy" aria-label="Compra rápida">
    <div>
      <strong class="mobile-shipping">FRETE GRÁTIS · ${STORE.returnDays} DIAS P/ DEVOLVER</strong>
      <div class="mobile-price"><s>${format(p.old)}</s><strong>${format(price)}</strong></div>
      ${hasOptions ? `<div class="mobile-option">Opção: ${safe(label)} <button data-action="options">Trocar ⌃</button></div>` : ''}
    </div>
    <div class="mobile-actions"><button class="mobile-add" data-action="add" data-id="${p.id}" aria-label="Adicionar ao carrinho">${cartIcon}</button>${buyButton('mobile-buy-button')}</div>
  </aside>`;
}

function lines(){
  return cart.map((item,index)=>{
    const p=lookup(item.id);
    const [label,price]=p.variants[item.variant];
    return `<article class="line"><img src="${productImage(p.image)}" alt=""><div><strong>${safe(p.name)}</strong>${label!=='Padrão' ? `<p>Opção: ${safe(label)}</p>` : ''}<p><button data-action="minus" data-index="${index}" aria-label="Diminuir quantidade" ${item.qty===1?'disabled':''}>−</button>　${item.qty}　<button data-action="plus" data-index="${index}" aria-label="Aumentar quantidade" ${item.qty===99?'disabled':''}>+</button></p><b>${format(price*item.qty)}</b></div><button data-action="remove" data-index="${index}" aria-label="Remover item">×</button></article>`;
  }).join('');
}
function show(title,content,drawer=false){
  overlay.className=drawer?'drawer':'';
  overlay.setAttribute('aria-label',title);
  overlay.innerHTML=`<button data-action="close" class="close" aria-label="Fechar">×</button><h2>${title}</h2>${content}`;
  if(!overlay.open) overlay.showModal();
}
function showMenu(){
  const n = count();
  const quick = [['home','Início','#/'],['tag','Ofertas','#/categoria/ofertas'],['truck','Pedidos','#/meus-pedidos'],['chat','Ajuda','#/atendimento']].map(([i,l,h])=>`<a href="${h}"><span>${icons[i]}</span>${l}</a>`).join('');
  const item = (i,l,attr) => `<${attr.startsWith('href')?'a':'button'} class="menu-item" ${attr}><span class="mi">${icons[i]}${i==='cart'&&n?`<em>${n}</em>`:''}</span>${l}<i>›</i></${attr.startsWith('href')?'a':'button'}>`;
  overlay.className='drawer left menu';
  overlay.setAttribute('aria-label','Menu');
  overlay.innerHTML=`<button data-action="close" class="close" aria-label="Fechar">×</button><div class="menu-top"><h2>Olá! 👋</h2><p>Bem-vindo(a) ao ${safe(STORE.name)}</p><div class="quick">${quick}</div></div><nav class="menu-list">${item('cart','Carrinho','data-action="cart"')}${item('tag','Ofertas','href="#/categoria/ofertas"')}${categories.slice(1).map(([id,label])=>item('box',label,`href="#/categoria/${id}"`)).join('')}${item('truck','Acompanhar meu pedido','href="#/meus-pedidos"')}${item('chat','Atendimento','href="#/atendimento"')}</nav>`;
  if(!overlay.open) overlay.showModal();
}
function showCart(){
  show('Meu carrinho',`${lines() || '<p class="empty">Seu carrinho está vazio.</p>'}<div class="total"><b>Total</b><b>${format(sum())}</b></div><p class="green">✓ Frete grátis · ✓ ${STORE.returnDays} dias para devolver</p><button class="action wide" data-action="finalize" ${cart.length?'':'disabled'}>Finalizar compra</button><button class="outline wide" data-action="close">Continuar comprando</button>`,true);
}

// ---------- Máscaras e validação ----------
function formatCPF(val) {
  const v = String(val).replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return v;
}
function validCPF(val) {
  const c = String(val).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
function formatPhone(val) {
  let v = String(val).replace(/\D/g, '');
  if (v.startsWith('55') && v.length > 11) v = v.slice(2);
  v = v.slice(0, 11);
  if (v.length > 6) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  if (v.length > 2) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  return v;
}
function formatCEP(val) {
  const v = String(val).replace(/\D/g, '').slice(0, 8);
  return v.length > 5 ? v.replace(/(\d{5})(\d{1,3})/, '$1-$2') : v;
}
async function searchCEP(cep) {
  const clean = String(cep).replace(/\D/g, '');
  if (clean.length !== 8) return;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return notify('CEP não encontrado. Confira os números.');
    checkoutData.address = data.logradouro || checkoutData.address;
    checkoutData.neighborhood = data.bairro || checkoutData.neighborhood;
    checkoutData.city = data.localidade || checkoutData.city;
    checkoutData.state = data.uf || checkoutData.state;
    applyCep({ cep: formatCEP(clean), street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf });
    render();
    document.getElementById('input-number')?.focus();
  } catch {}
}

// ---------- Checkout próprio da loja ----------
const field = (id, label, bind, attrs = '') => `<div class="co-field"><label for="${id}">${label}</label><input id="${id}" data-bind="${bind}" value="${safe(checkoutData[bind])}" ${attrs}></div>`;

function checkout() {
  const subtotal = sum();
  const shipFee = shipMethod === 'full' && fullAvailable() ? fullFee(subtotal) : 0;
  const total = Math.round((subtotal + shipFee) * 100) / 100;
  const saved = sumOld() - subtotal;
  const stepsDef = [['user','Identificação'],['truck','Entrega'],['card','Pagamento']];
  const stepper = `<ol class="co-steps">${stepsDef.map(([i,l],n)=>`<li class="${n<step?'done':''} ${n===step?'current':''}"><span>${icons[i]}</span>${l}</li>`).join('')}</ol>`;

  const items = cart.map((item, idx) => {
    const p = lookup(item.id);
    const [label, price] = p.variants[item.variant];
    return `<div class="co-item"><img src="${productImage(p.image)}" alt=""><div><strong>${safe(p.name)}</strong>${label !== 'Padrão' ? `<small>Opção: ${safe(label)}</small>` : ''}<div class="co-item-row">${step < 3 ? `<div class="co-qty"><button data-action="minus" data-index="${idx}" ${item.qty <= 1 ? 'disabled' : ''} aria-label="Diminuir">−</button><span>${item.qty}</span><button data-action="plus" data-index="${idx}" aria-label="Aumentar">+</button></div>` : `<span>${item.qty} un.</span>`}<b>${format(price * item.qty)}</b></div></div>${step < 3 ? `<button class="co-remove" data-action="remove" data-index="${idx}" aria-label="Remover item">×</button>` : ''}</div>`;
  }).join('');

  const summary = `<section class="co-card"><button class="co-summary-toggle" data-action="toggle-summary" aria-expanded="${summaryOpen}"><span>${icons.box} Resumo do pedido</span><b>${format(total)} ${summaryOpen ? '▴' : '▾'}</b></button>${summaryOpen ? `<div class="co-items">${items}</div><dl class="co-totals"><div><dt>Subtotal</dt><dd>${format(subtotal)}</dd></div><div><dt>Frete${shipFee ? ` (${safe(FULL.label)})` : ''}</dt><dd class="${shipFee ? '' : 'green'}">${shipFee ? format(shipFee) : 'Grátis'}</dd></div>${saved > 0 ? `<div class="co-saving"><dt>Você economiza</dt><dd>${format(saved)}</dd></div>` : ''}</dl><div class="co-total"><span>Total</span><strong>${format(total)}</strong></div>` : ''}</section>`;

  let form = '';
  if (!cart.length && step < 3) {
    form = `<section class="co-card"><h2>Seu carrinho está vazio</h2><p>Escolha um produto para continuar.</p><a class="action wide" href="#/">Ver ofertas</a></section>`;
  } else if (step === 0) {
    form = `<section class="co-card"><div class="co-card-head"><h2>Seus dados</h2><span>1 de 3</span></div><p class="co-sub">Usamos seus dados apenas para emitir a nota fiscal e entregar o pedido.</p>
      ${field('input-name','Nome completo','name','autocomplete="name" required')}
      ${field('input-email','E-mail (enviaremos a confirmação e o rastreio)','email','type="email" autocomplete="email" inputmode="email" required')}
      ${field('input-cpf','CPF (obrigatório para a nota fiscal)','cpf','inputmode="numeric" maxlength="14" placeholder="000.000.000-00" required')}
      ${field('input-phone','Celular / WhatsApp','phone','type="tel" autocomplete="tel" inputmode="tel" maxlength="15" placeholder="(00) 00000-0000" required')}
      <button type="button" class="action wide co-next" data-action="go-step-2">Continuar para a entrega</button></section>`;
  } else if (step === 1) {
    form = `<section class="co-card"><div class="co-card-head"><h2>Entrega</h2><span>2 de 3</span></div><p class="co-sub">Digite o CEP que preenchemos o endereço para você.</p>
      ${field('input-cep','CEP','cep','inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" required')}
      ${field('input-address','Rua / Avenida','address','autocomplete="address-line1" required')}
      <div class="co-row">${field('input-number','Número','number','inputmode="numeric" required')}${field('input-complement','Complemento (opcional)','complement','placeholder="Apto, bloco"')}</div>
      ${field('input-neighborhood','Bairro','neighborhood','required')}
      <div class="co-row">${field('input-city','Cidade','city','required')}${field('input-state','UF','state','maxlength="2" required')}</div>
      <p class="co-ship-title">Escolha o envio</p>
      <button type="button" class="co-ship-option ${shipMethod === 'free' || !fullAvailable() ? 'selected' : ''}" data-action="ship" data-id="free"><span class="co-radio" aria-hidden="true"></span><div><strong>Frete grátis com rastreio</strong><small>Chega entre ${deliveryWindowLong()}</small></div><b class="green">Grátis</b></button>
      ${FULL.enabled ? (fullAvailable()
        ? `<button type="button" class="co-ship-option full ${shipMethod === 'full' ? 'selected' : ''}" data-action="ship" data-id="full"><span class="co-radio" aria-hidden="true"></span><div><strong><span class="bolt">⚡</span> ${fullEta()} · ${safe(FULL.label)}</strong><small>Entrega expressa ${longDay(addBusinessDays(1))}</small></div><b>${format(fullFee(sum()))}</b></button>`
        : `<div class="co-ship-option full disabled"><span class="co-radio" aria-hidden="true"></span><div><strong><span class="bolt">⚡</span> ${safe(FULL.label)}</strong><small>Indisponível para o seu CEP</small></div></div>`) : ''}
      <button type="button" class="action wide co-next" data-action="go-step-3">Continuar para o pagamento</button>
      <button type="button" class="co-back" data-action="back-step">‹ Voltar</button></section>`;
  } else if (step === 2) {
    form = `<section class="co-card"><div class="co-card-head"><h2>Pagamento</h2><span>3 de 3</span></div>
      <div class="co-pay-option selected">${pixIcon}<div><strong>Pix (Aprovação Imediata)</strong><small>Envio prioritário • Código gerado na próxima tela</small></div></div>
      ${STORE.acceptsCard ? `<div class="co-pay-option">${icons.card}<div><strong>Cartão de crédito</strong><small>Em até ${STORE.maxInstallments}x sem juros</small></div></div>` : ''}
      <p class="co-note">${icons.shield} <span><b>Guarde o comprovante do Pix.</b> Se o pagamento não for confirmado em alguns minutos, é só enviar o comprovante na próxima tela e liberamos seu pedido na hora.</span></p>
      <button type="button" class="action wide co-next" data-action="finalize-pix" ${placing ? 'disabled' : ''}>${placing ? 'Gerando seu Pix…' : `Gerar Pix de ${format(total)}`}</button>
      <button type="button" class="co-back" data-action="back-step">‹ Voltar</button></section>`;
  } else if (step === 3 && lastOrder) {
    const pay = lastOrder.payment || {};
    const paid = pay.status === 'approved' || lastOrder.status === 'pago';
    const shortId = String(lastOrder.id).slice(0, 8).toUpperCase();
    if (paid) {
      form = `<section class="co-card co-done"><h2 class="green">✓ Pagamento confirmado!</h2><p>Pedido <b>#${shortId}</b>. Você vai receber o código de rastreio em ${safe(checkoutData.email || 'seu e-mail')}.</p><a class="action wide" href="#/">Voltar à loja</a></section>`;
    } else if (pay.qrCode) {
      form = `<section class="co-card co-done"><h2>Pedido #${shortId} reservado</h2><p class="co-sub">Pague ${format(lastOrder.total)} com Pix para confirmar. Assim que o pagamento cair, esta tela atualiza sozinha.</p>
        ${pay.qrCodeBase64 ? `<img class="co-qr" src="data:image/png;base64,${pay.qrCodeBase64}" alt="QR Code Pix" width="200" height="200">` : ''}
        <p class="co-sub">Ou copie o código Pix e cole no app do seu banco:</p><div class="co-pix-code">${safe(pay.qrCode)}</div>
        <button type="button" class="action wide" data-action="copy-pix">Copiar código Pix</button>
        <p class="co-note">${icons.shield} <span><b>Já pagou e a tela não atualizou?</b> Às vezes o banco demora alguns minutos para avisar. Envie o comprovante e liberamos seu pedido na hora.</span></p>
        <a class="outline wide co-receipt" href="${waLink('Olá! Segue o comprovante do Pix do pedido #' + shortId + '.')}" ${waNumber ? 'target="_blank" rel="noopener"' : ''}>${waIcon} Enviar comprovante do pedido #${shortId}</a></section>`;
    } else {
      form = `<section class="co-card co-done"><h2>Pedido #${shortId} recebido</h2>${isDev
        ? `<p class="todo-box">O pagamento ainda não está configurado. Defina a variável <code>MP_ACCESS_TOKEN</code> (token de produção da SUA conta Mercado Pago) para gerar o Pix real. Veja o README.</p>`
        : `<p>Não conseguimos gerar o Pix automaticamente agora. Fale com a gente ${waNumber ? `pelo <a class="link" href="${waLink('Olá! Preciso pagar o pedido #' + shortId)}" target="_blank" rel="noopener">WhatsApp</a>` : `pelo e-mail ${safe(STORE.email)}`} informando o número do pedido.</p>`}
        <a class="outline wide" href="#/">Voltar à loja</a></section>`;
    }
  }

  const foot = `<footer class="co-foot"><div class="co-foot-pills"><span>${icons.lock} Dados protegidos</span><span>${icons.back} ${STORE.returnDays} dias para devolver</span><span>${icons.shield} ${safe(STORE.warrantyText)}</span></div><div class="co-legal">${legalField('Razão social', STORE.legalName)}${legalField('CNPJ', STORE.cnpj)}${(STORE.address ? legalField('Endereço', STORE.address) : '')}${waNumber ? `<p>Dúvidas: <a href="${waLink('Olá! Tenho uma dúvida sobre o pagamento.')}" target="_blank" rel="noopener">WhatsApp ${waDisplay()}</a></p>` : ''}</div>${paymentBadges()}<p class="co-links"><a href="#/trocas-e-devolucoes">Trocas e devoluções</a> · <a href="#/privacidade">Privacidade</a> · <a href="#/termos">Termos</a></p></footer>`;

  return `${devBanner()}<div class="co-page"><div class="co-top"><header class="co-header"><div class="co-header-inner">${logo()}<span class="co-secure">${icons.lock} Pagamento seguro</span></div></header>
    ${promoActive() && step < 3 ? `<div class="co-promo">Preços de ${safe(STORE.promoName)} válidos até ${promoDate} às 23h59</div>` : ''}</div>
    <main class="co-main">${step < 3 ? stepper : ''}${step < 3 ? `<div class="co-grid"><div>${form}</div><aside>${summary}</aside></div>` : `<div class="co-single">${form}</div>`}</main>${foot}</div>`;
}

// ---------- Páginas institucionais ----------
const contactLine = () => [waNumber && `WhatsApp ${waDisplay()}`, STORE.email && `e-mail ${STORE.email}`].filter(Boolean).join(' ou ') || 'nossos canais de atendimento';
const pages = {
  'sobre-nos': ['Sobre nós', () => `${storefront('storefront-page')}<p>O <b>${safe(STORE.name)}</b> é uma loja de ferramentas elétricas, kits e acessórios para obra, oficina e uso doméstico, que vende online para todo o Brasil.</p><p>Nosso compromisso é simples: preço justo, frete grátis para todo o Brasil, prazo de entrega informado antes da compra e atendimento por gente de verdade.</p><ul class="about-facts">${trustItems().map(([i,t,s],n) => `<li class="reveal" style="--d:${n*90}ms"><span>${icons[i]}</span><div><strong>${t}</strong><small>${safe(s)}</small></div></li>`).join('')}</ul><h2>Dados da empresa</h2><div class="legal-box">${legalField('Razão social', STORE.legalName)}${legalField('CNPJ', STORE.cnpj)}${(STORE.address ? legalField('Endereço', STORE.address) : '')}</div>${isDev ? '<p class="todo-box">Dica: adicione também fotos do estoque, da equipe embalando pedidos e a história da loja. Isso aumenta muito a confiança.</p>' : ''}`],
  'atendimento': ['Atendimento', () => `<p>Fale com a gente antes ou depois da compra. Respondemos ${safe(STORE.hours.toLowerCase())}.</p><div class="contact-cards">${waNumber || isDev ? `<a class="contact-card" href="${waLink('Olá! Vim pelo site.')}" ${waNumber ? 'target="_blank" rel="noopener"' : ''}>${waIcon}<strong>WhatsApp</strong><span>${waNumber ? waDisplay() : '<mark class="todo">configure</mark>'}</span></a>` : ''}${STORE.email || isDev ? `<a class="contact-card" href="${STORE.email ? 'mailto:' + safe(STORE.email) : '#/atendimento'}">${icons.chat}<strong>E-mail</strong><span>${STORE.email ? safe(STORE.email) : '<mark class="todo">configure</mark>'}</span></a>` : ''}<a class="contact-card" href="#/meus-pedidos">${icons.truck}<strong>Meu pedido</strong><span>Consultar status</span></a></div>`],
  'meus-pedidos': ['Acompanhar meu pedido', () => `<p>Digite o número do pedido que você recebeu por e-mail.</p><form data-form="order" class="order-form"><input name="order" required placeholder="Número do pedido" aria-label="Número do pedido"><button class="action">Consultar</button></form><div id="order-result"></div>`],
  'trocas-e-devolucoes': ['Trocas e devoluções', () => `<h2>Arrependimento: ${STORE.returnDays} dias</h2><p>Você pode desistir da compra em até <b>${STORE.returnDays} dias corridos</b> após receber o produto, sem precisar justificar (Código de Defesa do Consumidor, art. 49). O frete de devolução é por nossa conta.</p><h2>Defeito de fabricação</h2><p>Produtos com defeito têm ${safe(STORE.warrantyText.toLowerCase())}, contados a partir do recebimento. Nesse caso, trocamos o produto ou devolvemos o valor pago, e o frete também é por nossa conta.</p><h2>Reembolso no Pix na hora</h2><p>Não ficou satisfeito com o produto? É só pedir: <b>o dinheiro volta para a sua conta via Pix na mesma hora</b>, sem burocracia. ${STORE.acceptsCard ? 'Compras no cartão: o estorno é solicitado na hora e aparece na fatura conforme o prazo da operadora.' : ''}</p><h2>Como solicitar</h2><ol><li>Fale com a gente pelo ${safe(contactLine())} com o número do pedido.</li><li>Fazemos o reembolso no Pix na mesma hora.</li><li>Enviamos a etiqueta para você devolver o produto, sem custo.</li></ol>`],
  'politica-de-reembolso': ['Política de reembolso', () => `<p>O reembolso é feito na mesma forma de pagamento usada na compra.</p><ul><li><b>Pix:</b> reembolso na mesma hora em que você pedir. Não ficou satisfeito? O dinheiro volta na hora, sem burocracia.</li>${STORE.acceptsCard ? '<li><b>Cartão de crédito:</b> estorno solicitado na hora; aparece na fatura conforme o prazo da operadora.</li>' : ''}<li><b>Pedido não entregue:</b> se o pedido não chegar no prazo informado e não houver solução, devolvemos 100% do valor.</li></ul><p>Para solicitar, fale com a gente pelo ${safe(contactLine())}.</p>`],
  'politica-de-envio': ['Política de envio', () => `<ul><li><b>Frete:</b> grátis para todo o Brasil.</li><li><b>Postagem:</b> ${safe(STORE.dispatchText.toLowerCase())}.</li><li><b>Prazo de entrega:</b> ${STORE.shippingDays} após a postagem, conforme a região. Consulte o prazo para o seu CEP na página do produto.</li><li><b>Rastreio:</b> você recebe o código de rastreio por e-mail${waNumber ? ' e WhatsApp' : ''} assim que o pedido for postado.</li><li><b>Atraso ou extravio:</b> fale com a gente. Se o pedido não for localizado, reenviamos o produto ou devolvemos o valor.</li></ul>`],
  'privacidade': ['Política de privacidade', () => `<p>Seguimos a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p><h2>Quais dados coletamos</h2><p>Nome, e-mail, CPF, telefone e endereço, informados por você no checkout.</p><h2>Para que usamos</h2><p>Somente para processar o pagamento, emitir a nota fiscal, entregar o pedido e falar com você sobre ele. Não vendemos nem compartilhamos seus dados com terceiros, exceto com o intermediador de pagamento e a transportadora, na medida necessária.</p><h2>Seus direitos</h2><p>Você pode pedir acesso, correção ou exclusão dos seus dados pelo ${safe(contactLine())}.</p>`],
  'termos': ['Termos de uso', () => `<p>Ao comprar no ${safe(STORE.name)}, você concorda com estes termos.</p><ul><li>Preços e estoque podem mudar sem aviso, mas o preço confirmado no pedido é mantido.</li><li>Promoções têm prazo informado na página e valem enquanto durarem os estoques.</li><li>O pedido é confirmado após a aprovação do pagamento.</li><li>Trocas, devoluções e garantia seguem a nossa <a class="link" href="#/trocas-e-devolucoes">política de trocas</a> e o Código de Defesa do Consumidor.</li></ul><div class="legal-box">${legalField('Razão social', STORE.legalName)}${legalField('CNPJ', STORE.cnpj)}${(STORE.address ? legalField('Endereço', STORE.address) : '')}</div>`]
};

// Entrada suave, uma única vez, quando o elemento aparece na tela.
// Quem ativou "reduzir movimento" no aparelho vê tudo parado (ver CSS).
let revealObserver;
function animateIn(){
  const els = document.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) return els.forEach(el => el.classList.add('in'));
  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
  }), { threshold: 0.15 });
  els.forEach(el => revealObserver.observe(el));
}
function render(){
  clearInterval(pollTimer);
  const [path,query] = (location.hash.slice(1)||'/').split('?');
  const [,section,slug] = path.split('/');
  activeProduct = section==='produto' ? lookup(slug) : undefined;
  if(activeProduct) app.innerHTML=detail(activeProduct);
  else if(section==='checkout') { app.innerHTML=checkout(); if (step === 3) startPolling(); }
  else if(!section || section==='categoria' || section==='busca') app.innerHTML=listing(slug,new URLSearchParams(query).get('q'));
  else {
    const page = pages[section];
    app.innerHTML=`${header()}<main class="wrap listing"><section class="panel content page"><h1>${page ? page[0] : 'Página não encontrada'}</h1>${page ? page[1]() : '<p>Volte à loja para continuar navegando.</p>'}<p><a class="link" href="#/">‹ Voltar à loja</a></p></section></main>${footer()}${waFloat()}`;
  }
  const page = pages[section];
  animateIn();
  document.title = activeProduct ? activeProduct.name + ' | ' + STORE.name
    : section === 'checkout' ? 'Finalizar compra | ' + STORE.name
    : page ? page[0] + ' | ' + STORE.name
    : STORE.name + ' | Ferramentas com frete grátis';
}
function notify(message){
  clearTimeout(statusTimer);
  status.textContent=message;
  statusTimer=setTimeout(()=>{status.textContent='';},2600);
}
function startPolling(){
  if (!lastOrder?.payment?.qrCode) return;
  pollTimer = setInterval(async () => {
    try {
      const r = await fetch('/api/orders/' + lastOrder.id + (lastOrder.payment?.id ? '?pid=' + encodeURIComponent(lastOrder.payment.id) : ''));
      const d = await r.json();
      if (r.ok && d.status === 'pago') { lastOrder.status = 'pago'; render(); }
    } catch {}
  }, 5000);
}

async function placeOrder(){
  placing = true; render();
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart,
        customer: { name: checkoutData.name, email: checkoutData.email, cpf: checkoutData.cpf, phone: checkoutData.phone },
        address: { cep: checkoutData.cep, street: checkoutData.address, number: checkoutData.number, complement: checkoutData.complement, district: checkoutData.neighborhood, city: checkoutData.city, state: checkoutData.state },
        paymentMethod: 'pix',
        shippingMethod: shipMethod === 'full' && fullAvailable() ? 'full' : 'free'
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar o pedido');
    lastOrder = data;
    cart = []; save();
    step = 3;
  } catch (error) {
    notify(error.message === 'Failed to fetch' ? 'Sem conexão com o servidor. Tente de novo.' : error.message);
  }
  placing = false; render(); window.scrollTo(0, 0);
}

const need = (ids) => {
  for (const [id, msg, ok] of ids) {
    const el = document.getElementById(id);
    if (el && !(ok ? ok(el.value) : el.value.trim())) { el.focus(); el.setAttribute('aria-invalid', 'true'); notify(msg); return false; }
  }
  return true;
};

// ---------- Animação "voando para o carrinho" ----------
// Uma bolinha com a foto do produto sai do botão clicado e faz um arco até o ícone do carrinho.
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function flySource(button){
  const img = button.closest('.card')?.querySelector('.cover img')
    || (activeProduct && document.querySelector('.gallery-main img'));
  const box = button.getBoundingClientRect(); // a bolinha sai do próprio botão clicado
  return { box, src: img?.currentSrc || img?.src || (activeProduct ? productImage(activeProduct.image) : '') };
}
function bumpCart(){
  const cartBtn = document.querySelector('.cart-toggle');
  if (!cartBtn) return;
  cartBtn.classList.remove('bump'); void cartBtn.offsetWidth; cartBtn.classList.add('bump');
}
function flyToCart(from){
  const target = document.querySelector('.cart-toggle');
  if (!from || !target || reduceMotion() || !document.body.animate) return bumpCart();
  const t = target.getBoundingClientRect();
  const size = 64;
  const sx = from.box.left + from.box.width / 2 - size / 2;
  const sy = from.box.top + from.box.height / 2 - size / 2;
  const dx = t.left + t.width / 2 - size / 2 - sx;
  const dy = t.top + t.height / 2 - size / 2 - sy;
  const ghost = document.createElement(from.src ? 'img' : 'span');
  if (from.src) { ghost.src = from.src; ghost.alt = ''; }
  ghost.className = 'fly-ghost';
  ghost.style.left = sx + 'px'; ghost.style.top = sy + 'px';
  document.body.appendChild(ghost);
  const lift = Math.min(-60, dy * 0.35 - 80); // ponto alto do arco
  ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${lift}px) scale(.75)`, opacity: 1, offset: .45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: .4 }
  ], { duration: 750, easing: 'cubic-bezier(.45,.05,.4,1)' }).onfinish = () => { ghost.remove(); bumpCart(); };
}

function cepResultHtml(a){
  const where = [a.street, a.district].filter(Boolean).join(', ');
  return `<div class="cep-result"><p class="cep-address">${icons.home} <span>${safe(where)}${where ? ' – ' : ''}${safe(a.city)}/${safe(a.state)}</span></p><p class="cep-eta">${icons.truck} <span><b>Frete grátis</b> · chega entre <b>${deliveryWindow()}</b></span></p><p class="cep-eta">⚡ <span><b>${safe(STORE.dispatchShort)}</b> da confirmação do pagamento</span></p><small>Previsão em dias úteis após a confirmação do pagamento.</small></div>`;
}
let cepLookupFor = '';
async function lookupShipping(cep){
  const out = document.getElementById('cep-result');
  const digits = String(cep).replace(/\D/g, '');
  if (digits.length !== 8 || !out || cepLookupFor === digits) return;
  cepLookupFor = digits;
  out.innerHTML = '<p class="cep-loading">Buscando seu endereço…</p>';
  try {
    const r = await fetch('/api/shipping?cep=' + digits);
    const data = await r.json();
    if (cepLookupFor !== digits) return;
    if (!r.ok) { out.innerHTML = `<p class="cep-error">${safe(data.error || 'CEP não encontrado')}. Confira os números.</p>`; cepLookupFor = ''; return; }
    applyCep(data.address);
    out.innerHTML = cepResultHtml(savedCep);
    // Atualiza o cabeçalho e a caixa de frete da página por trás do pop-up
    const head = app.querySelector('.delivery');
    if (head) head.innerHTML = `<span aria-hidden="true">⌖</span> Entregar em ${safe(cepPlace())} · ${safe(savedCep.cep)} <span style="float:right">›</span>`;
    const box = app.querySelector('.ship-box > div');
    if (box) box.innerHTML = `<strong>Frete grátis para todo o Brasil</strong><span class="same-day">⚡ ${safe(STORE.dispatchShort)}</span><small>Chega entre <b>${deliveryWindow()}</b> em ${safe(cepPlace())} · com rastreio</small><button class="link-btn" data-action="cep">Trocar CEP (${safe(savedCep.cep)})</button>`;
  } catch { out.innerHTML = '<p class="cep-error">Não foi possível consultar agora. Tente novamente.</p>'; cepLookupFor = ''; }
}

// Clicar fora do pop-up (no fundo escuro) fecha o pop-up
overlay.addEventListener('click', e => {
  if (e.target !== overlay) return;
  const r = overlay.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) overlay.close();
});

document.addEventListener('click',event=>{
  if(event.target.closest('#overlay a')) overlay.close();
  const element=event.target.closest('[data-action]');
  if(!element) return;
  const {action,id,index}=element.dataset;
  const i=Number(index);
  switch(action){
    case 'ship': shipMethod = id === 'full' && fullAvailable() ? 'full' : 'free'; render(); break;
    case 'toggle-summary': summaryOpen = !summaryOpen; render(); break;
    case 'go-step-2':
      if (!need([
        ['input-name','Informe seu nome completo.', v => v.trim().split(/\s+/).length >= 2],
        ['input-email','Informe um e-mail válido.', v => /^\S+@\S+\.\S+$/.test(v)],
        ['input-cpf','CPF inválido. Confira os números.', validCPF],
        ['input-phone','Informe um celular com DDD.', v => v.replace(/\D/g,'').length >= 10]
      ])) return;
      step = 1; render(); window.scrollTo(0, 0); break;
    case 'go-step-3':
      if (!need([
        ['input-cep','Informe um CEP válido.', v => v.replace(/\D/g,'').length === 8],
        ['input-address','Informe a rua.'], ['input-number','Informe o número.'],
        ['input-neighborhood','Informe o bairro.'], ['input-city','Informe a cidade.'],
        ['input-state','Informe a UF.', v => /^[A-Za-z]{2}$/.test(v.trim())]
      ])) return;
      step = 2; render(); window.scrollTo(0, 0); break;
    case 'finalize-pix': if (!placing) placeOrder(); break;
    case 'back-step': step = Math.max(0, step - 1); render(); window.scrollTo(0, 0); break;
    case 'copy-pix': {
      const code = lastOrder?.payment?.qrCode || '';
      navigator.clipboard?.writeText(code).then(() => notify('Código Pix copiado! Cole no app do seu banco.')).catch(() => notify('Selecione e copie o código acima.'));
      break;
    }
    case 'payment':
      show('Meios de pagamento', `<div class="pay-info">
        ${STORE.acceptsPix ? `<div class="pay-row">${pixIcon}<div><strong>Pix</strong><small>Aprovação na hora. O pedido é separado assim que o pagamento é confirmado.</small></div></div>` : ''}
        ${STORE.acceptsCard ? `<div class="pay-row">${icons.card}<div><strong>Cartão de crédito</strong><small>Em até ${STORE.maxInstallments}x sem juros.</small></div></div>` : ''}
        <p class="co-note">${icons.shield} <span><b>Guarde o comprovante do Pix.</b> Se o pagamento não for confirmado em alguns minutos, envie o comprovante e liberamos seu pedido na hora.</span></p>
        ${paymentBadges()}</div>`);
      break;
    case 'info': {
      const row = (icon, title, text) => `<div class="pay-row">${icon}<div><strong>${title}</strong><small>${text}</small></div></div>`;
      const more = (href, label) => `<a class="outline wide" href="${href}">${label}</a>`;
      const popups = {
        envio: ['Política de envio', `<div class="pay-info">
          ${row(icons.truck, 'Frete grátis para todo o Brasil', `Entrega em ${STORE.shippingDays}${savedCep ? `: chega entre <b>${deliveryWindow()}</b> em ${safe(cepPlace())}` : ''}.`)}
          ${row(icons.box, 'Postagem', safe(STORE.dispatchText) + '.')}
          ${row(icons.home, 'Rastreio', `Você recebe o código de rastreio por e-mail${waNumber ? ' e WhatsApp' : ''} assim que o pedido for postado.`)}
</div>`],
        trocas: ['Trocas e devoluções', `<div class="pay-info">
          ${row(pixIcon, 'Reembolso no Pix na hora', 'Não ficou satisfeito? É só pedir: o dinheiro volta para a sua conta via Pix na mesma hora, sem burocracia.')}
          ${row(icons.back, `${STORE.returnDays} dias para desistir`, 'Sem precisar justificar. O frete de volta é por nossa conta.')}
          ${row(icons.shield, 'Defeito de fabricação', safe(STORE.warrantyText) + '. Trocamos o produto ou devolvemos o valor na hora.')}</div>`],
        atendimento: ['Atendimento', `<div class="pay-info">
          ${row(icons.chat, 'Horário', safe(STORE.hours) + '.')}
          ${waNumber || isDev ? `<a class="wa-inline" href="${waLink('Olá! Tenho uma dúvida sobre: ' + (activeProduct?.name || 'um produto'))}" ${waNumber ? 'target="_blank" rel="noopener"' : ''}>${waIcon} ${waNumber ? 'Falar no WhatsApp ' + waDisplay() : 'WhatsApp (configure em store-config.js)'}</a>` : ''}
          ${STORE.email ? row(icons.user, 'E-mail', `<a class="link" href="mailto:${safe(STORE.email)}">${safe(STORE.email)}</a>`) : ''}
          ${more('#/meus-pedidos', 'Acompanhar meu pedido')}</div>`]
      };
      const [title, body] = popups[id] || popups.atendimento;
      show(title, body);
      break;
    }
    case 'menu': showMenu(); break;
    case 'cart': showCart(); break;
    case 'close': overlay.close(); break;
    case 'finalize': overlay.close(); step = 0; location.hash='/checkout'; break;
    case 'cep':
      show('Calcular prazo de entrega', `<form data-form="cep" novalidate><label>Digite seu CEP<input class="cep" name="cep" required inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="${safe(savedCep?.cep || '')}"></label><button class="action">Calcular</button></form><div id="cep-result" aria-live="polite">${savedCep ? cepResultHtml(savedCep) : ''}</div><p><a class="link" href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener">Não sei meu CEP</a></p>`);
      overlay.querySelector('input.cep')?.focus();
      break;
    case 'photo': photo=i; render(); break;
    case 'variant': variant=i; render(); break;
    case 'options': {
      const options = document.querySelector('.variants');
      options.scrollIntoView({ block:'center' });
      options.querySelector('[aria-pressed=true]').focus({ preventScroll:true });
      break;
    }
    case 'add':
    case 'buy': {
      const from = action === 'add' ? flySource(element) : null;
      const selected=activeProduct?.id===id?variant:0;
      const qty=activeProduct?.id===id?quantity:1;
      const item=cart.find(row=>row.id===id && row.variant===selected);
      if(item) item.qty=Math.min(99,item.qty+qty);
      else cart.push({id,variant:selected,qty});
      save();
      if(action==='buy') { step = 0; location.hash='/checkout'; }
      else {render(); flyToCart(from); notify('Produto adicionado ao carrinho');}
      break;
    }
    case 'minus':
    case 'plus':
    case 'remove': {
      const item=cart[i];
      if(!item) return;
      if(action==='remove') cart.splice(i,1);
      else item.qty=Math.min(99,Math.max(1,item.qty+(action==='plus'?1:-1)));
      save();
      render();
      if(overlay.open) showCart();
      break;
    }
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.matches('input.cep')) {
    input.value = formatCEP(input.value);
    if (input.value.replace(/\D/g, '').length === 8) lookupShipping(input.value);
    else { cepLookupFor = ''; const out = document.getElementById('cep-result'); if (out) out.innerHTML = ''; }
    return;
  }
  const bind = input.dataset.bind;
  if (!bind) return;
  input.removeAttribute('aria-invalid');
  if (bind === 'cpf') input.value = formatCPF(input.value);
  else if (bind === 'phone') input.value = formatPhone(input.value);
  else if (bind === 'cep') { input.value = formatCEP(input.value); searchCEP(input.value); }
  else if (bind === 'state') input.value = input.value.toUpperCase();
  checkoutData[bind] = input.value;
});
document.addEventListener('change',event=>{if(event.target.id==='quantity') quantity=Number(event.target.value);});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.dataset.form) return;
  event.preventDefault();
  if(form.dataset.form==='search'){
    const query=new FormData(form).get('query').trim();
    location.hash=query?'/busca?q='+encodeURIComponent(query):'/';
  } else if (form.dataset.form==='order') {
    const id = new FormData(form).get('order').trim();
    const out = document.getElementById('order-result');
    fetch('/api/orders/' + encodeURIComponent(id)).then(async r => ({ ok:r.ok, data: await r.json() })).then(({ok,data}) => {
      out.innerHTML = ok ? `<div class="legal-box"><p>Status: <b>${safe(data.status)}</b></p><p>Total: ${format(data.total)}</p><p>Data: ${new Date(data.createdAt).toLocaleString('pt-BR')}</p></div>` : `<p>Pedido não encontrado. Confira o número ou fale com a gente.</p>`;
    }).catch(() => { out.innerHTML = '<p>Não foi possível consultar agora. Tente novamente.</p>'; });
  } else {
    cepLookupFor = '';
    const cep = new FormData(form).get('cep');
    if (String(cep).replace(/\D/g, '').length !== 8) { const out = document.getElementById('cep-result'); if (out) out.innerHTML = '<p class="cep-error">Digite os 8 números do CEP.</p>'; return; }
    lookupShipping(cep);
  }
});
window.addEventListener('hashchange',()=>{
  overlay.close();
  variant=0; photo=0; quantity=1;
  if (!location.hash.startsWith('#/checkout')) { step = 0; lastOrder = null; }
  render();
  window.scrollTo(0,0);
});
render();
