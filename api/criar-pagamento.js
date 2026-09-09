/**
 * Cria a cobrança no Mercado Pago já amarrada à conta de quem está comprando.
 *
 * É esta amarração que permite a confirmação automática: a preferência leva
 * `external_reference = id do usuário`, então quando o pagamento é aprovado o
 * webhook sabe exatamente qual conta promover — sem ninguém digitar código.
 *
 * Um link de pagamento estático não serve para isso: ele é o mesmo para todo
 * mundo, e o webhook não teria como saber de quem foi o pagamento.
 *
 * Variáveis de ambiente:
 *   MP_ACCESS_TOKEN            Access Token de produção do Mercado Pago
 *   SUPABASE_URL               URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key — NUNCA vá para o navegador
 *   SITE_URL                   endereço público do site (ex.: https://editorbg.vercel.app)
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

  /* ---- cria a preferência ---- */
  const voltar = siteUrl.replace(/\/$/, '') + '/remover-fundo.html';

  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mpToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          title: 'EditorBG VIP — acesso vitalício',
          description: 'Resolução original, recorte em duas passadas e modelo Detalhes finos.',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: preco,
        }],
        // A conta que será promovida quando o pagamento for aprovado.
        external_reference: usuario.id,
        payer: { email: usuario.email },
        back_urls: { success: voltar, pending: voltar, failure: voltar },
        auto_return: 'approved',
        notification_url: siteUrl.replace(/\/$/, '') + '/api/webhook-mp',
statement_descriptor: 'EDITORBG',
      }),
    });

    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()));
    const pref = await r.json();
    return res.status(200).json({ ok: true, url: pref.init_point });
  } catch (err) {
    console.error('Falha ao criar a cobrança:', err);
    return res.status(502).json({ ok: false, motivo: 'Não deu para abrir o pagamento agora. Tente de novo.' });
  }
}
