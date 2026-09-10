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
  return { url: url.replace(/\/$/, ''), chave };
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
 */
export async function ehAdmin(id, env) {
  const r = await fetch(
    env.url + '/rest/v1/perfis?select=admin&id=eq.' + encodeURIComponent(id),
    { headers: cabecalhos(env.chave) }
  );
  if (!r.ok) return false;
  const linhas = await r.json();
  return !!(linhas[0] && linhas[0].admin === true);
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
