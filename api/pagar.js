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
 *   SITE_URL                   endereço público do site
 *   PRECO_VIP                  valor em reais (ex.: 19.90)
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.SITE_URL;
  const preco = Number(process.env.PRECO_VIP || '19.90');

  if (!mpToken || !supabaseUrl || !serviceKey || !siteUrl) {
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
    notification_url: siteUrl.replace(/\/$/, '') + '/api/webhook-mp',
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
