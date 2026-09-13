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
import { saqueMinimo } from './_afiliados.js';

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

      case 'saques':
        return res.status(200).json({
          ok: true,
          saques: await listarSaques(env),
          minimo: await saqueMinimo(env),
        });

      case 'resolver-saque':
        return res.status(200).json({ ok: true, saque: await resolverSaque(corpo, env) });

      case 'saque-minimo':
        return res.status(200).json({ ok: true, minimo: await definirMinimo(corpo, env) });

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

/** O que a conta tem hoje, para não sobrescrever um plano pago sem querer. */
async function lerPlano(id, env) {
  const r = await fetch(
    env.url + '/rest/v1/perfis?select=plano,vip_ate&id=eq.' + encodeURIComponent(id),
    { headers: cabecalhos(env.chave) }
  );
  if (!r.ok) return {};
  const linhas = await r.json();
  return linhas[0] || {};
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
    + '?select=id,email,vip,vip_ate,plano,admin,criado_em,ultimo_acesso'
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

  if (typeof corpo.vip === 'boolean') {
    mudancas.vip = corpo.vip;

    if (!corpo.vip) {
      // Desligar mexe SÓ no acesso. A versão anterior zerava `plano` e
      // `vip_ate` junto, e o efeito era apagar o registro de quem tinha pagado:
      // desligar e religar o interruptor transformava um vitalício comprado em
      // "cortesia". O que a pessoa comprou não é do painel para reescrever.
    } else {
      const atual = await lerPlano(id, env);
      const temPlanoValendo = atual.plano
        && atual.plano !== 'cortesia'
        && (atual.vip_ate === null || new Date(atual.vip_ate) > new Date());

      if (!temPlanoValendo) {
        // Cortesia não vence: cobrar de novo de quem você presenteou seria
        // estranho. Marcada como 'cortesia' para não virar faturamento.
        mudancas.vip_ate = null;
        mudancas.plano = 'cortesia';
      }
      // Com plano pago ainda válido, religar apenas devolve o acesso.
    }
  }

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


/* ------------------------------------------------------------------ *
 * Indicacoes: saques e o minimo
 * ------------------------------------------------------------------ */

/** Os pedidos de saque, os pendentes primeiro. */
async function listarSaques(env) {
  const r = await fetch(
    env.url + '/rest/v1/saques'
      + '?select=id,afiliado_id,valor,chave_pix,status,motivo,criado_em,resolvido_em'
      + '&order=status.asc,criado_em.asc&limit=200',
    { headers: cabecalhos(env.chave) }
  );
  if (!r.ok) throw new Error('Nao deu para ler os saques.');
  const saques = await r.json();
  if (!saques.length) return saques;

  // O e-mail vem do perfil, numa consulta so: sem isto, a tela mostraria um
  // uuid e ninguem saberia para quem esta pagando.
  const ids = [...new Set(saques.map((s) => s.afiliado_id))];
  const rp = await fetch(
    env.url + '/rest/v1/perfis?select=id,email&id=in.(' + ids.join(',') + ')',
    { headers: cabecalhos(env.chave) }
  );
  const perfis = rp.ok ? await rp.json() : [];
  const porId = Object.fromEntries(perfis.map((p) => [p.id, p.email]));
  return saques.map((s) => ({ ...s, email: porId[s.afiliado_id] || null }));
}

/**
 * Marca um saque como pago ou recusado.
 *
 * Recusar DEVOLVE o dinheiro ao saldo, porque o calculo do saldo so desconta
 * saque 'pedido' ou 'pago'. Por isso a recusa pede um motivo: quem pediu vai
 * ver o saldo voltar e precisa entender por que.
 */
async function resolverSaque(corpo, env) {
  const id = String(corpo.id || '');
  const status = corpo.status;
  if (!id) throw recusa('Qual saque?');
  if (status !== 'pago' && status !== 'recusado') throw recusa('Situacao invalida.');
  if (status === 'recusado' && !String(corpo.motivo || '').trim()) {
    throw recusa('Escreva o motivo da recusa.');
  }

  const r = await fetch(env.url + '/rest/v1/saques?id=eq.' + encodeURIComponent(id)
    + '&status=eq.pedido', {
    method: 'PATCH',
    headers: cabecalhos(env.chave, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      status,
      motivo: String(corpo.motivo || '').trim() || null,
      resolvido_em: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error('Nao deu para atualizar o saque.');

  const linhas = await r.json();
  // O filtro status=eq.pedido e a protecao contra dois cliques: o segundo nao
  // acha linha nenhuma em vez de reescrever um saque ja resolvido.
  if (!linhas.length) throw recusa('Este saque ja tinha sido resolvido.');
  return linhas[0];
}

/** Muda o minimo para sacar, sem publicar codigo novo. */
async function definirMinimo(corpo, env) {
  const valor = Number(corpo.valor);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100000) {
    throw recusa('Valor invalido para o saque minimo.');
  }
  const r = await fetch(env.url + '/rest/v1/configuracoes?chave=eq.saque_minimo', {
    method: 'PATCH',
    headers: cabecalhos(env.chave, { Prefer: 'return=representation' }),
    body: JSON.stringify({ valor, atualizado_em: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('Nao deu para gravar o minimo.');
  const linhas = await r.json();
  return linhas[0] ? Number(linhas[0].valor) : valor;
}
