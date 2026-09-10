/**
 * Cota diária das ferramentas com limite. Hoje só a de melhorar qualidade.
 *
 * VIP não passa por aqui — quem paga não tem limite. Para o resto, cada uso
 * soma um no contador do dia e a resposta diz se pode ou não.
 *
 * QUEM É "CADA UM":
 *   logado    o id da conta, que é o mais justo — a pessoa troca de rede e
 *             continua sendo ela;
 *   deslogado um hash de IP + navegador, feito aqui com a service key como sal.
 *             O IP não é gravado, pelo mesmo motivo da contagem de visitas: o
 *             site promete que nada sai do computador de quem usa.
 *
 * O QUE ISTO NÃO É: uma trava. A melhoria roda inteira no navegador, então
 * quem editar o JavaScript contorna a contagem — do mesmo jeito que contorna o
 * limite de resolução do download. É atrito, e atrito honesto: segura quem
 * usaria demais sem pensar, não quem decidiu burlar. Travar de verdade exigiria
 * processar no servidor, que é justamente o que este site não faz.
 */

import crypto from 'node:crypto';
import { ambiente, usuarioDoToken, cabecalhos, rpc } from './_supabase.js';

/** Quantos usos por dia cada ferramenta dá de graça. */
const LIMITES = {
  melhorar: 2,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
  }

  const ferramenta = String((req.body && req.body.ferramenta) || '');
  const limite = LIMITES[ferramenta];
  if (!limite) {
    return res.status(400).json({ ok: false, motivo: 'Ferramenta desconhecida.' });
  }

  let env;
  try {
    env = ambiente();
  } catch (err) {
    // Sem configuração não dá para contar. Liberar é melhor do que travar a
    // ferramenta inteira por causa de uma variável de ambiente faltando.
    console.error('uso:', err.message);
    return res.status(200).json({ ok: true, permitido: true, semContagem: true });
  }

  /* ---- VIP não tem limite ---- */
  const usuario = await usuarioDoToken(req, env);

  if (usuario) {
    const vip = await ehVipAgora(usuario.id, env);
    if (vip) {
      return res.status(200).json({ ok: true, permitido: true, ilimitado: true });
    }
  }

  /* ---- conta o uso do dia ---- */
  const marca = usuario ? 'u:' + usuario.id : marcaDoVisitante(req, env.chave);

  try {
    const r = await rpc('registrar_uso', {
      p_marca: marca,
      p_ferramenta: ferramenta,
      p_limite: limite,
    }, env);

    return res.status(200).json({ ok: true, ...r });
  } catch (err) {
    console.error('uso: falhou ao contar —', err.message);
    // Mesma escolha de cima: banco fora do ar não pode impedir de usar o site.
    return res.status(200).json({ ok: true, permitido: true, semContagem: true });
  }
}

/**
 * VIP valendo AGORA. `vip` sozinho continua true depois do vencimento, porque
 * nada roda de tempos em tempos para virar a chave — a data é que decide.
 */
async function ehVipAgora(id, env) {
  try {
    const r = await fetch(
      env.url + '/rest/v1/perfis?select=vip,vip_ate&id=eq.' + encodeURIComponent(id),
      { headers: cabecalhos(env.chave) }
    );
    if (!r.ok) return false;

    const linhas = await r.json();
    const p = linhas[0];
    if (!p || !p.vip) return false;
    return !p.vip_ate || new Date(p.vip_ate) > new Date();
  } catch {
    return false;
  }
}

/** Hash de IP + navegador. O IP em si nunca é gravado. */
function marcaDoVisitante(req, chave) {
  const ip = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''
  ).split(',')[0].trim();
  const navegador = String(req.headers['user-agent'] || '');

  return 'v:' + crypto
    .createHmac('sha256', chave)
    .update(ip + '|' + navegador)
    .digest('hex')
    .slice(0, 32);
}
