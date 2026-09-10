/**
 * Painel de controle: números do site e gestão de contas.
 *
 * PORTA ÚNICA. Tudo o que o painel faz passa por aqui, e a primeira coisa que
 * acontece em qualquer chamada é conferir o cargo no banco. Esconder o botão
 * do painel no navegador não protege nada — quem quiser chama o endereço
 * direto. O que protege é esta checagem, e o fato de a tabela `perfis` não ter
 * política de UPDATE nenhuma para o cliente.
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL               URL do projeto
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key — NUNCA vá para o navegador
 */

import { ambiente, cabecalhos, usuarioDoToken, lerCargo, rpc } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
  }

  let env;
  try {
    env = ambiente();
  } catch (err) {
    return res.status(500).json({ ok: false, motivo: err.message });
  }

  /* ---- quem é, e se pode ---- */
  const usuario = await usuarioDoToken(req, env);
  if (!usuario) {
    return res.status(401).json({ ok: false, motivo: 'Entre na sua conta.' });
  }

  let cargo;
  try {
    cargo = await lerCargo(usuario.id, env);
  } catch (err) {
    // Não conseguimos conferir o cargo. Isso NÃO é o mesmo que "você não é
    // admin", e devolver 403 aqui mandaria o dono do site procurar no lugar
    // errado.
    console.error('admin: falhou ao ler o cargo —', err.message);
    return res.status(500).json({ ok: false, motivo: err.message });
  }

  if (!cargo.achou) {
    // Com a service_role key correta o RLS é ignorado, e toda conta logada tem
    // perfil (o gatilho cria junto com a conta). Chegar aqui quase sempre quer
    // dizer que a chave nas variáveis de ambiente não é a service_role: a
    // consulta passa, mas volta vazia porque o RLS filtrou tudo.
    return res.status(500).json({
      ok: false,
      conta: usuario.email,
      motivo: 'A consulta do perfil voltou vazia. O motivo mais comum é '
        + 'SUPABASE_SERVICE_ROLE_KEY estar com a chave errada — confira se é '
        + 'mesmo a service_role, e não a anon. '
        + '(A outra possibilidade é esta conta não ter linha em `perfis`.)',
    });
  }

  if (!cargo.admin) {
    // Devolve o e-mail que o SERVIDOR enxergou. Quando alguém jura que é
    // administrador e leva 403, quase sempre está logado em outra conta — e
    // essa linha resolve a dúvida na hora.
    return res.status(403).json({
      ok: false,
      conta: usuario.email,
      motivo: 'Esta área é só para administradores.',
    });
  }

  const corpo = req.body || {};

  try {
    switch (corpo.acao) {
      case 'resumo':
        return res.status(200).json({ ok: true, resumo: await rpc('resumo_admin', {}, env) });

      case 'listar':
        return res.status(200).json({ ok: true, pessoas: await listar(corpo, env) });

      case 'definir':
        return res.status(200).json({ ok: true, pessoa: await definir(corpo, usuario, env) });

      default:
        return res.status(400).json({ ok: false, motivo: 'Ação desconhecida.' });
    }
  } catch (err) {
    // 400 quando o pedido e que estava errado, 500 quando fomos nos. Devolver
    // 500 para um id mal digitado faria parecer que o servidor caiu.
    const codigo = err.pedidoRuim ? 400 : 500;
    if (codigo === 500) console.error('admin:', err);
    return res.status(codigo).json({ ok: false, motivo: err.message });
  }
}

/** Erro de quem pediu, nao de quem respondeu. */
function recusa(mensagem) {
  const err = new Error(mensagem);
  err.pedidoRuim = true;
  return err;
}

/* ------------------------------------------------------------------ *
 * Listar contas
 * ------------------------------------------------------------------ */
async function listar(corpo, env) {
  const limite = Math.min(Math.max(Number(corpo.limite) || 100, 1), 500);

  // A busca entra num filtro do PostgREST, onde vírgula e parêntese têm
  // significado. Em vez de escapar, só deixo passar o que compõe um e-mail:
  // o resto não teria como ajudar a encontrar ninguém mesmo.
  const termo = String(corpo.busca || '').replace(/[^a-zA-Z0-9@._+\- ]/g, '').trim();

  let endereco = env.url + '/rest/v1/perfis'
    + '?select=id,email,vip,admin,criado_em,ultimo_acesso'
    + '&order=criado_em.desc&limit=' + limite;

  if (termo) endereco += '&email=ilike.' + encodeURIComponent('*' + termo + '*');

  const r = await fetch(endereco, { headers: cabecalhos(env.chave) });
  if (!r.ok) throw new Error('Não deu para ler as contas: ' + (await r.text()));
  return r.json();
}

/* ------------------------------------------------------------------ *
 * Mudar cargo e plano
 * ------------------------------------------------------------------ */
async function definir(corpo, quemPede, env) {
  const id = String(corpo.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw recusa('Conta inválida.');

  const mudancas = { atualizado_em: new Date().toISOString() };
  if (typeof corpo.vip === 'boolean') mudancas.vip = corpo.vip;
  if (typeof corpo.admin === 'boolean') mudancas.admin = corpo.admin;

  if (Object.keys(mudancas).length === 1) throw recusa('Nada para mudar.');

  // Tiro no pé: se o último admin se rebaixasse, o painel ficaria sem ninguém
  // que conseguisse entrar, e não haveria como desfazer pela tela — só mexendo
  // no banco à mão.
  if (id === quemPede.id && mudancas.admin === false) {
    throw recusa('Você não pode tirar o seu próprio cargo de administrador.');
  }

  const r = await fetch(env.url + '/rest/v1/perfis?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: cabecalhos(env.chave, { Prefer: 'return=representation' }),
    body: JSON.stringify(mudancas),
  });
  if (!r.ok) throw new Error('Não deu para salvar: ' + (await r.text()));

  const linhas = await r.json();
  if (!linhas.length) throw recusa('Conta não encontrada.');

  const alvo = linhas[0];
  console.log('admin', quemPede.email, 'mudou', alvo.email, JSON.stringify(mudancas));
  return alvo;
}
