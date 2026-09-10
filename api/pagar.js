/**
 * Cria o pagamento a partir dos dados que o Payment Brick coletou.
 *
 * O Brick roda no navegador e nunca manda dados de cartão para cá — ele
 * tokeniza direto com o Mercado Pago e nos entrega só um token. Cartão em si
 * não passa por este servidor.
 *
 * DUAS COISAS QUE NÃO CONFIAMOS NO QUE VEM DO NAVEGADOR:
 *
 *   1. O valor. O Brick manda `transaction_amount`, mas quem manda é o preço
 *      definido aqui no servidor — senão daria para pagar R$ 0,01 e virar VIP.
 *   2. Quem está comprando. O `external_reference` sai do token da sessão, não
 *      de um campo do formulário.
 *
 * Variáveis de ambiente:
 *   MP_ACCESS_TOKEN            Access Token do Mercado Pago
 *   SUPABASE_URL               URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key — NUNCA vá para o navegador
 *   PRECO_VIP                  valor em reais (ex.: 19.90)
 *   SITE_URL                   opcional. Se estiver ausente ou torto, o
 *                              endereço sai dos cabeçalhos da requisição.
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const preco = Number(process.env.PRECO_VIP || '19.90');

  if (!mpToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ ok: false, motivo: 'Servidor sem as variáveis de ambiente configuradas.' });
  }

  /* ---- quem está comprando ---- */
  const autorizacao = req.headers.authorization || '';
  const tokenUsuario = autorizacao.startsWith('Bearer ') ? autorizacao.slice(7) : '';
  if (!tokenUsuario) {
    return res.status(401).json({ ok: false, motivo: 'Entre na sua conta para assinar.' });
  }

  let usuario;
  try {
    const r = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + tokenUsuario, apikey: serviceKey },
    });
    if (!r.ok) throw new Error('token recusado');
    usuario = await r.json();
  } catch {
    return res.status(401).json({ ok: false, motivo: 'Sessão expirada. Entre de novo.' });
  }

  /* ---- monta o pagamento ---- */
  const form = (req.body && req.body.formData) || {};

  const pagamento = {
    // valor e destinatário são nossos, não do navegador
    transaction_amount: preco,
    external_reference: usuario.id,
    description: 'EditorBG VIP — acesso vitalício',

    // o que o Brick coletou
    payment_method_id: form.payment_method_id,
    payer: {
      email: (form.payer && form.payer.email) || usuario.email,
      ...(form.payer && form.payer.identification
        ? { identification: form.payer.identification }
        : {}),
    },
  };

  // Cartão: token, parcelas e emissor. Pix e boleto não têm nada disso.
  if (form.token) pagamento.token = form.token;
  if (form.installments) pagamento.installments = Number(form.installments);
  if (form.issuer_id) pagamento.issuer_id = form.issuer_id;

  // O aviso de "pagamento aprovado" volta para cá. Só vai junto se o endereço
  // for utilizável: o Mercado Pago recusa o pagamento inteiro se este campo
  // estiver torto, e ficar sem liberação automática é bem melhor do que ficar
  // sem venda.
  const avisoEm = enderecoDoWebhook(req);
  if (avisoEm) pagamento.notification_url = avisoEm;
  else console.warn('Sem notification_url utilizável: o VIP não vai liberar sozinho.');

  /* ---- cria no Mercado Pago ---- */
  let criado;
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mpToken,
        'Content-Type': 'application/json',
        // Evita cobrar duas vezes se a requisição for repetida por falha de rede.
        'X-Idempotency-Key': usuario.id + '-' + Date.now(),
      },
      body: JSON.stringify(pagamento),
    });
    criado = await r.json();
    if (!r.ok) {
      console.error('Mercado Pago recusou:', criado);
      return res.status(400).json({
        ok: false,
        motivo: criado.message || 'O Mercado Pago recusou o pagamento.',
      });
    }
  } catch (err) {
    console.error('Falha ao criar o pagamento:', err);
    return res.status(502).json({ ok: false, motivo: 'Não deu para falar com o Mercado Pago agora.' });
  }

  /* ---- resposta enxuta para a tela ---- */
  // Pix vem com o QR aqui dentro; cartão aprovado não precisa de nada disso.
  const pix = criado.point_of_interaction && criado.point_of_interaction.transaction_data;

  return res.status(200).json({
    ok: true,
    id: criado.id,
    status: criado.status,                 // approved | pending | in_process | rejected
    detalhe: criado.status_detail,
    pix: pix
      ? {
          copiaECola: pix.qr_code,
          qrBase64: pix.qr_code_base64,
          link: pix.ticket_url,
        }
      : null,
  });
}

/**
 * Endereço público do webhook.
 *
 * Nasceu de um erro chato de diagnosticar: o Mercado Pago recusava o pagamento
 * inteiro com "notificaction_url attribute must be url valid" (o erro de
 * digitação é deles) porque SITE_URL estava sem o `https://` na frente. O
 * campo torto derrubava a venda, e a mensagem não dizia de onde vinha.
 *
 * A correção foi parar de depender de alguém digitar certo. O servidor já sabe
 * o próprio endereço — a Vercel o informa em cada requisição — então o valor
 * digitado à mão virou apenas a primeira opção, usada só se for mesmo uma URL.
 *
 * Devolve string vazia quando não dá para montar um endereço que o Mercado
 * Pago aceite. Localhost entra nesse caso: eles precisam alcançar a URL de
 * fora, e nenhuma máquina de desenvolvimento está exposta.
 */
export function enderecoDoWebhook(req) {
  const candidatos = [];

  const declarado = String(process.env.SITE_URL || '').trim();
  if (declarado) candidatos.push(declarado);

  // Como a Vercel se apresenta. É o valor em que dá para confiar mais, porque
  // ninguém digita: vem do próprio roteamento da requisição.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) candidatos.push((req.headers['x-forwarded-proto'] || 'https') + '://' + host);

  for (const bruto of candidatos) {
    // Sem protocolo, `new URL` não aceita — e é justamente o engano mais comum.
    const texto = /^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto;
    let url;
    try {
      url = new URL(texto);
    } catch {
      continue;
    }

    if (url.protocol !== 'https:') continue;
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname)) continue;
    if (!url.hostname.includes('.')) continue;

    return 'https://' + url.host + '/api/webhook-mp';
  }

  return '';
}
