/**
 * Pipeline de composição compartilhado entre a galeria e o editor.
 *
 * Ordem das operações (importante, define como as edições se combinam):
 *   1. ajustes de cor sobre a imagem original
 *   2. máscara de transparência (a da IA, já com as pinceladas do usuário)
 *   3. rotação / espelhamento
 *   4. recorte
 *   5. fundo (transparente ou cor sólida)
 */

import { ajustesPadrao, semAjustes, aplicarAjustes } from './adjust.js';
import { desenharCamadas } from './layers.js';

export function defaultEdit() {
  return {
    adjust: ajustesPadrao(),
    rotate: 0,
    flipH: false,
    flipV: false,
    crop: null,   // { x, y, w, h } em coordenadas da imagem já rotacionada
    resize: null, // { w, h } em pixels — tamanho final; null = usa o do recorte
    layers: [],   // texto, formas e imagens por cima da foto
  };
}

/** Imagem com os ajustes aplicados, pronta para ser recortada pela máscara. */
export function fonteAjustada(bitmap, adjust, maxDim) {
  if (semAjustes(adjust)) return bitmap;
  return aplicarAjustes(bitmap, adjust, maxDim);
}

export function isPristine(edit) {
  return semAjustes(edit.adjust) &&
         edit.rotate === 0 && !edit.flipH && !edit.flipV && !edit.crop && !edit.resize &&
         (!edit.layers || edit.layers.length === 0);
}

/**
 * Matrizes que levam do espaço da imagem original para o de saída.
 *
 * `boxMatrix` aplica só rotação/espelho — é o que o editor mostra, para o
 * usuário poder posicionar o recorte sobre a imagem inteira.
 * `matrix` inclui também o deslocamento do recorte — é o render final.
 */
export function geometry(w0, h0, edit) {
  let m = new DOMMatrix()
    .translate(w0 / 2, h0 / 2)
    .rotate(edit.rotate)
    .scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1)
    .translate(-w0 / 2, -h0 / 2);

  // Caixa que envolve a imagem depois de girada.
  const corners = [[0, 0], [w0, 0], [w0, h0], [0, h0]]
    .map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const boxW = Math.max(...xs) - minX;
  const boxH = Math.max(...ys) - minY;

  const boxMatrix = new DOMMatrix().translate(-minX, -minY).multiply(m);

  const crop = edit.crop || { x: 0, y: 0, w: boxW, h: boxH };
  const matrix = new DOMMatrix().translate(-crop.x, -crop.y).multiply(boxMatrix);

  return {
    boxMatrix,
    boxW: Math.max(1, boxW),
    boxH: Math.max(1, boxH),
    matrix,
    width: Math.max(1, Math.round(crop.w)),
    height: Math.max(1, Math.round(crop.h)),
  };
}

/**
 * Desenha o recorte (imagem + máscara como canal alpha) no contexto dado.
 * O canvas de destino precisa estar vazio: `destination-in` apaga tudo que
 * estiver fora da máscara.
 */
export function drawCutout(ctx, { bitmap, mask, matrix, feather = 0 }) {
  ctx.save();
  ctx.setTransform(matrix);
  // `bitmap` pode ser um canvas menor que a imagem original (preview): desenhar
  // com largura/altura explícitas mantém o alinhamento com a máscara.
  ctx.drawImage(bitmap, 0, 0, mask.width, mask.height);
  // O blur do canvas é medido em pixels do destino, não do espaço de origem.
  ctx.filter = feather > 0 ? 'blur(' + feather + 'px)' : 'none';
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}

/** Tamanho do arquivo final, já considerando recorte e redimensionamento. */
export function outputSize(bitmapW, bitmapH, edit) {
  if (edit.resize) return { w: edit.resize.w, h: edit.resize.h };
  const g = geometry(bitmapW, bitmapH, edit);
  return { w: g.width, h: g.height };
}

/** Render final, em resolução cheia. */
export function compose(item, { background, feather }) {
  const g = geometry(item.bitmap.width, item.bitmap.height, item.edit);

  let cut = document.createElement('canvas');
  cut.width = g.width;
  cut.height = g.height;
  drawCutout(cut.getContext('2d'), {
    bitmap: fonteAjustada(item.bitmap, item.edit.adjust),   // resolução cheia no arquivo final
    mask: item.maskCanvas,
    matrix: g.matrix,
    feather,
  });

  // As camadas entram DEPOIS do recorte da máscara: `destination-in` apagaria
  // tudo que estivesse fora do objeto, inclusive um texto no fundo transparente.
  if (item.edit.layers && item.edit.layers.length) {
    const lctx = cut.getContext('2d');
    lctx.save();
    lctx.setTransform(g.matrix);
    desenharCamadas(lctx, item.edit.layers);
    lctx.restore();
  }

  // Tamanho final pedido em pixels: reescala depois do recorte, antes do fundo,
  // para o fundo cobrir o quadro inteiro sem sobrar borda.
  const size = item.edit.resize;
  if (size && (size.w !== g.width || size.h !== g.height)) {
    const scaled = document.createElement('canvas');
    scaled.width = size.w;
    scaled.height = size.h;
    const sctx = scaled.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cut, 0, 0, size.w, size.h);
    cut = scaled;
  }

  if (background === 'transparent') return cut;

  const out = document.createElement('canvas');
  out.width = cut.width;
  out.height = cut.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(cut, 0, 0);
  return out;
}

/** Máscara em tons de cinza -> canvas branco cujo ALPHA é a máscara. */
export function maskToAlphaCanvas(mask, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;
  const m = mask.data;
  const channels = mask.channels || 1;

  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = m[i * channels];
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function cloneCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
