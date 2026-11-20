import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const { build: esbuildBuild } = await import('esbuild');
    await esbuildBuild({
      entryPoints: [path.join(root, 'worker-src', 'index.js')],
      outfile: path.join(root, '_worker.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
    });
    console.log('✅ Criado _worker.js (via esbuild)');
  } catch {
    // Fallback standalone: embutir catalog-data.json diretamente
    const workerSrc = fs.readFileSync(path.join(root, 'worker-src', 'index.js'), 'utf8');
    const catalogData = fs.readFileSync(path.join(root, 'catalog-data.json'), 'utf8');
    const bundled = workerSrc.replace(
      /import catalog from '\.\.\/catalog-data\.json';/,
      `const catalog = ${catalogData};`
    );
    fs.writeFileSync(path.join(root, '_worker.js'), bundled, 'utf8');
    console.log('✅ Criado _worker.js (embutido)');
  }
}

await run();
