/**
 * Conta quem passou pelo site e quem está com a aba aberta agora.
 *
 * Duas coisas, numa chamada só:
 *   - visita   — soma 1 no dia, uma vez por pessoa. "Pessoa" aqui é um hash de
 *                IP + navegador, feito aqui dentro com a service key como sal.
 *                O IP não é gravado em lugar nenhum: o site inteiro se sustenta
 *                na promessa de que nada sai do computador de quem usa, e um
 *                banco cheio de endereços de rede contradiria isso.
 *   - presença — carimba `ultimo_acesso` de quem está logado, que é como o
 *                painel sabe quantas contas estão ativas.
 *
 * Aberta para qualquer visitante, de propósito — é ela que conta visitante
 * deslogado. O estrago que alguém decidido consegue fazer é inflar um número
 * de vaidade, e a trava por IP+navegador já torna isso trabalhoso.
 */

import crypto from 'node:crypto';
import { ambiente, cabecalhos, usuarioDoToken, rpc } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  let env;
  try {
    env = ambiente();
  } catch {
    // Sem configuração isto é decoração: não vale derrubar a página de ninguém.
    return res.status(200).json({ ok: false });
  }

  const resposta = { ok: true, contou: false };

  /* ---- visita ---- */
  try {
    const ip = String(
      req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''
    ).split(',')[0].trim();
    const navegador = String(req.headers['user-agent'] || '');

    const marca = crypto
      .createHmac('sha256', env.chave)      // a chave como sal: hash sem ela não se refaz
      .update(ip + '|' + navegador)
      .digest('hex')
      .slice(0, 32);

    resposta.contou = await rpc('registrar_visita', { p_marca: marca }, env);
  } catch (err) {
    console.error('visita:', err.message);
  }

  /* ---- presença de quem está logado ---- */
  try {
    const usuario = await usuarioDoToken(req, env);
    if (usuario) {
      await fetch(env.url + '/rest/v1/perfis?id=eq.' + encodeURIComponent(usuario.id), {
        method: 'PATCH',
        headers: cabecalhos(env.chave),
        body: JSON.stringify({ ultimo_acesso: new Date().toISOString() }),
      });
      resposta.logado = true;
    }
  } catch (err) {
    console.error('presenca:', err.message);
  }

  return res.status(200).json(resposta);
}
