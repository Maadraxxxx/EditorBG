/**
 * Testa api/admin.js sem Supabase nem Vercel: o fetch e trocado por um dublê
 * que responde o que cada caso precisa. O que esta sendo verificado e a porta
 * de entrada — quem passa, quem nao passa, e as travas do "definir".
 */
process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-mentira';

const EU = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

let pedidos = [];

/** @param {{usuario: object|null, admin: boolean}} cenario */
function armarFetch(cenario) {
  pedidos = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    pedidos.push({ url: String(url), metodo: opcoes.method || 'GET', corpo: opcoes.body });
    const u = String(url);

    if (u.includes('/auth/v1/user')) {
      return cenario.usuario
        ? resposta(200, cenario.usuario)
        : resposta(401, { message: 'invalid token' });
    }
    if (u.includes('select=admin')) {
      return resposta(200, [{ admin: cenario.admin }]);
    }
    if (u.includes('select=plano')) {
      return resposta(200, [cenario.perfil || {}]);
    }
    if (u.includes('/rpc/resumo_admin')) {
      return resposta(200, { contas: 7, faturado: 59.7 });
    }
    if (u.includes('/rest/v1/perfis') && (opcoes.method || 'GET') === 'GET') {
      return resposta(200, [{ id: OUTRO, email: 'alguem@x.com', vip: false, admin: false }]);
    }
    if (u.includes('/rest/v1/perfis') && opcoes.method === 'PATCH') {
      const mudou = JSON.parse(opcoes.body);
      return resposta(200, [{ id: OUTRO, email: 'alguem@x.com', vip: !!mudou.vip, admin: !!mudou.admin }]);
    }
    return resposta(500, { erro: 'url nao prevista: ' + u });
  };
}

function resposta(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
  };
}

function fingirRes() {
  const r = { codigo: 0, corpo: null };
  r.setHeader = () => {};
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (c) => { r.corpo = c; return r; };
  return r;
}

const { default: handler } = await import('../api/admin.js');

let falhas = 0;
async function caso(nome, cenario, req, esperado) {
  armarFetch(cenario);
  const res = fingirRes();
  await handler({ method: 'POST', headers: {}, ...req }, res);

  const real = res.codigo + ' | ' + (res.corpo.motivo || JSON.stringify(res.corpo).slice(0, 60));
  const passou = real.startsWith(esperado);
  if (!passou) falhas++;
  console.log((passou ? '  ok  ' : ' FALHA') + '  ' + nome);
  console.log('        esperado: ' + esperado);
  console.log('        recebido: ' + real);
}

const comToken = { headers: { authorization: 'Bearer token-qualquer' } };
const admin = { usuario: { id: EU, email: 'dono@x.com' }, admin: true };
const comum = { usuario: { id: EU, email: 'ze@x.com' }, admin: false };
const ninguem = { usuario: null, admin: false };

console.log('\n--- a porta de entrada ---');
await caso('GET e recusado', admin, { method: 'GET' }, '405');
await caso('sem token -> 401', admin, { body: { acao: 'resumo' } }, '401');
await caso('token invalido -> 401', ninguem, { ...comToken, body: { acao: 'resumo' } }, '401');
await caso('logado mas nao admin -> 403', comum, { ...comToken, body: { acao: 'resumo' } }, '403');
await caso('admin passa', admin, { ...comToken, body: { acao: 'resumo' } }, '200');
await caso('acao inventada -> 400', admin, { ...comToken, body: { acao: 'apagar-tudo' } }, '400');

console.log('\n--- travas do definir ---');
await caso('id que nao e uuid', admin, { ...comToken, body: { acao: 'definir', id: 'x; drop table', vip: true } },
  '400 | Conta inválida.');
await caso('nada para mudar', admin, { ...comToken, body: { acao: 'definir', id: OUTRO } },
  '400 | Nada para mudar.');
await caso('tirar o proprio admin', admin, { ...comToken, body: { acao: 'definir', id: EU, admin: false } },
  '400 | Você não pode tirar o seu próprio cargo de administrador.');
await caso('dar vip para outro', admin, { ...comToken, body: { acao: 'definir', id: OUTRO, vip: true } }, '200');
await caso('vip como texto e ignorado', admin, { ...comToken, body: { acao: 'definir', id: OUTRO, vip: 'sim' } },
  '400 | Nada para mudar.');

/* ------------------------------------------------------------------ *
 * O interruptor de VIP nao pode reescrever um plano pago
 * ------------------------------------------------------------------ *
 * Aconteceu de verdade: desligar e religar o VIP de quem tinha comprado o
 * vitalicio transformava o plano dele em "cortesia". O painel manda no ACESSO,
 * nao no que a pessoa comprou.
 */
console.log('\n--- o interruptor de VIP e o plano pago ---');

async function mudarVip(perfil, ligar) {
  armarFetch({ ...admin, perfil });
  const resposta2 = fingirRes();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: { acao: 'definir', id: OUTRO, vip: ligar },
  }, resposta2);
  const patch = pedidos.find((p) => p.metodo === 'PATCH');
  return patch ? JSON.parse(patch.corpo) : {};
}

function conferir(nome, condicao, enviado) {
  if (!condicao) falhas++;
  console.log((condicao ? '  ok  ' : ' FALHA') + '  ' + nome);
  if (!condicao) console.log('        mandou: ' + JSON.stringify(enviado));
}

const pago = { plano: 'vitalicio', vip_ate: null };
const mensal = { plano: 'mensal', vip_ate: new Date(Date.now() + 20 * 86400e3).toISOString() };
const vencido = { plano: 'mensal', vip_ate: new Date(Date.now() - 86400e3).toISOString() };

let g = await mudarVip(pago, false);
conferir('desligar nao toca no plano pago', !('plano' in g) && !('vip_ate' in g), g);

g = await mudarVip(pago, true);
conferir('religar quem tem vitalicio nao vira cortesia', !('plano' in g), g);

g = await mudarVip(mensal, true);
conferir('religar quem tem mensal valendo mantem o mensal', !('plano' in g), g);

g = await mudarVip(vencido, true);
conferir('plano vencido vira cortesia ao religar', g.plano === 'cortesia', g);

g = await mudarVip({}, true);
conferir('conta sem plano ganha cortesia sem prazo', g.plano === 'cortesia' && g.vip_ate === null, g);

console.log('\n--- a busca vai limpa para o PostgREST ---');
armarFetch(admin);
const res = fingirRes();
await handler({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body: { acao: 'listar', busca: 'ze@x.com,vip.is.true),(id' },
}, res);
const consulta = pedidos.find((p) => p.url.includes('ilike'));
const sujo = /[,()]/.test(decodeURIComponent(consulta.url.split('ilike.')[1]));
console.log((sujo ? ' FALHA' : '  ok  ') + '  virgula e parenteses removidos do filtro');
console.log('        filtro: ' + decodeURIComponent(consulta.url.split('ilike.')[1]));
if (sujo) falhas++;

console.log('\n' + (falhas ? falhas + ' FALHA(S)' : 'tudo passou') + '\n');
process.exit(falhas ? 1 : 0);
