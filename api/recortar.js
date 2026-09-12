/**
 * Remoção de fundo NO SERVIDOR — só para VIP, só quando o aparelho pede.
 *
 * POR QUE ISTO EXISTE, se o site inteiro promete não enviar arquivo: porque no
 * celular fraco o recorte no navegador leva um tempo que faz a pessoa desistir,
 * e a promessa de privacidade não vale nada para quem não consegue usar. Então
 * este caminho existe, mas com três travas que não são detalhe:
 *
 *   1. É OPCIONAL. O padrão continua sendo o navegador. O servidor só é usado
 *      quando a pessoa escolhe, sabendo o que acontece.
 *   2. NADA É GRAVADO. Os pixels chegam, viram máscara e morrem com a resposta.
 *      Não há disco, não há banco, não há log do conteúdo.
 *   3. É SÓ VIP. Não por mesquinhez: servidor aberto vira alvo de automação, e
 *      a conta de quem paga acabaria bancando o abuso.
 *
 * O QUE CHEGA E O QUE VOLTA: pixels crus, não arquivo. O navegador já redesenha
 * a imagem no tamanho que o modelo usa e manda os bytes RGB; volta a máscara em
 * tons de cinza. Assim o servidor não precisa de biblioteca de imagem nenhuma —
 * uma dependência a menos é uma coisa a menos para quebrar num deploy que eu
 * não consigo testar daqui.
 */

import { ambiente, usuarioDoToken, cabecalhos } from './_supabase.js';

/** O lado da imagem que o modelo espera. Combina com o cliente. */
const LADO = 1024;

/**
 * O modelo fica em /tmp, baixado uma vez por instância.
 *
 * Guardar os 44 MB no repositório engordaria todo clone e todo deploy por algo
 * que já está publicado e versionado na origem. A primeira chamada de cada
 * instância paga o download; as seguintes reaproveitam.
 */
const MODELO_URL = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx';
const MODELO_ARQUIVO = '/tmp/rmbg-1.4-q8.onnx';

let sessaoPromessa = null;

async function sessao() {
  if (sessaoPromessa) return sessaoPromessa;

  sessaoPromessa = (async () => {
    const { access, writeFile } = await import('node:fs/promises');
    const ort = await import('onnxruntime-node');

    try {
      await access(MODELO_ARQUIVO);
    } catch {
      const r = await fetch(MODELO_URL);
      if (!r.ok) throw new Error('não foi possível baixar o modelo (' + r.status + ')');
      await writeFile(MODELO_ARQUIVO, Buffer.from(await r.arrayBuffer()));
    }

    return ort.InferenceSession.create(MODELO_ARQUIVO, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
  })();

  // Falha no carregamento não pode ficar guardada: a próxima chamada tenta de novo.
  sessaoPromessa.catch(() => { sessaoPromessa = null; });
  return sessaoPromessa;
}

export const config = {
  api: {
    // Os pixels crus de 1024x1024 dão 3 MB. O padrão do Vercel é 1 MB.
    bodyParser: { sizeLimit: '5mb' },
  },
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, motivo: 'Método não permitido.' });
  }

  /* ---- só VIP ---- */
  let env;
  try {
    env = ambiente();
  } catch (err) {
    console.error('recortar:', err.message);
    return res.status(503).json({ ok: false, motivo: 'Serviço indisponível no momento.' });
  }

  const usuario = await usuarioDoToken(req, env);
  if (!usuario) {
    return res.status(401).json({ ok: false, motivo: 'Entre na sua conta para usar o servidor.' });
  }
  if (!(await ehVip(usuario.id, env))) {
    return res.status(403).json({
      ok: false,
      motivo: 'Recortar no servidor é do VIP. Sem ele, o recorte continua funcionando '
        + 'no seu navegador.',
    });
  }

  /* ---- os pixels ---- */
  const corpo = req.body;
  const base64 = corpo && typeof corpo.rgb === 'string' ? corpo.rgb : null;
  if (!base64) {
    return res.status(400).json({ ok: false, motivo: 'Faltaram os pixels da imagem.' });
  }

  const rgb = Buffer.from(base64, 'base64');
  if (rgb.length !== LADO * LADO * 3) {
    return res.status(400).json({
      ok: false,
      motivo: 'A imagem precisa chegar com ' + LADO + 'x' + LADO + ' pixels em RGB.',
    });
  }

  try {
    const ort = await import('onnxruntime-node');
    const s = await sessao();

    // NCHW normalizado em [0,1]: é o que este modelo espera.
    const entrada = new Float32Array(3 * LADO * LADO);
    const porCanal = LADO * LADO;
    for (let i = 0; i < porCanal; i++) {
      entrada[i] = rgb[i * 3] / 255;
      entrada[porCanal + i] = rgb[i * 3 + 1] / 255;
      entrada[porCanal * 2 + i] = rgb[i * 3 + 2] / 255;
    }

    const nome = s.inputNames[0];
    const saida = await s.run({
      [nome]: new ort.Tensor('float32', entrada, [1, 3, LADO, LADO]),
    });
    const mapa = saida[s.outputNames[0]].data;

    // O modelo devolve valores contínuos que não vêm normalizados: esticar
    // entre o mínimo e o máximo é o que transforma isso numa máscara utilizável.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < porCanal; i++) {
      if (mapa[i] < min) min = mapa[i];
      if (mapa[i] > max) max = mapa[i];
    }
    const faixa = max - min || 1;

    const mascara = Buffer.allocUnsafe(porCanal);
    for (let i = 0; i < porCanal; i++) {
      mascara[i] = Math.round(((mapa[i] - min) / faixa) * 255);
    }

    return res.status(200).json({ ok: true, lado: LADO, mascara: mascara.toString('base64') });
  } catch (err) {
    console.error('recortar:', err && err.message);
    return res.status(500).json({
      ok: false,
      motivo: 'Não deu certo no servidor. O recorte no seu navegador continua disponível.',
    });
  }
}

async function ehVip(id, env) {
  try {
    const r = await fetch(
      env.url + '/rest/v1/perfis?select=vip,vip_ate&id=eq.' + encodeURIComponent(id),
      { headers: cabecalhos(env.chave) },
    );
    if (!r.ok) return false;
    const p = (await r.json())[0];
    if (!p || !p.vip) return false;
    return !p.vip_ate || new Date(p.vip_ate) > new Date();
  } catch {
    return false;
  }
}
