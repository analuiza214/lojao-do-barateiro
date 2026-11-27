// ============================================================
//  DADOS DA LOJA — preencha aqui uma única vez.
//  Tudo que aparece no rodapé, no checkout, nas políticas e no
//  botão de WhatsApp vem deste arquivo.
//  Campos vazios ('') simplesmente não aparecem para o cliente.
//  NUNCA coloque dados de outra empresa: a razão social e o CNPJ
//  precisam ser os mesmos do recebedor do Pix.
// ============================================================
const STORE = {
  name: 'Lojão do Barateiro',
  tagline: 'Ferramentas, kits e acessórios para casa, obra e oficina.',

  // Dados legais (obrigatórios antes de publicar — Decreto 7.962/2013)
  legalName: 'Lojao O Barateiro',
  cnpj: '15.570.012/0001-29',
  address: '',          // opcional: se preencher, aparece no rodapé e nas políticas

  // Atendimento
  email: 'lojaobarateiro@suporte.com',
  whatsapp: '5589988914788',
  hours: 'Seg. a sex. das 9h às 18h · Sáb. das 9h às 12h',
  reclameAquiUrl: '',   // link da página da loja no Reclame Aqui

  // Promoção (data real de término — nada de contador que reinicia)
  promoName: 'Black Friday',
  promoEndsAt: '2026-11-30T23:59:00-03:00',

  // Entrega
  shippingDays: '3 a 7 dias úteis',  // confirme com sua transportadora
  dispatchText: 'Postagem no mesmo dia útil da confirmação do pagamento',
  dispatchShort: 'Postado no mesmo dia',

  // Envio Full (expresso, chega no próximo dia útil). Preço = % do valor dos produtos,
  // com mínimo e máximo. Use cepPrefixes para limitar às regiões onde você REALMENTE
  // consegue entregar no dia seguinte (ex.: ['20', '21', '25'] = Rio e Baixada).
  // Lista vazia = todos os CEPs. O servidor usa estes mesmos valores para cobrar.
  fullShipping: { enabled: true, label: 'Envio Full', pct: 12, min: 14.90, max: 39.90, cepPrefixes: [] },  // selo curto exibido no produto, no CEP e no checkout

  // Pagamento — mostre SOMENTE o que está realmente integrado
  acceptsPix: true,
  acceptsCard: false,   // mude para true só quando o cartão estiver integrado
  maxInstallments: 10,  // usado apenas se acceptsCard = true

  // Garantia e trocas
  returnDays: 7,        // mínimo legal (CDC art. 49)
  warrantyText: 'Garantia legal de 90 dias contra defeito de fabricação',

  // Selo "Mais vendido": coloque aqui SÓ os ids que realmente vendem mais
  bestsellers: []
};
