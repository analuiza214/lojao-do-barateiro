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

## O que você precisa preencher

| Área | Ação |
| --- | --- |
| Dados legais | Substitua os campos `[PREENCHER ...]` do rodapé e das páginas de política em `app.js`. |
| Pagamento | Implemente `payment.createCharge` em `server.js` com o gateway escolhido (Mercado Pago, Stripe etc.), receba webhooks assinados e atualize o status do pedido. |
| Frete | Configure transportadoras, dimensões e regras reais em `shipping` no `server.js`. |
| Catálogo | Troque preços, descrições, variantes e estoque pelos seus produtos em `catalog.js`. |
| Pedidos | O arquivo JSON serve para início. Para produção, use um banco de dados e autenticação na consulta de pedidos. |
| Publicação | Configure domínio, HTTPS e monitoramento. |

## Limitações

O layout foi reconstruído a partir da estrutura pública do site de referência, sem equivalência pixel a pixel. As fotos e os banners vieram da vitrine pública da Loja das Ferramentas. O backend da referência não foi reproduzido.
