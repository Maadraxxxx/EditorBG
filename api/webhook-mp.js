/**
 * Webhook do Mercado Pago: promove a conta assim que o pagamento é aprovado.
 *
 * É esta função que torna a confirmação automática de verdade. Ela não depende
 * do navegador da pessoa: o Mercado Pago avisa o servidor direto, mesmo que ela
 * tenha fechado a aba, pago pelo celular ou o Pix só compensado depois.
 *
 * SEGURANÇA: o conteúdo da notificação NÃO é levado a sério. Ela serve apenas
 * como aviso de "olhe o pagamento X"; quem responde se ele existe, se foi
 * aprovado e de quem é somos nós, consultando a API do Mercado Pago com o nosso
 * token. Assim uma notificação forjada não libera nada — no máximo faz o
 * servidor consultar um pagamento que não existe.
 *
 * Variáveis de ambiente:
 *   MP_ACCESS_TOKEN            Access Token de produção do Mercado Pago
 *   SUPABASE_URL               URL do projeto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // O Mercado Pago reenvia a notificação se não receber 200 rápido. Qualquer
  // resposta de erro nossa vira retentativa, então só devolvemos erro quando
  // vale a pena tentar de novo.
  const ok = () => res.status(200).json({ recebido: true });

  const mpToken = process.env.MP_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!mpToken || !supabaseUrl || !serviceKey) {
    console.error('webhook sem variáveis de ambiente');
    return res.status(500).json({ erro: 'sem configuração' });
  }

  // O Mercado Pago manda em dois formatos, dependendo da integração.
  const corpo = req.body || {};
  const pagamentoId = String(
    (corpo.data && corpo.data.id) || corpo.id || req.query.id || req.query['data.id'] || ''
  ).trim();
  const tipo = corpo.type || corpo.topic || req.query.type || req.query.topic || '';

  if (tipo && !String(tipo).includes('payment')) return ok();   // não é sobre pagamento
  if (!/^\d+$/.test(pagamentoId)) return ok();                  // nada a fazer

  /* ---- a fonte da verdade é a API deles, não o que chegou aqui ---- */
  let pagamento;
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + pagamentoId, {
      headers: { Authorization: 'Bearer ' + mpToken },
    });
    if (r.status === 404) return ok();          // pagamento inexistente: ignora
    if (!r.ok) throw new Error('HTTP ' + r.status);
    pagamento = await r.json();
  } catch (err) {
    console.error('Falha ao consultar o pagamento:', err);
    return res.status(500).json({ erro: 'consulta falhou' });   // deixa reenviar
  }

  if (pagamento.status !== 'approved') return ok();   // pendente ou recusado: nada a fazer ainda

  const usuarioId = pagamento.external_reference;
  if (!usuarioId) {
    console.error('Pagamento aprovado sem external_reference:', pagamentoId);
    return ok();
  }

  /* ---- promove ---- */
  const cabecalhos = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  };

  try {
    const r = await fetch(supabaseUrl + '/rest/v1/perfis?id=eq.' + encodeURIComponent(usuarioId), {
      method: 'PATCH',
      headers: { ...cabecalhos, Prefer: 'return=representation' },
      body: JSON.stringify({
        vip: true,
        pagamento_id: pagamentoId,
        atualizado_em: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error('PATCH ' + r.status + ' ' + (await r.text()));
    console.log('VIP liberado para', usuarioId, 'pelo pagamento', pagamentoId);
  } catch (err) {
    console.error('Falha ao gravar o plano:', err);
    return res.status(500).json({ erro: 'gravação falhou' });   // deixa reenviar
  }

  /* ---- registra o dinheiro ---- */
  // Separado do bloco acima de propósito: o que libera o VIP é o perfil, e se
  // esta gravação falhar a pessoa não pode ficar sem o que pagou. O prejuízo
  // aqui é um número errado no painel, não um cliente sem acesso.
  //
  // merge-duplicates porque o Mercado Pago reenvia a mesma notificação: o id do
  // pagamento é a chave, então repetir atualiza em vez de duplicar o faturamento.
  try {
    const r = await fetch(supabaseUrl + '/rest/v1/pagamentos', {
      method: 'POST',
      headers: { ...cabecalhos, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: pagamentoId,
        usuario_id: usuarioId,
        email: (pagamento.payer && pagamento.payer.email) || null,
        valor: pagamento.transaction_amount || 0,
        moeda: pagamento.currency_id || 'BRL',
        meio: pagamento.payment_method_id || null,
        status: pagamento.status,
        criado_em: pagamento.date_approved || pagamento.date_created || new Date().toISOString(),
      }),
    });
    if (!r.ok) console.error('Não deu para registrar o pagamento:', await r.text());
  } catch (err) {
    console.error('Não deu para registrar o pagamento:', err);
  }

  return ok();
}
