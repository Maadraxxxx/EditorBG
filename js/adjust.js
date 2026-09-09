/**
 * Ajustes de imagem.
 *
 * Os filtros do canvas (`ctx.filter`) só dão brilho, contraste e saturação.
 * Destaques, sombras, temperatura, vibração, nitidez e vinheta precisam de
 * matemática por pixel — é o que este módulo faz, numa passada só.
 *
 * Todos os valores vão de -100 a 100 e 0 significa "não mexer", igual aos
 * editores de foto. Nitidez e vinheta só têm o lado positivo.
 */

export const AJUSTES_PADRAO = {
  temperatura: 0,
  matiz: 0,
  brilho: 0,
  contraste: 0,
  destaques: 0,
  sombras: 0,
  brancos: 0,
  pretos: 0,
  vibracao: 0,
  saturacao: 0,
  inverter: false,
  nitidez: 0,
  claridade: 0,
  vinheta: 0,
};

export function ajustesPadrao() {
  return { ...AJUSTES_PADRAO };
}

/** Nenhum ajuste mexido: dá para pular o processamento inteiro. */
export function semAjustes(a) {
  for (const k of Object.keys(AJUSTES_PADRAO)) {
    if (a[k] !== AJUSTES_PADRAO[k]) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Auxiliares
 * ------------------------------------------------------------------ */
const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

/** Transição suave entre 0 e 1 — evita emenda dura nas máscaras de tom. */
function suave(borda0, borda1, x) {
  const t = Math.min(1, Math.max(0, (x - borda0) / (borda1 - borda0)));
  return t * t * (3 - 2 * t);
}

function desenharBorrado(origem, raio) {
  const c = document.createElement('canvas');
  c.width = origem.width;
  c.height = origem.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'blur(' + raio + 'px)';
  ctx.drawImage(origem, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

/* ------------------------------------------------------------------ *
 * Aplicação
 * ------------------------------------------------------------------ */

/**
 * Devolve um canvas com os ajustes aplicados.
 * `maxDim` limita o tamanho do processamento — o preview usa um teto para o
 * arrasto do slider continuar fluido; a exportação roda em resolução cheia.
 */
export function aplicarAjustes(bitmap, ajustes, maxDim) {
  const escala = maxDim ? Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height)) : 1;
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);

  if (semAjustes(ajustes)) return canvas;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Máscara de foco e de contraste local saem de cópias borradas da imagem.
  // O blur do canvas é acelerado, então sai muito mais barato que convolução.
  const usaNitidez = ajustes.nitidez !== 0;
  const usaClaridade = ajustes.claridade !== 0;
  const bNitidez = usaNitidez ? desenharBorrado(canvas, Math.max(1, Math.round(Math.max(w, h) / 900))) : null;
  const bClaridade = usaClaridade ? desenharBorrado(canvas, Math.max(3, Math.round(Math.max(w, h) / 90))) : null;

  const temp = ajustes.temperatura / 100;
  const matiz = ajustes.matiz / 100;
  const brilho = ajustes.brilho / 100;
  const contraste = ajustes.contraste / 100;
  const destaques = ajustes.destaques / 100;
  const sombras = ajustes.sombras / 100;
  const brancos = ajustes.brancos / 100;
  const pretos = ajustes.pretos / 100;
  const vibracao = ajustes.vibracao / 100;
  const saturacao = ajustes.saturacao / 100;
  const nitidez = ajustes.nitidez / 100;
  const claridade = ajustes.claridade / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    // --- textura: máscara de nitidez (realce do que difere do borrado) ---
    if (usaNitidez) {
      const k = nitidez * 1.6;
      r += (r - bNitidez[i] / 255) * k;
      g += (g - bNitidez[i + 1] / 255) * k;
      b += (b - bNitidez[i + 2] / 255) * k;
    }
    if (usaClaridade) {
      const k = claridade * 0.9;
      r += (r - bClaridade[i] / 255) * k;
      g += (g - bClaridade[i + 1] / 255) * k;
      b += (b - bClaridade[i + 2] / 255) * k;
    }

    // --- balanço de brancos ---
    if (temp) { r *= 1 + temp * 0.28; b *= 1 - temp * 0.28; }
    if (matiz) { g *= 1 - matiz * 0.18; r *= 1 + matiz * 0.09; b *= 1 + matiz * 0.09; }

    // --- iluminação ---
    if (brilho) { const s = brilho * 0.4; r += s; g += s; b += s; }
    if (contraste) {
      const k = 1 + contraste;
      r = (r - 0.5) * k + 0.5;
      g = (g - 0.5) * k + 0.5;
      b = (b - 0.5) * k + 0.5;
    }

    let lum = LUM_R * r + LUM_G * g + LUM_B * b;

    if (destaques) { const s = destaques * 0.5 * suave(0.45, 1, lum); r += s; g += s; b += s; }
    if (sombras) { const s = sombras * 0.5 * (1 - suave(0, 0.55, lum)); r += s; g += s; b += s; }
    if (brancos) { const s = brancos * 0.35 * lum * lum; r += s; g += s; b += s; }
    if (pretos) { const s = pretos * 0.35 * (1 - lum) * (1 - lum); r += s; g += s; b += s; }

    // --- cor ---
    if (saturacao || vibracao) {
      lum = LUM_R * r + LUM_G * g + LUM_B * b;
      let fator = 1 + saturacao;
      if (vibracao) {
        // vibração mexe mais no que está sem cor e poupa o que já está saturado
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const satAtual = max <= 0 ? 0 : (max - min) / max;
        fator += vibracao * (1 - satAtual);
      }
      r = lum + (r - lum) * fator;
      g = lum + (g - lum) * fator;
      b = lum + (b - lum) * fator;
    }

    if (ajustes.inverter) { r = 1 - r; g = 1 - g; b = 1 - b; }

    d[i] = r <= 0 ? 0 : r >= 1 ? 255 : r * 255;
    d[i + 1] = g <= 0 ? 0 : g >= 1 ? 255 : g * 255;
    d[i + 2] = b <= 0 ? 0 : b >= 1 ? 255 : b * 255;
  }

  ctx.putImageData(img, 0, 0);

  // --- vinheta: escurece as bordas, por cima de tudo ---
  if (ajustes.vinheta > 0) {
    const forca = (ajustes.vinheta / 100) * 0.85;
    const raio = Math.hypot(w, h) / 2;
    const grad = ctx.createRadialGradient(w / 2, h / 2, raio * 0.35, w / 2, h / 2, raio);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,' + forca + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  return canvas;
}
