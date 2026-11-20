

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
const safe = value => String(value).replace(/[&<>"']/g, token => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[token]));
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

// Default demo cart items matching screenshot if empty
if (!cart.length) {
  cart = [
    { id: 'escada-telescopica', variant: 0, qty: 1 },
    { id: 'placas-adesivas-parede-marmore', variant: 0, qty: 1 }
  ];
  try { localStorage.setItem('barateiro-cart', JSON.stringify(cart)); } catch {}
}
let activeProduct;
let variant = 0;
let photo = 0;
let banner = 0;
let quantity = 1;
let step = 0;
let statusTimer;
// Checkout states
let summaryOpen = true;
let couponOpen = false;
let couponCode = '';
let timerMinutes = 8;
let timerSeconds = 17;
let timerStarted = false;

let checkoutData = {
  name: '',
  email: '',
  cpf: '',
  phone: '',
  cep: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'SP',
  paymentMethod: 'pix'
};

const sumOld = () => cart.reduce((total, item) => {
  const p = lookup(item.id);
  const oldPrice = p ? (p.old || p.variants[item.variant]?.[1] || 0) : 0;
  return total + Math.round(oldPrice * 100) * item.qty;
}, 0) / 100;


const sum = () => cart.reduce((total, item) => total + Math.round(lookup(item.id).variants[item.variant][1] * 100) * item.qty, 0) / 100;
const count = () => cart.reduce((total,item) => total + item.qty,0);
const save = () => {
  try { localStorage.setItem('barateiro-cart',JSON.stringify(cart)); } catch {}
};
const pct = (price,old) => Math.round((1-price/old)*100);
const priceText = price => {
  const [whole,cents] = format(price).replace(/^R\$\s*/, '').split(',');
  return `<div class="price"><small>R$</small> <strong>${whole}<sup>${cents}</sup></strong></div>`;
};
const categoryLinks = () => categories.map(([id,label,icon]) => `<a href="#/categoria/${id}"><span aria-hidden="true">${icon}</span>${label}</a>`).join('');
const logo = () => '<a href="#/" class="logo"><span aria-hidden="true">⚒</span> Lojão do <b>Barateiro</b></a>';
const cartIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M1 3h3l3 12h12l3-9H5M8 19h.01M19 19h.01" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
const header = query => `<header><div class="promo-strip"><span><span aria-hidden="true">♨</span> ESQUENTA BLACK FRIDAY</span><span>DESCONTOS EM TODO O SITE</span><span>FRETE GRÁTIS PARA TODO O BRASIL</span><span>PAGAMENTO NO PIX</span></div><div class="head"><button class="plain" data-action="menu" aria-label="Abrir menu">☰</button>${logo()}<form class="search" data-form="search"><input aria-label="Buscar produtos" name="query" value="${safe(query || '')}" placeholder="Buscar produtos, marcas e muito mais..."><button aria-label="Buscar">⌕</button></form><button class="plain cart-toggle" data-action="cart" aria-label="Abrir carrinho">${cartIcon}${count() ? `<span class="count">${count()}</span>` : ''}</button><button class="delivery" data-action="cep">♧　Enviar para seu CEP <span style="float:right">›</span></button></div></header>`;
const about = () => `<section class="about panel"><figure><img src="${productImage('fachada-referencia.webp')}" alt="Fachada da Loja das Ferramentas" loading="lazy"><figcaption>Fachada da loja de referência</figcaption></figure><div><p><strong>SOBRE NÓS</strong></p><h2>Ferramentas para quem constrói, reforma e faz acontecer.</h2><p>Encontre ferramentas elétricas, kits completos e acessórios para manutenção, obra, oficina e uso doméstico.</p><a class="outline" href="#/sobre-nos">Conhecer a loja</a> <a class="outline" href="#/meus-pedidos">Acessar meus pedidos</a></div></section>`;
const footer = () => `<footer><div class="wrap footer-grid"><div>${logo()}<p>Ferramentas, kits e acessórios para casa, obra e oficina.</p></div><div><h3>INSTITUCIONAL</h3><a href="#/sobre-nos">Sobre nós</a><a href="#/">Loja</a><a href="#/atendimento">Atendimento</a></div><div><h3>CATEGORIAS</h3>${categories.map(([id,label])=>`<a href="#/categoria/${id}">${label}</a>`).join('')}</div><div><h3>TERMOS E POLÍTICAS</h3>${policies.map(([id,label])=>`<a href="#/${id}">${label}</a>`).join('')}</div></div><div class="wrap legal"><p>Razão Social: [PREENCHER RAZÃO SOCIAL]</p><p>CNPJ: [PREENCHER CNPJ]</p><p>Endereço: [PREENCHER ENDEREÇO]</p><p>Contato: [PREENCHER E-MAIL E TELEFONE]</p><p>Copyright ${new Date().getFullYear()} Lojão do Barateiro. Todos os direitos reservados.</p></div></footer>`;
const card = p => `<article class="card"><a href="${productLink(p)}"><div class="cover"><img loading="lazy" src="${productImage(p.image)}" alt="${p.name}"><span class="badge">MAIS VENDIDO</span><span class="off">-${pct(p.price,p.old)}%</span></div></a><div class="copy"><a class="name" href="${productLink(p)}">${p.name}</a><span class="bf">◆ BLACK FRIDAY</span><div class="prices"><s>${format(p.old)}</s><b>${pct(p.price,p.old)}% OFF</b></div>${priceText(p.price)}<div class="install">em <span class="green">10x ${format(p.price/10)} sem juros</span></div><b class="green shipping">FRETE GRÁTIS</b>${p.variants.length>1 || products.indexOf(p)>=18 ? `<a class="outline wide" href="${productLink(p)}">Escolher tamanho</a>` : `<button class="outline wide" data-action="add" data-id="${p.id}">🛒 Adicionar</button>`}</div></article>`;
const banners = [
  ['bf','ofertas','Esquenta Black Friday'],
  ['b3','ferramentas-eletricas','Ferramentas para o seu dia a dia']
];
function hero(){
  const [image,id,label] = banners[banner];
  return `<section class="banners"><a href="#/categoria/${id}"><picture><source media="(max-width: 680px)" srcset="${site}banners/${image}-mobile.webp"><img src="${site}banners/${image}-desktop.webp" alt="${label}"></picture></a><div class="arrows"><button data-action="banner" aria-label="Banner anterior">‹</button><button data-action="banner" aria-label="Próximo banner">›</button></div></section>`;
}
function listing(category,query) {
  const index = categories.findIndex(([id])=>id===category);
  const title = query ? 'Resultados para “' + query + '”' : categories[index]?.[1] || 'Ofertas do dia';
  const list = products.filter(p => (index<=0 || p.category===index) && (!query || fold(p.name).includes(fold(query))));
  return `${header(query)}${!category && !query ? hero() : ''}<nav class="cats" aria-label="Categorias"><div class="wrap catrow">${categoryLinks()}</div></nav><main class="wrap listing"><div class="section-head"><h2>${safe(title)}</h2>${!category && !query ? '<a href="#/categoria/ofertas">Ver todas ›</a>' : ''}</div>${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : '<p class="empty">Nenhum produto encontrado.</p>'}</main><div class="wrap">${about()}</div>${footer()}`;
}
function photos(p){
  if (p.id === 'escada-telescopica') {
    return [p.image, ...Array.from({length:8}, (_, i) => `${p.id}-${i+2}.webp`)];
  }
  return [p.image, ...(extraProductPhotos[p.id] || [])];
}

const ladderReference = {
  sold: '8.920',
  rating: '4.9',
  stock: 9
};

function detail(p){
  const images = photos(p);
  const [label, price] = p.variants[variant];
  const ladder = p.id === 'escada-telescopica';
  const reference = ladder ? ladderReference : null;
  const hasOptions = p.variants.length > 1;
  const stock = reference?.stock || 9;
  const buyButton = classes => `<button class="${classes}" data-action="buy" data-id="${p.id}">Comprar agora</button>`;
  const rating = reference ? `<button class="product-rating" data-action="reviews" aria-label="Ver nota da loja de referência">${reference.rating} <span aria-hidden="true">★★★★★</span> <small>(${reference.sold})</small></button>` : '';
  const options = hasOptions ? `<p>Tamanho <strong>${label}</strong></p><div class="variants" aria-label="Tamanhos disponíveis">${p.variants.map(([name,cost],i)=>`<button class="outline" data-action="variant" data-index="${i}" aria-pressed="${i===variant}">${name}<br>${format(cost)}</button>`).join('')}</div>` : '';
  const highlights = ladder ? `<h2>O que você precisa saber</h2>
    <ul><li>Estrutura telescópica dobrável para guardar e transportar.</li><li>Travas independentes e pés antiderrapantes.</li><li>Degraus reforçados e cinta para manter a escada fechada.</li><li>Disponível em 3, 5 e 7 metros.</li></ul>` : '';
  return `${header()}<main class="wrap product"><div class="product-layout">
    <div class="product-title">
      <p><a class="link" href="#/">‹ &nbsp; Voltar para a página inicial</a></p>
      <div class="product-meta"><span>Novo${reference ? ` | +${reference.sold} vendidos` : ''}</span>${rating}</div>
      ${reference ? '<div class="product-rank"><strong>MAIS VENDIDO</strong> <span>1º em Escadas Telescópicas</span><small>Dados da referência</small></div>' : ''}
      <h1><strong>[PROMOÇÃO]</strong> ${p.name}</h1>
    </div>
    <section class="panel gallery" aria-label="Fotos do produto">
      <div class="gallery-main">
        <img src="${productImage(images[photo])}" alt="${p.name} — foto ${photo+1}">
        ${images.length>1 ? `<span class="photo-counter">${photo+1}/${images.length}</span><div class="arrows"><button aria-label="Foto anterior" data-action="photo" data-index="${(photo+images.length-1)%images.length}">‹</button><button aria-label="Próxima foto" data-action="photo" data-index="${(photo+1)%images.length}">›</button></div>` : ''}
      </div>
      ${images.length>1 ? `<div class="thumbs">${images.map((image,i)=>`<button data-action="photo" data-index="${i}" aria-label="Ver imagem ${i+1}" aria-pressed="${i===photo}"><img loading="lazy" src="${productImage(image)}" alt=""></button>`).join('')}</div>` : ''}
    </section>
    <section class="panel purchase">
      <span class="bf">◆ BLACK FRIDAY</span>
      <div class="prices"><s>${format(p.old)}</s><b>${pct(price,p.old)}% OFF</b></div>
      ${priceText(price)}<p class="green">em 10x de ${format(price/10)} sem juros</p>
      <button class="outline" data-action="payment">Ver meios de pagamento e promoções</button>
      ${options}
      <b class="green shipping">FRETE GRÁTIS <i>ϟ FULL</i></b>
      <button class="outline" data-action="cep">Mais detalhes e formas de entrega</button>
      <label>Quantidade: <select id="quantity">${Array.from({length:stock},(_,i)=>`<option ${quantity===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>
      ${buyButton('action wide')}
      <button class="outline wide" data-action="add" data-id="${p.id}">Adicionar ao carrinho</button>
    </section>
  </div>
  <section class="panel content product-content">
    <h2>Informações da loja</h2><p>Lojão do Barateiro</p>
    <div class="product-services"><button class="outline" data-action="payment">Meios de pagamento</button><a class="outline" href="#/politica-de-envio">Política de envio</a><a class="outline" href="#/trocas-e-devolucoes">Trocas e devoluções</a><a class="outline" href="#/atendimento">Atendimento</a></div>
    ${highlights}
    <h2>Descrição</h2><p>${p.name}</p>
    <h2>Perguntas e respostas</h2>
    <details><summary>Quais opções estão disponíveis?</summary><p>${p.variants.map(([name])=>name).join(', ')}.</p></details>
    ${ladder ? '<details><summary>Como guardar a escada?</summary><p>Recolha a estrutura telescópica e prenda-a com a cinta de transporte.</p></details>' : ''}
    <details><summary>Como consultar o prazo de entrega?</summary><p><button class="outline" data-action="cep">Consultar pelo CEP</button></p></details>
    <h2 id="product-reviews" tabindex="-1">Opiniões do produto</h2>
    <p>${reference ? `Na loja de referência, este produto recebeu nota ${reference.rating} em ${reference.sold} avaliações.` : 'Avaliações ainda indisponíveis.'}</p>
  </section>
  ${about()}</main>${footer()}
  <aside class="mobile-buy" aria-label="Compra rápida">
    <div>
      <strong class="mobile-shipping">CHEGARÁ GRÁTIS <i>ϟ FULL</i></strong>
      <div class="mobile-price"><s>${format(p.old)}</s><strong>${format(price)}</strong></div>
      ${reference ? `<div class="mobile-stock">♨ Restam apenas ${stock} unidades <span>(referência)</span></div>` : ''}
      ${hasOptions ? `<div class="mobile-option">Tamanho: ${label} <button data-action="options">Trocar ⌃</button></div>` : ''}
    </div>
    ${buyButton('mobile-buy-button')}
  </aside>`;
}
function lines(){
  return cart.map((item,index)=>{
    const p=lookup(item.id);
    const [label,price]=p.variants[item.variant];
    return `<article class="line"><img src="${productImage(p.image)}" alt=""><div><strong>${p.name}</strong>${label!=='Padrão' ? `<p>Tamanho: ${label}</p>` : ''}<p><button data-action="minus" data-index="${index}" aria-label="Diminuir quantidade" ${item.qty===1?'disabled':''}>−</button>　${item.qty}　<button data-action="plus" data-index="${index}" aria-label="Aumentar quantidade" ${item.qty===99?'disabled':''}>+</button></p><b>${format(price*item.qty)}</b></div><button data-action="remove" data-index="${index}" aria-label="Remover item">×</button></article>`;
  }).join('');
}
function show(title,content,drawer=false){
  overlay.className=drawer?'drawer':'';
  overlay.setAttribute('aria-label',title);
  overlay.innerHTML=`<button data-action="close" class="close" aria-label="Fechar">×</button><h2>${title}</h2>${content}`;
  if(!overlay.open) overlay.showModal();
}
const ico = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  home: ico('<path d="M3 11l9-8 9 8v10H3z"/><path d="M9 21v-7h6v7"/>'),
  tag: ico('<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>'),
  truck: ico('<path d="M1 5h13v11H1zM14 9h5l4 4v3h-9"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'),
  star: ico('<path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/>'),
  box: ico('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  cart: cartIcon
};
function showMenu(){
  const n = count();
  const quick = [['home','Início','#/'],['tag','Ofertas','#/categoria/ofertas'],['truck','Pedidos','#/meus-pedidos']].map(([i,l,h])=>`<a href="${h}"><span>${icons[i]}</span>${l}</a>`).join('') + `<button data-action="favorites"><span>${icons.star}</span>Favoritos</button>`;
  const item = (i,l,attr) => `<${attr.startsWith('href')?'a':'button'} class="menu-item" ${attr}><span class="mi">${icons[i]}${i==='cart'&&n?`<em>${n}</em>`:''}</span>${l}<i>›</i></${attr.startsWith('href')?'a':'button'}>`;
  overlay.className='drawer left menu';
  overlay.setAttribute('aria-label','Menu');
  overlay.innerHTML=`<button data-action="close" class="close" aria-label="Fechar">×</button><div class="menu-top"><h2>Olá, <b>Visitante</b></h2><p>Bem-vindo(a)</p><div class="quick">${quick}</div></div><nav class="menu-list">${item('cart','Carrinho','data-action="cart"')}${item('home','Página inicial','href="#/"')}${item('tag','Ofertas','href="#/categoria/ofertas"')}${item('truck','Rastrear meu pedido','href="#/meus-pedidos"')}${item('box','Meus pedidos','href="#/meus-pedidos"')}</nav><div class="menu-foot">LOJÃO DO BARATEIRO V1.0</div>`;
  if(!overlay.open) overlay.showModal();
}
function showCart(){
  show('Meu Carrinho',`<p>Revise os itens antes de finalizar a compra.</p>${lines() || '<p class="empty">Seu carrinho está vazio</p>'}<div class="total"><b>Total</b><b>${format(sum())}</b></div><p class="green">Frete grátis</p><button class="action wide" data-action="finalize" ${cart.length?'':'disabled'}>Finalizar compra</button><button class="outline wide" data-action="close">Continuar comprando</button>`,true);
}
// Countdown timer logic
function initCountdown() {
  if (timerStarted) return;
  timerStarted = true;
  setInterval(() => {
    if (timerSeconds > 0) {
      timerSeconds--;
    } else if (timerMinutes > 0) {
      timerMinutes--;
      timerSeconds = 59;
    } else {
      timerMinutes = 8;
      timerSeconds = 17;
    }
    const minEl = document.getElementById('timer-minutes');
    const secEl = document.getElementById('timer-seconds');
    if (minEl && secEl) {
      minEl.textContent = String(timerMinutes).padStart(2, '0');
      secEl.textContent = String(timerSeconds).padStart(2, '0');
    }
  }, 1000);
}

// Formatters and Maskers
function formatCPF(val) {
  let v = String(val).replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (v.length > 3) return v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return v;
}

function formatPhone(val) {
  let v = String(val).replace(/\D/g, '');
  if (v.startsWith('55')) v = v.slice(2);
  v = v.slice(0, 11);
  if (v.length > 6) return `+55 (${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  if (v.length > 2) return `+55 (${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length > 0) return `+55 (${v}`;
  return '';
}

function formatCEP(val) {
  let v = String(val).replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) return v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  return v;
}

async function searchCEP(cep) {
  const clean = String(cep).replace(/\D/g, '');
  if (clean.length === 8) {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        checkoutData.address = data.logradouro || checkoutData.address;
        checkoutData.neighborhood = data.bairro || checkoutData.neighborhood;
        checkoutData.city = data.localidade || checkoutData.city;
        checkoutData.state = data.uf || checkoutData.state;
        render();
      }
    } catch (e) {}
  }
}

// Mercado Pago Exact-Replica Checkout
function checkout() {
  initCountdown();

  if (!cart.length) {
    cart = [
      { id: 'escada-telescopica', variant: 0, qty: 1 },
      { id: 'placas-adesivas-parede-marmore', variant: 0, qty: 1 }
    ];
    save();
  }

  const currentSum = sum();
  const currentOldSum = sumOld();

  // 1. Top Header Bar
  const headerHtml = `
    <header class="mp-header-bar">
      <div class="mp-header-inner">
        <a href="#/" class="mp-brand-logo" title="Voltar para a loja">
          <img src="mercado-pago.png?v=2" alt="Mercado Pago" class="mp-logo-img" onerror="this.src='assets/mercado-pago.png?v=2'">
        </a>
        <div class="mp-header-secure">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00a650" stroke-width="2.3">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <div class="mp-header-secure-text">
            <span>COMPRA</span>
            <span>SEGURA</span>
          </div>
        </div>
      </div>
    </header>
  `;

  // 2. Urgent Limited-time Offer Ribbon
  const urgencyHtml = `
    <div class="mp-urgency-bar">
      <div class="mp-urgency-inner">
        <span class="mp-urgency-title">Oferta valida por tempo limitado.</span>
        <div class="mp-timer-display">
          <span class="mp-timer-box" id="timer-minutes">${String(timerMinutes).padStart(2, '0')}</span>
          <span class="mp-timer-sep">:</span>
          <span class="mp-timer-box" id="timer-seconds">${String(timerSeconds).padStart(2, '0')}</span>
        </div>
      </div>
    </div>
  `;

  // 3. Stepper (Identificação, Entrega, Pagamento)
  const stepperHtml = `
    <div class="mp-stepper-wrap">
      <div class="mp-stepper">
        <!-- Step 1 -->
        <div class="mp-step-item ${step >= 0 ? 'active' : ''} ${step > 0 ? 'completed' : ''}">
          <div class="mp-step-circle">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>
          <span class="mp-step-text">Identificação</span>
        </div>

        <div class="mp-step-connector ${step >= 1 ? 'filled' : ''}"></div>

        <!-- Step 2 -->
        <div class="mp-step-item ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
          <div class="mp-step-circle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 3h15v13H1z"/>
              <path d="M16 8h4l3 3v5h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <span class="mp-step-text">Entrega</span>
        </div>

        <div class="mp-step-connector ${step >= 2 ? 'filled' : ''}"></div>

        <!-- Step 3 -->
        <div class="mp-step-item ${step >= 2 ? 'active' : ''}">
          <div class="mp-step-circle">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <span class="mp-step-text">Pagamento</span>
        </div>
      </div>
    </div>
  `;

  // 4. Order Summary Accordion Card
  const itemsHtml = cart.map((item, idx) => {
    const p = lookup(item.id);
    if (!p) return '';
    const variantData = p.variants[item.variant] || p.variants[0] || ['Padrão', p.price];
    const [label, price] = variantData;

    let variantText = '';
    if (p.id === 'escada-telescopica') {
      variantText = `Tamanho: ${label} (${format(price)})`;
    } else if (p.id === 'placas-adesivas-parede-marmore') {
      variantText = `Opção: ${label}`;
    } else if (label !== 'Padrão') {
      variantText = `Opção: ${label}`;
    }

    return `
      <div class="mp-item-row">
        <div class="mp-item-thumb">
          <img src="${productImage(p.image)}" alt="${safe(p.name)}">
        </div>
        <div class="mp-item-details">
          <div class="mp-item-title-bar">
            <h4 class="mp-item-name">${safe(p.name)}</h4>
            <button class="mp-item-remove-btn" data-action="remove" data-index="${idx}" aria-label="Remover item" title="Remover item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
          ${variantText ? `<div class="mp-item-variant">${safe(variantText)}</div>` : ''}
          <div class="mp-item-actions">
            <div class="mp-qty-control">
              <button data-action="minus" data-index="${idx}" ${item.qty <= 1 ? 'disabled' : ''} aria-label="Diminuir">−</button>
              <span>${item.qty}</span>
              <button data-action="plus" data-index="${idx}" aria-label="Aumentar">+</button>
            </div>
            <div class="mp-item-price">${format(price * item.qty)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const summaryCardHtml = `
    <div class="mp-card">
      <button class="mp-summary-toggle" data-action="toggle-summary">
        <div class="mp-summary-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00a2ea" stroke-width="2.2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          <span>Resumo do pedido</span>
        </div>
        <div class="mp-summary-right">
          <span>${format(currentSum)}</span>
          <svg class="mp-chevron ${summaryOpen ? '' : 'collapsed'}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m18 15-6-6-6 6"/>
          </svg>
        </div>
      </button>

      ${summaryOpen ? `
        <div class="mp-items-list">
          ${itemsHtml}
        </div>

        <div class="mp-financial-rows">
          <div class="mp-financial-line">
            <span>Valor promocional</span>
            <div class="mp-promotional-group">
              <s>${format(currentOldSum)}</s>
              <strong>${format(currentSum)}</strong>
            </div>
          </div>
          <div class="mp-financial-line">
            <span>Frete</span>
            <strong class="mp-frete-gratis-badge">GRÁTIS</strong>
          </div>
        </div>

        <div>
          <button class="mp-coupon-link-btn" data-action="toggle-coupon">Possui um cupom?</button>
          ${couponOpen ? `
            <div class="mp-coupon-input-wrap">
              <input type="text" id="coupon-input" placeholder="DIGITE SEU CUPOM" value="${safe(couponCode)}">
              <button data-action="apply-coupon">Aplicar</button>
            </div>
          ` : ''}
        </div>

        <div class="mp-highlight-total-box">
          <div class="mp-highlight-total-info">
            <div class="mp-highlight-total-label">Total</div>
            <div class="mp-highlight-total-sub">Pagamento seguro via Pix.</div>
          </div>
          <div class="mp-highlight-total-amount">
            ${format(currentSum)}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // 5. Active Step Form
  let stepFormHtml = '';

  if (step === 0) {
    // STEP 1: IDENTIFICAÇÃO (1 DE 3)
    stepFormHtml = `
      <section class="mp-card">
        <div class="mp-step-card-header">
          <h3 class="mp-step-card-title">IDENTIFICAÇÃO</h3>
          <span class="mp-step-card-count">1 DE 3</span>
        </div>
        <p class="mp-step-card-sub">Preencha seus dados para envio do pedido.</p>

        <form onsubmit="event.preventDefault();" data-form="checkout-step1">
          <div class="mp-field">
            <label for="input-name">Nome completo</label>
            <input type="text" id="input-name" data-bind="name" placeholder="Digite seu nome completo" required value="${safe(checkoutData.name)}">
          </div>

          <div class="mp-field">
            <label for="input-email">E-mail</label>
            <input type="email" id="input-email" data-bind="email" placeholder="Digite seu e-mail" required value="${safe(checkoutData.email)}">
          </div>

          <div class="mp-field">
            <label for="input-cpf">
              CPF 
              <span class="mp-field-info-icon" title="Necessário para nota fiscal e envio">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
              </span>
            </label>
            <input type="text" id="input-cpf" data-bind="cpf" placeholder="000.000.000-00" maxlength="14" required value="${safe(checkoutData.cpf)}">
          </div>

          <div class="mp-field">
            <label for="input-phone">Celular/Whatsapp</label>
            <input type="text" id="input-phone" data-bind="phone" placeholder="+55 (00) 00000-0000" maxlength="20" required value="${safe(checkoutData.phone)}">
          </div>

          <button type="button" class="mp-btn-action" data-action="go-step-2">
            IR PARA ENTREGA
          </button>
        </form>
      </section>
    `;
  } else if (step === 1) {
    // STEP 2: ENTREGA (2 DE 3)
    stepFormHtml = `
      <section class="mp-card">
        <div class="mp-step-card-header">
          <h3 class="mp-step-card-title">ENTREGA</h3>
          <span class="mp-step-card-count">2 DE 3</span>
        </div>
        <p class="mp-step-card-sub">Informe o endereço para entrega do seu pedido.</p>

        <form onsubmit="event.preventDefault();" data-form="checkout-step2">
          <div class="mp-field">
            <label for="input-cep">CEP</label>
            <input type="text" id="input-cep" data-bind="cep" placeholder="00000-000" maxlength="9" required value="${safe(checkoutData.cep)}">
          </div>

          <div class="mp-field">
            <label for="input-address">Endereço (Rua/Avenida)</label>
            <input type="text" id="input-address" data-bind="address" placeholder="Ex: Rua das Flores" required value="${safe(checkoutData.address)}">
          </div>

          <div class="mp-field-row">
            <div class="mp-field">
              <label for="input-number">Número</label>
              <input type="text" id="input-number" data-bind="number" placeholder="123" required value="${safe(checkoutData.number)}">
            </div>
            <div class="mp-field">
              <label for="input-complement">Complemento</label>
              <input type="text" id="input-complement" data-bind="complement" placeholder="Apto, Bloco" value="${safe(checkoutData.complement)}">
            </div>
          </div>

          <div class="mp-field">
            <label for="input-neighborhood">Bairro</label>
            <input type="text" id="input-neighborhood" data-bind="neighborhood" placeholder="Bairro" required value="${safe(checkoutData.neighborhood)}">
          </div>

          <div class="mp-field-row">
            <div class="mp-field">
              <label for="input-city">Cidade</label>
              <input type="text" id="input-city" data-bind="city" placeholder="Cidade" required value="${safe(checkoutData.city)}">
            </div>
            <div class="mp-field">
              <label for="input-state">Estado</label>
              <input type="text" id="input-state" data-bind="state" placeholder="UF" maxlength="2" required value="${safe(checkoutData.state)}">
            </div>
          </div>

          <div class="mp-shipping-radio-box">
            <div>
              <div class="mp-shipping-radio-title">✔ Frete Grátis Express</div>
              <div class="mp-shipping-radio-desc">Prazo estimado: 3 a 7 dias úteis com rastreamento</div>
            </div>
            <div class="mp-shipping-price">GRÁTIS</div>
          </div>

          <button type="button" class="mp-btn-action" data-action="go-step-3">
            IR PARA PAGAMENTO
          </button>
          <button type="button" class="mp-btn-back" data-action="back-step">
            Voltar para Identificação
          </button>
        </form>
      </section>
    `;
  } else if (step === 2) {
    // STEP 3: PAGAMENTO (3 DE 3)
    stepFormHtml = `
      <section class="mp-card">
        <div class="mp-step-card-header">
          <h3 class="mp-step-card-title">PAGAMENTO</h3>
          <span class="mp-step-card-count">3 DE 3</span>
        </div>
        <p class="mp-step-card-sub">Selecione a forma de pagamento.</p>

        <div class="mp-payment-options">
          <div class="mp-payment-opt selected">
            <svg viewBox="0 0 512 512" width="26" height="26">
              <path fill="#32bcad" d="M374.3 226.7l-94.8-94.8a33.3 33.3 0 0 0-47.1 0l-94.7 94.8a33.3 33.3 0 0 0 0 47.1l94.7 94.7a33.3 33.3 0 0 0 47.1 0l94.8-94.7a33.3 33.3 0 0 0 0-47.1zm-118.4 97.4a6.7 6.7 0 0 1-9.4 0l-73.4-73.4a6.7 6.7 0 0 1 0-9.4l73.4-73.4a6.7 6.7 0 0 1 9.4 0l73.4 73.4a6.7 6.7 0 0 1 0 9.4l-73.4 73.4z"/>
            </svg>
            <div class="mp-payment-opt-info">
              <strong>Pix (Aprovação Imediata)</strong>
              <span>Envio prioritário • Código gerado na próxima tela</span>
            </div>
          </div>
        </div>

        <button type="button" class="mp-btn-action" data-action="finalize-pix">
          FINALIZAR PEDIDO VIA PIX
        </button>
        <button type="button" class="mp-btn-back" data-action="back-step">
          Voltar para Entrega
        </button>
      </section>
    `;
  } else if (step === 3) {
    // ORDER CONFIRMED / PIX SCREEN
    const pixCode = '00020126580014br.gov.bcb.pix0136' + Math.random().toString(36).substring(2, 15) + '520400005303986540' + currentSum.toFixed(2) + '5802BR5925LOJA DAS FERRAMENTAS6009SAO PAULO62070503***6304';
    stepFormHtml = `
      <section class="mp-card mp-pix-screen">
        <h3 class="mp-step-card-title" style="color:#00a650">PEDIDO GERADO COM SUCESSO!</h3>
        <p class="mp-step-card-sub">Pague com Pix para envio imediato.</p>

        <div class="mp-pix-qrcode-box">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pixCode)}" alt="QR Code Pix" width="180" height="180">
        </div>

        <p style="font-size:12px; color:#64748b; margin-bottom:8px;">Copie a chave Pix abaixo e cole no seu aplicativo do banco:</p>
        <div class="mp-copy-code-box" id="pix-copy-text">${pixCode}</div>

        <button type="button" class="mp-btn-action" data-action="copy-pix" data-code="${pixCode}">
          COPIAR CÓDIGO PIX
        </button>
        <a href="#/" class="mp-btn-back" style="display:flex; align-items:center; justify-content:center; text-decoration:none;">
          Voltar para a loja
        </a>
      </section>
    `;
  }

  // 6. Blue Trust & Footer Band
  const footerHtml = `
    <footer class="mp-footer-zone">
      <div class="mp-footer-container">
        <!-- Compra Segura Card -->
        <div class="mp-trust-card">
          <div class="mp-trust-card-top">
            <div class="mp-trust-white-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00a2ea" stroke-width="2.3">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <div class="mp-trust-titles">
              <h4>Compra segura</h4>
              <p>Checkout seguro e criptografado</p>
            </div>
          </div>
          <p class="mp-trust-summary-text">
            Checkout protegido com processamento seguro via Pix e confirmação do pedido em ambiente criptografado.
          </p>
        </div>

        <!-- 3 Badges Pills -->
        <div class="mp-pills-row">
          <div class="mp-pill-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span>Venda segura</span>
          </div>
          <div class="mp-pill-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span>Garantia de 12 meses</span>
          </div>
          <div class="mp-pill-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Envio em até 24h</span>
          </div>
        </div>

        <!-- Store Info -->
        <div class="mp-legal-block">
          <strong class="mp-legal-name">Loja das Ferramentas Online LTDA</strong>
          <span class="mp-legal-cnpj">CNPJ: 32.167.220/0002-81</span>
        </div>

        <!-- Payment Badges List -->
        <div class="mp-payment-badges-title">Formas de pagamento</div>
        <div class="mp-payment-badges-list">
          <!-- Pix -->
          <div class="mp-payment-card-badge" title="Pix">
            <svg viewBox="0 0 512 512" width="22" height="22">
              <path fill="#32bcad" d="M374.3 226.7l-94.8-94.8a33.3 33.3 0 0 0-47.1 0l-94.7 94.8a33.3 33.3 0 0 0 0 47.1l94.7 94.7a33.3 33.3 0 0 0 47.1 0l94.8-94.7a33.3 33.3 0 0 0 0-47.1zm-118.4 97.4a6.7 6.7 0 0 1-9.4 0l-73.4-73.4a6.7 6.7 0 0 1 0-9.4l73.4-73.4a6.7 6.7 0 0 1 9.4 0l73.4 73.4a6.7 6.7 0 0 1 0 9.4l-73.4 73.4z"/>
            </svg>
          </div>
          <!-- Visa -->
          <div class="mp-payment-card-badge" title="Visa">
            <span style="font-weight:900; font-style:italic; color:#1a1f71; font-size:15px; letter-spacing:-0.5px;">VISA</span>
          </div>
          <!-- Mastercard -->
          <div class="mp-payment-card-badge" title="Mastercard">
            <svg width="28" height="18" viewBox="0 0 36 24">
              <circle cx="13" cy="12" r="9" fill="#eb001b"/>
              <circle cx="23" cy="12" r="9" fill="#f79e1b" fill-opacity="0.88"/>
            </svg>
          </div>
          <!-- Elo -->
          <div class="mp-payment-card-badge" title="Elo">
            <span style="font-weight:800; color:#000; font-size:13px; letter-spacing:-0.5px;">elo</span>
            <span style="display:inline-flex; gap:1.5px; margin-left:2px;">
              <span style="width:3px; height:3px; border-radius:50%; background:#e61e25;"></span>
              <span style="width:3px; height:3px; border-radius:50%; background:#ffc20e;"></span>
              <span style="width:3px; height:3px; border-radius:50%; background:#00a4e4;"></span>
            </span>
          </div>
          <!-- Amex -->
          <div class="mp-payment-card-badge" title="American Express">
            <span style="font-weight:900; background:#007bc1; color:#fff; padding:1px 3px; border-radius:2px; font-size:9px; letter-spacing:0.3px;">AMEX</span>
          </div>
        </div>

        <div class="mp-copyright-row">
          Loja das Ferramentas | Todos os direitos reservados
        </div>
      </div>
    </footer>
  `;

  return `
    <main class="mp-checkout-page">
      ${headerHtml}
      ${urgencyHtml}
      <div class="mp-checkout-content">
        ${stepperHtml}
        ${summaryCardHtml}
        ${stepFormHtml}
      </div>
      ${footerHtml}
    </main>
  `;
}

function render(){
  const [path,query] = (location.hash.slice(1)||'/').split('?');
  const [,section,slug] = path.split('/');
  activeProduct = section==='produto' ? lookup(slug) : undefined;
  const title = policies.find(([id])=>id===section)?.[1] || ({'meus-pedidos':'Meus pedidos','sobre-nos':'Sobre nós','atendimento':'Atendimento'})[section];
  if(activeProduct) app.innerHTML=detail(activeProduct);
  else if(section==='checkout') app.innerHTML=checkout();
  else if(!section || section==='categoria' || section==='busca') app.innerHTML=listing(slug,new URLSearchParams(query).get('q'));
  else app.innerHTML=`${header()}<main class="wrap listing"><section class="panel content"><h1>${title || 'Página não encontrada'}</h1><p>${section==='sobre-nos' ? 'Ferramentas para quem constrói, reforma e faz acontecer.' : title ? '[PREENCHER: texto desta política com os dados da operação do Lojão do Barateiro.]' : 'Volte à loja para continuar navegando.'}</p><a class="link" href="#/">Voltar à loja</a></section></main>${footer()}`;
  document.title = activeProduct ? activeProduct.name + ' | Lojão do Barateiro' : (section === 'checkout' ? 'Checkout Seguro | Mercado Pago' : 'Lojão do Barateiro');
}
function notify(message){
  clearTimeout(statusTimer);
  status.textContent=message;
  statusTimer=setTimeout(()=>{status.textContent='';},2300);
}
document.addEventListener('click',event=>{
  if(event.target.closest('#overlay a')) overlay.close();
  const element=event.target.closest('[data-action]');
  if(!element) return;
  const {action,id,index}=element.dataset;
  const i=Number(index);
  switch(action){
    case 'toggle-summary': summaryOpen = !summaryOpen; render(); break;
    case 'toggle-coupon': couponOpen = !couponOpen; render(); break;
    case 'apply-coupon': {
      const input = document.getElementById('coupon-input');
      if (input && input.value.trim()) {
        couponCode = input.value.trim().toUpperCase();
        notify('Cupom ' + couponCode + ' aplicado com sucesso!');
      }
      render();
      break;
    }
    case 'go-step-2': {
      const nameInput = document.getElementById('input-name');
      const emailInput = document.getElementById('input-email');
      if (nameInput && !nameInput.value.trim()) {
        nameInput.focus();
        notify('Por favor, informe seu nome completo.');
        return;
      }
      if (emailInput && !emailInput.value.trim()) {
        emailInput.focus();
        notify('Por favor, informe seu e-mail.');
        return;
      }
      step = 1;
      render();
      window.scrollTo(0, 0);
      break;
    }
    case 'go-step-3': {
      step = 2;
      render();
      window.scrollTo(0, 0);
      break;
    }
    case 'finalize-pix': {
      step = 3;
      render();
      window.scrollTo(0, 0);
      try {
        fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart,
            customer: { name: checkoutData.name, email: checkoutData.email, cpf: checkoutData.cpf, phone: checkoutData.phone },
            address: { cep: checkoutData.cep, street: checkoutData.address, number: checkoutData.number, complement: checkoutData.complement, district: checkoutData.neighborhood, city: checkoutData.city, state: checkoutData.state },
            paymentMethod: 'pix'
          })
        }).catch(() => {});
      } catch (e) {}
      break;
    }
    case 'back-step': {
      step = Math.max(0, step - 1);
      render();
      window.scrollTo(0, 0);
      break;
    }
    case 'copy-pix': {
      const textToCopy = code || document.getElementById('pix-copy-text')?.textContent || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          notify('Código Pix copiado com sucesso!');
        }).catch(() => {
          notify('Código Pix copiado!');
        });
      } else {
        notify('Código Pix copiado!');
      }
      break;
    }
    case 'menu': showMenu(); break;
    case 'favorites': notify('Favoritos em breve'); break;
    case 'cart': showCart(); break;
    case 'close': overlay.close(); break;
    case 'finalize': overlay.close(); location.hash='/checkout'; break;
    case 'cep': show('Consultar entrega por CEP','<form data-form="cep"><label>CEP<input class="cep" name="cep" required inputmode="numeric" pattern="[0-9]{5}-?[0-9]{3}" placeholder="00000-000"></label><button class="action">Consultar</button></form>'); break;
    case 'payment': show('Meios de pagamento','<p>O checkout de demonstração mostra a etapa de Pix. Métodos reais dependem da integração da loja.</p>'); break;
    case 'coupon': show('Cupom','<p>A aplicação de cupons está indisponível na demonstração.</p>'); break;
    case 'photo': photo=i; render(); break;
    case 'variant': variant=i; render(); break;
    case 'options': {
      const options = document.querySelector('.variants');
      options.scrollIntoView({ block:'center' });
      options.querySelector('[aria-pressed=true]').focus({ preventScroll:true });
      break;
    }
    case 'reviews': {
      const reviews = document.querySelector('#product-reviews');
      reviews.scrollIntoView({ block:'start' });
      reviews.focus({ preventScroll:true });
      break;
    }
    case 'banner': banner=(banner+1)%banners.length; document.querySelector('.banners').outerHTML=hero(); break;
    case 'next':
      if(fieldDefs[step].some(([key])=>!(form[key]||'').trim())) return notify('Preencha todos os campos');
      if(step<2){step++; render(); window.scrollTo(0,0);}
      else placeOrder(element);
      break;
    case 'previous': step--; render(); break;
    case 'add':
    case 'buy': {
      const selected=activeProduct?.id===id?variant:0;
      const qty=activeProduct?.id===id?quantity:1;
      const item=cart.find(row=>row.id===id && row.variant===selected);
      if(item) item.qty=Math.min(99,item.qty+qty);
      else cart.push({id,variant:selected,qty});
      save();
      if(action==='buy') location.hash='/checkout';
      else {render(); notify('Produto adicionado ao carrinho');}
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
async function placeOrder(button){
  button.disabled=true;
  try {
    const {name,email,cpf,phone,...address}=form;
    const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart,customer:{name,email,cpf,phone},address})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Falha ao criar pedido');
    cart=[]; save(); form={};
    location.hash='/';
    setTimeout(()=>show('Pedido recebido',`<p>Número do pedido: <b>${safe(data.id)}</b></p><p>Total: ${format(data.total)}</p><p>Status: ${safe(data.payment.status)}</p><a class="action" href="#/">Voltar à loja</a>`),50);
  } catch(error) {
    notify(error.message==='Failed to fetch' ? 'Servidor indisponível. Inicie com npm start.' : error.message);
    button.disabled=false;
  }
}
document.addEventListener('error',event=>{const img=event.target; if(img.tagName==='IMG' && /\.jpg$/.test(img.src)) img.src=img.src.replace(/\.jpg$/,'.svg');},true);
document.addEventListener('input',event=>{const key=event.target.dataset.field; if(key) form[key]=event.target.value;});
document.addEventListener('input', event => {
  const input = event.target;
  const bind = input.dataset.bind;
  if (!bind) return;

  if (bind === 'cpf') {
    input.value = formatCPF(input.value);
    checkoutData.cpf = input.value;
  } else if (bind === 'phone') {
    input.value = formatPhone(input.value);
    checkoutData.phone = input.value;
  } else if (bind === 'cep') {
    input.value = formatCEP(input.value);
    checkoutData.cep = input.value;
    searchCEP(input.value);
  } else {
    checkoutData[bind] = input.value;
  }
});
document.addEventListener('change',event=>{if(event.target.id==='quantity') quantity=Number(event.target.value);});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.dataset.form) return;
  event.preventDefault();
  if(form.dataset.form==='search'){
    const query=new FormData(form).get('query').trim();
    location.hash=query?'/busca?q='+encodeURIComponent(query):'/';
  } else {
    const cep=new FormData(form).get('cep');
    fetch('/api/shipping?cep='+encodeURIComponent(cep)).then(async r=>({ok:r.ok,data:await r.json()})).then(({ok,data})=>{
      show('Consultar entrega por CEP',ok ? `<p>${safe(data.address.street||'')} ${safe(data.address.district||'')} – ${safe(data.address.city)}/${safe(data.address.state)}</p><p class="green">${safe(data.label)}</p>` : `<p>${safe(data.error)}</p>`);
    }).catch(()=>show('Consultar entrega por CEP','<p>Servidor indisponível. Inicie com npm start.</p>'));
  }
});
window.addEventListener('hashchange',()=>{
  overlay.close();
  variant=0; photo=0; quantity=1; step=0;
  render();
  window.scrollTo(0,0);
});
render();
