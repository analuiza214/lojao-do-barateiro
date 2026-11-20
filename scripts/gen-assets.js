const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8') + ';this.products=products;', ctx);

const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wrap = (text, max) => {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max) { lines.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  return lines.concat(line).slice(0, 4);
};
const palette = ['#f3670d', '#2b6cb0', '#2f855a', '#805ad5', '#c05621', '#2c7a7b'];

fs.mkdirSync(path.join(root, 'assets', 'products'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets', 'banners'), { recursive: true });

ctx.products.forEach((p, i) => {
  const color = palette[i % palette.length];
  const text = wrap(p.name, 22).map((l, n) => `<text x="300" y="${330 + n * 34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" fill="#444">${esc(l)}</text>`).join('');
  fs.writeFileSync(path.join(root, 'assets', 'products', p.id + '.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="#fff"/><circle cx="300" cy="190" r="80" fill="${color}" opacity=".15"/><path d="M255 215l60-60 25 25-60 60zM330 150l22-22 38 38-22 22z" fill="${color}"/>${text}<text x="300" y="560" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#999">Imagem do produto (placeholder)</text></svg>`);
});

const banner = (file, title, sub, bg) => fs.writeFileSync(path.join(root, 'assets', 'banners', file),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 500"><rect width="1900" height="500" fill="${bg}"/><text x="950" y="230" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="90" fill="#fff">${esc(title)}</text><text x="950" y="320" text-anchor="middle" font-family="Arial,sans-serif" font-size="40" fill="#fff" opacity=".9">${esc(sub)}</text></svg>`);
banner('promo.svg', 'ESQUENTA BLACK FRIDAY', 'Descontos em todo o site', '#1d1714');
banner('ferramentas.svg', 'FERRAMENTAS PARA O SEU DIA A DIA', 'Lojão do Barateiro', '#f3670d');

console.log('Assets gerados:', ctx.products.length, 'produtos e 2 banners');
