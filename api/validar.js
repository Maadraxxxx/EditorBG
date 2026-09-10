/**
 * Confirma o pagamento e promove a conta a VIP.
 *
 * Esta é a única parte que precisa de servidor, e por dois motivos:
 *
 * 1. O status que o Mercado Pago devolve na URL não vale como prova — qualquer
 *    pessoa digitaria `?status=approved` na barra de endereços. Quem decide é a
 *    API deles, consultada com um token que não pode ficar no navegador.
 * 2. A coluna `vip` é protegida por Row Level Security: o navegador lê, mas não
 *    escreve. Só a service role key promove alguém — e ela vive aqui.
 *
 * Feita para a Vercel (grátis no plano hobby). Variáveis de ambiente:
 *
 *   MP_ACCESS_TOKEN            Access Token de produção do Mercado Pago
 *   SUPABASE_URL               URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key — NUNCA vá para o navegador
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!mpToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ ok: false, motivo: 'Servidor sem as variáveis de ambiente configuradas.' });
  }

  const pagamentoId = String((req.body && req.body.payment_id) || '').trim();
  if (!/^\d+$/.test(pagamentoId)) {
    return res.status(400).json({ ok: false, motivo: 'Código de pagamento inválido.' });
  }

  /* ---- 1. de quem é a sessão que está pedindo ---- */
  const autorizacao = req.headers.authorization || '';
  const tokenUsuario = autorizacao.startsWith('Bearer ') ? autorizacao.slice(7) : '';
  if (!tokenUsuario) {
    return res.status(401).json({ ok: false, motivo: 'Entre na sua conta antes de confirmar o pagamento.' });
  }

  let usuario;
  try {
    const r = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + tokenUsuario, apikey: serviceKey },
    });
    if (!r.ok) throw new Error('token recusado');
    usuario = await r.json();
  } catch {
    return res.status(401).json({ ok: false, motivo: 'Sessão expirada. Entre de novo e tente outra vez.' });
  }

  /* ---- 2. o pagamento existe e foi aprovado? ---- */
  let pagamento;
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + pagamentoId, {
      headers: { Authorization: 'Bearer ' + mpToken },
    });
    if (r.status === 404) {
      return res.status(404).json({ ok: false, motivo: 'Pagamento não encontrado. Confira o código.' });
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    pagamento = await r.json();
  } catch (err) {
    console.error('Falha ao consultar o Mercado Pago:', err);
    return res.status(502).json({ ok: false, motivo: 'Não deu para falar com o Mercado Pago agora.' });
  }

  if (pagamento.status !== 'approved') {
    const motivos = {
      pending: 'Pagamento ainda pendente. Se pagou por Pix, aguarde alguns segundos e tente de novo.',
      in_process: 'Pagamento em análise. Tente de novo daqui a pouco.',
      rejected: 'Pagamento recusado.',
      cancelled: 'Pagamento cancelado.',
      refunded: 'Pagamento estornado.',
    };
    return res.status(402).json({ ok: false, motivo: motivos[pagamento.status] || 'Pagamento não aprovado.' });
  }

  /* ---- 3. esse pagamento já liberou alguma conta? ---- */
  const cabecalhos = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  };

  try {
    const jaUsado = await fetch(
      supabaseUrl + '/rest/v1/perfis?pagamento_id=eq.' + pagamentoId + '&select=id',
      { headers: cabecalhos }
    ).then((r) => r.json());

    if (Array.isArray(jaUsado) && jaUsado.length && jaUsado[0].id !== usuario.id) {
      return res.status(409).json({ ok: false, motivo: 'Este pagamento já liberou outra conta.' });
    }

    /* ---- 4. promove ---- */
    const r = await fetch(supabaseUrl + '/rest/v1/perfis?id=eq.' + usuario.id, {
      method: 'PATCH',
      headers: { ...cabecalhos, Prefer: 'return=representation' },
      body: JSON.stringify({ vip: true, pagamento_id: pagamentoId, atualizado_em: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error('PATCH ' + r.status + ' ' + (await r.text()));
  } catch (err) {
    console.error('Falha ao gravar o plano:', err);
    return res.status(500).json({ ok: false, motivo: 'Pagamento confirmado, mas falhou ao liberar o plano. Fale com o suporte.' });
  }

  /* ---- 5. registra o dinheiro ---- */
  // Mesmo registro que o webhook faz. Este caminho é o plano B, usado quando a
  // notificação não chega; sem gravar aqui também, um pagamento liberado por
  // ele sumiria do faturamento do painel.
  try {
    await fetch(supabaseUrl + '/rest/v1/pagamentos', {
      method: 'POST',
      headers: { ...cabecalhos, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: pagamentoId,
        usuario_id: usuario.id,
        email: (pagamento.payer && pagamento.payer.email) || usuario.email || null,
        valor: pagamento.transaction_amount || 0,
        moeda: pagamento.currency_id || 'BRL',
        meio: pagamento.payment_method_id || null,
        status: pagamento.status,
        criado_em: pagamento.date_approved || pagamento.date_created || new Date().toISOString(),
      }),
    });
  } catch (err) {
    // O plano já foi liberado; um número torto no painel não justifica devolver
    // erro para quem acabou de pagar.
    console.error('Não deu para registrar o pagamento:', err);
  }

  return res.status(200).json({ ok: true, vip: true });
}
