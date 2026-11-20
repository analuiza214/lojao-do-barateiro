import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'dist');

// Função de cópia recursiva compatível e segura para todas as versões do Node
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Arquivos para a raiz do dist
const files = ['index.html', 'app.js', 'catalog.js', 'styles.css', 'mercado-pago.png', '_worker.js'];
// Pastas para copiar recursivamente
const directories = ['assets'];

// Limpar e recriar dist
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

// Evitar que o Cloudflare sirva o código do Worker como download público
fs.writeFileSync(path.join(output, '.assetsignore'), '_worker.js\n');

// Copiar arquivos raiz
for (const file of files) {
  const src = path.join(root, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(output, file));
    console.log(`  📄 ${file}`);
  }
}

// Copiar pastas de assets
for (const directory of directories) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) {
    copyDirSync(source, path.join(output, directory));
    console.log(`  📁 ${directory}/`);
  }
}

console.log(`\n✅ Assets de publicação preparados com sucesso em ${output}`);
