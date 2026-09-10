/**
 * Pedaços que api/admin.js e api/presenca.js usam do mesmo jeito.
 *
 * O nome começa com "_" de propósito: a Vercel não transforma esses arquivos
 * em endereços públicos, então isto aqui é biblioteca, não rota.
 */

export function ambiente() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error('Servidor sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.');
  }

  const papel = papelDaChave(chave);
  if (papel === 'publica') {
    throw new Error(
      'A variável SUPABASE_SERVICE_ROLE_KEY está com uma chave PÚBLICA. '
      + 'Ela precisa da chave secreta: Supabase > Project Settings > API Keys > '
      + 'seção "Secret keys" (a que começa com sb_secret_), ou, na aba '
      + '"Legacy anon, service_role API keys", a service_role.'
    );
  }

  return { url: url.replace(/\/$/, ''), chave };
}

/**
 * Diz se a chave é pública ou secreta, sem validar assinatura nenhuma — isso é
 * trabalho do Supabase; aqui só se lê o que a própria chave declara.
 *
 * Existe por um engano fácil e caro: a chave pública e a secreta ficam uma
 * embaixo da outra na mesma tela, com nomes parecidos. Trocar uma pela outra
 * produz o sintoma mais confuso possível — o login funciona (a chave pública
 * basta para o gateway), mas toda leitura de tabela volta vazia por causa do
 * RLS, e o servidor conclui "você não é administrador".
 *
 * Os dois formatos que o Supabase emite hoje:
 *   sb_publishable_... / sb_secret_...   formato novo
 *   JWT com `role` dentro                formato legado (anon / service_role)
 *
 * Devolve null para o que não se reconhece. Recusar chave desconhecida seria
 * pior do que deixar passar: quebraria o site por causa de um formato futuro.
 */
function papelDaChave(chave) {
  const texto = String(chave).trim();

  if (texto.startsWith('sb_secret_')) return 'secreta';
  if (texto.startsWith('sb_publishable_')) return 'publica';

  const partes = texto.split('.');
  if (partes.length !== 3) return null;
  try {
    const corpo = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    if (corpo.role === 'service_role') return 'secreta';
    if (corpo.role === 'anon' || corpo.role === 'authenticated') return 'publica';
    return null;
  } catch {
    return null;
  }
}

export function cabecalhos(chave, extra) {
  return {
    apikey: chave,
    Authorization: 'Bearer ' + chave,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

/**
 * Quem está falando, a partir do Bearer da sessão. Devolve null quando não dá
 * para dizer — token ausente, expirado ou inventado.
 */
export async function usuarioDoToken(req, env) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
  if (!token) return null;

  try {
    const r = await fetch(env.url + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: env.chave },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * O cargo é lido do banco, sempre.
 *
 * Nunca de um campo do token nem de nada que o navegador tenha mandado: se
 * "sou admin" pudesse vir de fora, bastaria alguém editar a requisição para
 * entrar no painel. O token só serve para dizer QUEM é a pessoa; o que ela
 * pode fazer quem responde é a tabela.
 *
 * TRÊS RESPOSTAS DIFERENTES, DE PROPÓSITO:
 *
 *   {achou: true,  admin: ...}  o perfil existe e o cargo é este
 *   {achou: false}              não há perfil para esta conta
 *   lança erro                  a consulta em si falhou
 *
 * A versão anterior devolvia `false` nos três casos. O resultado é que uma
 * chave errada nas variáveis de ambiente aparecia para o dono do site como
 * "esta área é só para administradores" — uma mensagem que aponta para o lugar
 * errado e não dá nenhuma pista do que consertar. Falha de infraestrutura tem
 * que soar como falha de infraestrutura.
 */
export async function lerCargo(id, env) {
  let r;
  try {
    r = await fetch(
      env.url + '/rest/v1/perfis?select=admin,email&id=eq.' + encodeURIComponent(id),
      { headers: cabecalhos(env.chave) }
    );
  } catch (err) {
    throw new Error('Não deu para falar com o banco: ' + err.message);
  }

  if (!r.ok) {
    const detalhe = (await r.text()).slice(0, 200);
    // 401/403 aqui é quase sempre SUPABASE_SERVICE_ROLE_KEY errada ou de outro
    // projeto — vale dizer isso em voz alta em vez de deixar adivinhar.
    const dica = (r.status === 401 || r.status === 403)
      ? ' Confira SUPABASE_SERVICE_ROLE_KEY e SUPABASE_URL nas variáveis de ambiente.'
      : '';
    throw new Error('O banco recusou a consulta do cargo (HTTP ' + r.status + ').' + dica +
      (detalhe ? ' Resposta: ' + detalhe : ''));
  }

  const linhas = await r.json();
  if (!linhas.length) return { achou: false };
  return { achou: true, admin: linhas[0].admin === true, email: linhas[0].email };
}

export async function rpc(nome, corpo, env) {
  const r = await fetch(env.url + '/rest/v1/rpc/' + nome, {
    method: 'POST',
    headers: cabecalhos(env.chave),
    body: JSON.stringify(corpo || {}),
  });
  if (!r.ok) throw new Error('rpc ' + nome + ': ' + r.status + ' ' + (await r.text()));
  return r.json();
}
