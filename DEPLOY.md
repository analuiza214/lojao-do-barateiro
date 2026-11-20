# 🚀 Como publicar o Lojão do Barateiro no Cloudflare Workers

O projeto está 100% limpo, sem nenhuma variável, segredo, chave ou e-mail pessoal exposto no código ou nos arquivos de configuração.

---

## 🔒 Segurança e Variáveis de Ambiente

Ao contrário de projetos que deixam tokens ou e-mails escritos no arquivo `wrangler.jsonc`, **aqui nada foi exposto**:

- **No GitHub:** Você sobe apenas o código-fonte puro.
- **No Cloudflare:** Toda e qualquer variável que você precisar configurar é adicionada diretamente no painel da Cloudflare em:
  👉 **Workers & Pages** > Selecione seu Worker > **Settings** > **Variables and Secrets**
  - **Variables (Texto):** Para URLs públicas, nomes de configuração, etc.
  - **Secrets (Criptografado):** Para tokens de gateway, chaves de webhook, credenciais de API, etc.
- **No código (`worker-src/index.js`):** O Worker lê automaticamente qualquer variável que você criar através do objeto `env` (exemplo: `env.PAYMENT_PROVIDER`, `env.ORDERS_KV`, etc.).
- **No `.gitignore`:** Arquivos `.env`, `.env.*`, `secrets.*`, `dist/` e `node_modules/` estão bloqueados para nunca serem commitados por acidente.

---

## 1️⃣ Subir para o seu GitHub

No terminal (PowerShell ou Git Bash) na pasta do projeto:

```bash
git init
git add .
git commit -m "feat: projeto convertido para cloudflare workers sem variaveis expostas"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

---

## 2️⃣ Conectar e Publicar no Cloudflare Workers

### Método Recomendado (Direto pelo Painel Cloudflare - Conexão com Git)
1. Acesse o painel da [Cloudflare](https://dash.cloudflare.com/)
2. Vá em **Compute (Workers & Pages)** > **Create application** > aba **Pages** (ou Workers) > **Connect to Git**.
3. Selecione o seu repositório recém-criado no GitHub.
4. Defina as configurações de build:
   - **Framework preset**: `None`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Na seção **Environment variables**, se quiser adicionar variáveis agora, adicione-as lá. Caso contrário, finalize e adicione depois em **Settings** > **Variables and Secrets**.
6. Clique em **Save and Deploy**.

A cada commit novo que você enviar para o GitHub, a Cloudflare recompilará e atualizará seu site automaticamente.

---

### Método Alternativo (Via Terminal / Wrangler)
Se preferir publicar direto pela linha de comando:

```bash
npm run build
npx wrangler deploy --config wrangler.jsonc
```
*(As variáveis de ambiente podem ser criadas com `npx wrangler secret put NOME_DA_VARIAVEL` ou diretamente no painel web).*
