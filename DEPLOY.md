# 🚀 Como publicar o Lojão do Barateiro no Cloudflare Workers

Este projeto foi totalmente convertido e configurado para rodar no **Cloudflare Workers com Assets Estáticos**, exatamente no mesmo padrão da sua loja de referência.

---

## 📁 Estrutura do Projeto

- `worker-src/index.js`: Código do Worker responsável pelas rotas de API (`/api/products`, `/api/shipping`, `/api/orders`) e pelo roteamento dos arquivos estáticos.
- `wrangler.jsonc`: Configuração oficial do Cloudflare Workers apontando para a pasta `./dist`.
- `build-worker.mjs`: Script de compilação do Worker (com fallback standalone caso o esbuild não esteja instalado).
- `scripts/prepare-deploy.mjs`: Prepara a pasta `dist/` com todos os arquivos estáticos (`index.html`, `app.js`, `catalog.js`, `styles.css`, `mercado-pago.png`, `assets/`).
- `.github/workflows/deploy.yml`: Ação automática do GitHub Actions para publicar no Cloudflare a cada push.
- `.gitignore`: Ignora `node_modules`, `dist` e arquivos temporários.

---

## 1️⃣ Subir para o GitHub

No terminal (PowerShell ou Git Bash) dentro da pasta do projeto (`C:\Users\welli\Desktop\Lojão do Barateiro`):

```bash
git init
git add .
git commit -m "feat: projeto convertido para Cloudflare Workers"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

---

## 2️⃣ Opções de Publicação

### Opção A: Automático pelo GitHub Actions (Recomendado)
1. Crie o repositório no GitHub e envie o código.
2. No repositório do GitHub, vá em **Settings** > **Secrets and variables** > **Actions** e adicione duas Secrets:
   - `CLOUDFLARE_API_TOKEN`: Seu token de API da Cloudflare com permissão de Workers.
   - `CLOUDFLARE_ACCOUNT_ID`: O ID da sua conta Cloudflare (disponível na barra lateral do painel).
3. Cada `git push` no branch `main` irá compilar e publicar automaticamente. Você também pode disparar manualmente na aba **Actions** > **Run workflow**.

---

### Opção B: Publicar direto pelo Terminal com Wrangler
Se você já tiver o login da Cloudflare no seu computador:

```bash
# 1. Gerar os arquivos de publicação
npm run build

# 2. Publicar na Cloudflare
npx wrangler deploy --config wrangler.jsonc
```

---

### Opção C: Pelo Painel Web da Cloudflare
1. Acesse o painel da Cloudflare > **Compute (Workers & Pages)** > **Create application** > **Pages** (ou Workers).
2. Conecte ao seu repositório do GitHub.
3. Configure o build:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Clique em **Save and Deploy**.
