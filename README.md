# Lojão do Barateiro

Loja virtual em português com vitrine, páginas de produto, carrinho, checkout e um backend Node sem dependências.

## Como rodar

```
npm start
```

Abra http://localhost:3000. Requer Node 18 ou superior.

## O que funciona

- Vitrine responsiva com 22 produtos, busca, categorias e banners.
- Fotos e galerias dos 22 produtos em `assets/products/`. Os dois banners têm versões para celular e desktop em `assets/banners/`. Os arquivos WebP são servidos localmente.
- Faixa promocional e barra de compra móvel com preço e tamanho sincronizados com a página do produto. A nota, a contagem de vendas e a indicação de estoque da escada estão identificadas como dados do site de referência.
- Carrinho persistido no navegador.
- Consulta de CEP via ViaCEP (`GET /api/shipping?cep=`). O frete é grátis e o prazo é de exemplo.
- Checkout em três etapas que cria pedidos em `POST /api/orders`. O servidor recalcula os preços a partir do catálogo e salva em `data/orders.json`.
- Consulta de pedido em `GET /api/orders/:id`.

## Antes de publicar (obrigatório)

| Onde | O que fazer |
| --- | --- |
| `store-config.js` | Preencha razão social, CNPJ, endereço, e-mail e WhatsApp **da sua empresa**. Enquanto faltar algo, uma faixa amarela aparece no localhost (nunca em produção). |
| Pagamento | Defina `MP_ACCESS_TOKEN` com o Access Token de produção da **sua** conta Mercado Pago (local: variável de ambiente; Cloudflare: Settings > Variables and Secrets). O Pix é gerado pela API oficial e o recebedor é a sua empresa. |
| Pedidos (Cloudflare) | Vincule um KV chamado `ORDERS_KV` para salvar pedidos e permitir a consulta de status. |
| Frete | Ajuste `shippingDays` em `store-config.js` e `SHIPPING_DAYS` no servidor com o prazo real da sua transportadora. |
| Produtos | Preencha descrição, conteúdo da caixa e ficha técnica em `PRODUCT_INFO` (`catalog.js`). Revise os preços "de": use o preço realmente praticado antes da promoção. |
| Mais vendidos | Liste em `bestsellers` só os produtos que realmente vendem mais. |
| Imagens | As fotos de produto vieram de outra loja. Troque por fotos do fornecedor (com autorização) ou próprias. |

## O que mudou

- Checkout com a identidade da loja, sem marca de terceiros, sem contador falso e com validação de CPF, CEP e telefone.
- Pix real via API do Mercado Pago; a tela atualiza sozinha quando o pagamento é aprovado.
- Políticas de troca, reembolso, envio, privacidade e termos escritas com base no CDC e na LGPD.
- Faixa de confiança, garantia e WhatsApp na home, no produto e no checkout.
