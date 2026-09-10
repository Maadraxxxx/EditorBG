/**
 * Testa a lógica dos planos sem Supabase nem Mercado Pago.
 * Importar os módulos de verdade já pega import quebrado e variável sem declarar.
 */
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_mentira';
process.env.MP_ACCESS_TOKEN = 'APP_USR-mentira';

const { PLANOS, novaValidade, vipAtivo, planoDoPagamento, planoPeloValor, precoEscrito } =
  await import('../js/planos.js');

let falhas = 0;
function ok(nome, real, esperado) {
  const passou = JSON.stringify(real) === JSON.stringify(esperado);
  if (!passou) falhas++;
  console.log((passou ? '  ok  ' : ' FALHA') + '  ' + nome);
  if (!passou) console.log('        esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(real));
}

const dia = (iso) => iso === null ? null : new Date(iso).toISOString().slice(0, 10);

console.log('\n--- precos ---');
ok('mensal',     precoEscrito('mensal'),     'R$ 4,90');
ok('trimestral', precoEscrito('trimestral'), 'R$ 12,90');
ok('vitalicio',  precoEscrito('vitalicio'),  'R$ 19,90');

console.log('\n--- validade a partir do zero ---');
ok('1 mes',   dia(novaValidade('mensal',     null, '2026-03-10T12:00:00Z')), '2026-04-10');
ok('3 meses', dia(novaValidade('trimestral', null, '2026-03-10T12:00:00Z')), '2026-06-10');
ok('vitalicio nao expira', novaValidade('vitalicio', null), null);
ok('plano inventado', novaValidade('gratis-pra-sempre', null), undefined);

console.log('\n--- o pulo de calendario ---');
ok('31/01 + 1 mes nao vira 03/03', dia(novaValidade('mensal', null, '2026-01-31T12:00:00Z')), '2026-02-28');
ok('31/03 + 1 mes',                dia(novaValidade('mensal', null, '2026-03-31T12:00:00Z')), '2026-04-30');
ok('29/02 bissexto + 3 meses',     dia(novaValidade('trimestral', null, '2028-02-29T12:00:00Z')), '2028-05-29');

console.log('\n--- renovar soma, nao substitui ---');
ok('renova com 2 meses pela frente',
  dia(novaValidade('mensal', '2026-05-10T12:00:00Z', '2026-03-10T12:00:00Z')), '2026-06-10');
ok('renova depois de vencido conta de hoje',
  dia(novaValidade('mensal', '2026-01-10T12:00:00Z', '2026-03-10T12:00:00Z')), '2026-04-10');

console.log('\n--- vipAtivo ---');
const futuro = new Date(Date.now() + 86400e3).toISOString();
const passado = new Date(Date.now() - 86400e3).toISOString();
ok('sem conta',            vipAtivo(null), false);
ok('vip false',            vipAtivo({ vip: false, vip_ate: futuro }), false);
ok('vitalicio',            vipAtivo({ vip: true, vip_ate: null }), true);
ok('dentro do prazo',      vipAtivo({ vip: true, vip_ate: futuro }), true);
ok('VENCIDO nao e mais vip', vipAtivo({ vip: true, vip_ate: passado }), false);

console.log('\n--- de qual plano foi o pagamento ---');
ok('valor manda sobre metadata',
  planoDoPagamento({ transaction_amount: 4.90, metadata: { plano: 'vitalicio' } }), 'mensal');
ok('metadata quando o valor nao bate',
  planoDoPagamento({ transaction_amount: 7.77, metadata: { plano: 'trimestral' } }), 'trimestral');
ok('sem nada utilizavel vira vitalicio',
  planoDoPagamento({ transaction_amount: 7.77, metadata: {} }), 'vitalicio');
ok('pagamento antigo de 19,90', planoDoPagamento({ transaction_amount: 19.90 }), 'vitalicio');
ok('valor que nao existe', planoPeloValor(9.99), undefined);

/* ------------------------------------------------------------------ *
 * liberarPlano, com o banco dublado
 * ------------------------------------------------------------------ */
const { liberarPlano } = await import('../api/_supabase.js');
const env = { url: 'https://exemplo.supabase.co', chave: 'sb_secret_mentira' };

async function liberar(perfilAtual, planoId) {
  let gravado = null;
  globalThis.fetch = async (url, opcoes = {}) => {
    if ((opcoes.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [perfilAtual], text: async () => '' };
    }
    gravado = JSON.parse(opcoes.body);
    return { ok: true, status: 200, json: async () => [gravado], text: async () => '' };
  };
  await liberarPlano('id-qualquer', planoId, 'pag-1', env);
  return gravado;
}

console.log('\n--- liberarPlano ---');
let g = await liberar({ vip: false, vip_ate: null }, 'mensal');
ok('conta nova ganha prazo', typeof g.vip_ate === 'string' && g.vip === true, true);
ok('grava qual plano foi', g.plano, 'mensal');

g = await liberar({ vip: false, vip_ate: null }, 'vitalicio');
ok('vitalicio grava sem data', g.vip_ate, null);

// O caso que mais importa: nao rebaixar quem ja tem vitalicio.
g = await liberar({ vip: true, vip_ate: null }, 'mensal');
ok('VITALICIO nao vira mensal', g.vip_ate, null);

// Renovacao soma
const daquiTresMeses = new Date(Date.now() + 90 * 86400e3).toISOString();
g = await liberar({ vip: true, vip_ate: daquiTresMeses }, 'mensal');
const somou = new Date(g.vip_ate) > new Date(daquiTresMeses);
ok('renovar soma ao que falta', somou, true);

/* ------------------------------------------------------------------ *
 * api/pagar.js — o preco e do servidor
 * ------------------------------------------------------------------ */
const { default: pagar } = await import('../api/pagar.js');

async function tentarPagar(corpo) {
  let enviadoAoMP = null;
  globalThis.fetch = async (url, opcoes = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@b.com' }) };
    }
    if (u.includes('api.mercadopago.com')) {
      enviadoAoMP = JSON.parse(opcoes.body);
      return { ok: true, status: 200, json: async () => ({ id: 1, status: 'approved' }) };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };

  const res = { codigo: 0, corpo: null };
  res.setHeader = () => {};
  res.status = (c) => { res.codigo = c; return res; };
  res.json = (c) => { res.corpo = c; return res; };

  await pagar({
    method: 'POST',
    headers: { authorization: 'Bearer t', 'x-forwarded-host': 'editorbg.com.br' },
    body: corpo,
  }, res);

  return { res, enviadoAoMP };
}

console.log('\n--- o navegador nao escolhe o preco ---');
let r = await tentarPagar({ plano: 'mensal', formData: { transaction_amount: 0.01, payment_method_id: 'pix' } });
ok('pediu mensal, cobra 4,90 mesmo mandando 0,01', r.enviadoAoMP.transaction_amount, 4.90);
ok('manda o plano no metadata', r.enviadoAoMP.metadata, { plano: 'mensal' });

r = await tentarPagar({ plano: 'vitalicio', formData: { payment_method_id: 'pix' } });
ok('vitalicio cobra 19,90', r.enviadoAoMP.transaction_amount, 19.90);

r = await tentarPagar({ plano: 'de-graca', formData: { payment_method_id: 'pix' } });
ok('plano inventado e recusado', r.res.codigo, 400);

r = await tentarPagar({ formData: { payment_method_id: 'pix' } });
ok('sem plano usa o padrao', r.enviadoAoMP.transaction_amount, PLANOS.trimestral.valor);

ok('webhook aponta para o dominio certo',
  r.enviadoAoMP.notification_url, 'https://editorbg.com.br/api/webhook-mp');

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo passou') + '\n');
process.exit(falhas ? 1 : 0);
