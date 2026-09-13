/**
 * O painel de quem indica, e o pedido de saque.
 *
 * GET  → código, indicações, saldo, mínimo para sacar e histórico.
 * POST → pede o saque do saldo inteiro para uma chave PIX.
 *
 * NADA aqui aceita valor vindo do navegador. O saldo é calculado no banco a
 * partir das comissões gravadas, e o valor do saque é o saldo — não um número
 * que alguém digitou.
 */
import { ambiente, cabecalhos, usuarioDoToken } from './_supabase.js';
import { resumo } from './_afiliados.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  let env;
  try {
    env = ambiente();
  } catch (err) {
    return res.status(500).json({ ok: false, motivo: err.message });
  }

  let usuario;
  try {
    usuario = await usuarioDoToken(req, env);
  } catch {
    return res.status(401).json({ ok: false, motivo: 'Entre na sua conta.' });
  }
  if (!usuario) return res.status(401).json({ ok: false, motivo: 'Entre na sua conta.' });

  /* ---- painel ---- */
  if (req.method === 'GET') {
    try {
      return res.status(200).json({ ok: true, ...(await resumo(usuario.id, env)) });
    } catch (err) {
      console.error('Falha ao montar o painel de indicações:', err);
      return res.status(500).json({ ok: false, motivo: 'Não deu para carregar seus dados agora.' });
    }
  }

  /* ---- pedido de saque ---- */
  if (req.method === 'POST') {
    const chave = String((req.body && req.body.chavePix) || '').trim();
    if (chave.length < 3 || chave.length > 140) {
      return res.status(400).json({ ok: false, motivo: 'Escreva a sua chave PIX.' });
    }

    try {
      /*
       * A conferência do saldo e a gravação do pedido acontecem DENTRO de uma
       * função do banco, não aqui.
       *
       * Entre ler o saldo e gravar o pedido cabe um segundo pedido idêntico —
       * dois cliques rápidos, duas abas abertas — e os dois passariam pela
       * conferência antes de qualquer um ser gravado, sacando o dobro do saldo.
       * Lá dentro os pedidos entram em fila e o segundo já lê o saldo
       * descontado.
       */
      const r = await fetch(env.url + '/rest/v1/rpc/pedir_saque', {
        method: 'POST',
        headers: cabecalhos(env.chave),
        body: JSON.stringify({ p_afiliado: usuario.id, p_chave: chave }),
      });
      if (!r.ok) throw new Error('rpc pedir_saque: ' + r.status + ' ' + (await r.text()));

      const saida = await r.json();
      if (!saida.ok) {
        const motivos = {
          abaixo_do_minimo: 'Seu saldo ainda não chegou ao mínimo para sacar.',
          chave_invalida: 'Esta chave PIX não parece válida.',
        };
        return res.status(400).json({
          ok: false,
          motivo: motivos[saida.motivo] || 'Não deu para pedir o saque agora.',
          saldo: saida.saldo,
          minimo: saida.minimo,
        });
      }

      return res.status(200).json({ ok: true, valor: saida.valor });
    } catch (err) {
      console.error('Falha no pedido de saque:', err);
      return res.status(500).json({ ok: false, motivo: 'Não deu para pedir o saque agora.' });
    }
  }

  return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
}
