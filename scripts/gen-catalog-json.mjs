import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Generate catalog-data.json from catalog.js
const catalogCode = fs.readFileSync(path.join(root, 'catalog.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(catalogCode + ';this.products=products;this.categories=categories;', ctx);
fs.writeFileSync(
  path.join(root, 'catalog-data.json'),
  JSON.stringify({ products: ctx.products, categories: ctx.categories }, null, 2)
);
console.log('✅ Gerado catalog-data.json');
