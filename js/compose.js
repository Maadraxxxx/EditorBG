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

/* ------------------------------------------------------------------ *
 * Contorno e sombra
 * ------------------------------------------------------------------ *
 * Os dois partem da mesma coisa: a SILHUETA do recorte, que é a forma dele
 * preenchida de uma cor só. Com ela dá para desenhar tanto uma borda quanto
 * uma sombra sem precisar saber nada sobre a imagem por dentro.
 */

/** A forma do recorte, chapada numa cor. */
function silhueta(fonte, cor) {
  const c = document.createElement('canvas');
  c.width = fonte.width;
  c.height = fonte.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(fonte, 0, 0);
  // `source-in` pinta só onde já havia pixel — ou seja, dentro da forma.
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Borda em volta do recorte, estilo adesivo.
 *
 * Feita carimbando a silhueta deslocada em círculo em vez de com um algoritmo
 * de dilatação: o resultado é o mesmo e o canvas faz o trabalho pesado. O
 * número de carimbos acompanha a largura — poucos passos numa borda grossa
 * deixariam o contorno com cantos de estrela em vez de redondo.
 */
function comContorno(cut, { largura, cor }) {
  if (!largura) return cut;

  const forma = silhueta(cut, cor);
  const out = document.createElement('canvas');
  out.width = cut.width;
  out.height = cut.height;
  const ctx = out.getContext('2d');

  const passos = Math.max(16, Math.round(largura * 5));
  for (let i = 0; i < passos; i++) {
    const a = (i / passos) * Math.PI * 2;
    ctx.drawImage(forma, Math.cos(a) * largura, Math.sin(a) * largura);
  }

  ctx.drawImage(cut, 0, 0);
  return out;
}

/**
 * Sombra projetada.
 *
 * Vem DEPOIS do contorno de propósito: a sombra é da silhueta já com a borda,
 * como aconteceria de verdade. Aplicada antes, o contorno ficaria flutuando
 * sobre a própria sombra.
 */
function comSombra(cut, { x, y, desfoque, opacidade, cor }) {
  const forma = silhueta(cut, cor);
  const out = document.createElement('canvas');
  out.width = cut.width;
  out.height = cut.height;
  const ctx = out.getContext('2d');

  ctx.globalAlpha = opacidade;
  ctx.filter = 'blur(' + desfoque + 'px)';
  ctx.drawImage(forma, x, y);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  ctx.drawImage(cut, 0, 0);
  return out;
}

/* ------------------------------------------------------------------ *
 * Marca d'água
 * ------------------------------------------------------------------ */

/**
 * Escreve a marca sobre a imagem já pronta.
 *
 * O tamanho é uma FRAÇÃO da imagem, não um número de pixels: a mesma marca
 * precisa parecer igual numa foto de 400px e numa de 3000px, e com pixels
 * fixos ela sairia gigante numa e ilegível na outra.
 *
 * O contorno escuro por baixo não é enfeite — sem ele, marca branca sobre céu
 * claro simplesmente desaparece, que é o único caso em que ela precisava estar
 * visível.
 */
export function desenharMarca(canvas, marca) {
  const texto = String(marca.texto || '').trim();
  if (!texto || marca.opacidade <= 0) return canvas;

  const ctx = canvas.getContext('2d');
  const corpo = Math.max(10, Math.round(Math.min(canvas.width, canvas.height) * marca.tamanho));

  ctx.save();
  ctx.globalAlpha = marca.opacidade;
  ctx.font = '600 ' + corpo + 'px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = marca.cor || '#ffffff';
  ctx.strokeStyle = 'rgba(0, 0, 0, .35)';
  ctx.lineWidth = Math.max(1, corpo * 0.06);
  ctx.lineJoin = 'round';

  if (marca.repetir) {
    // Diagonal e repetida: é a versão difícil de recortar fora, para quem
    // manda prova de trabalho antes de receber.
    const larg = ctx.measureText(texto).width;
    const passoX = larg + corpo * 2.2;
    const passoY = corpo * 3.4;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const alcance = Math.hypot(canvas.width, canvas.height);
    for (let y = -alcance; y < alcance; y += passoY) {
      // Fileiras alternadas deslocadas: em grade reta o olho vê colunas.
      const desloca = (Math.round(y / passoY) % 2) * (passoX / 2);
      for (let x = -alcance + desloca; x < alcance; x += passoX) {
        ctx.strokeText(texto, x, y);
        ctx.fillText(texto, x, y);
      }
    }
  } else {
    const margem = corpo * 0.8;
    const canto = marca.posicao || 'inferior-direita';
    ctx.textAlign = canto.includes('direita') ? 'right' : 'left';
    ctx.textBaseline = canto.includes('inferior') ? 'bottom' : 'top';
    const x = canto.includes('direita') ? canvas.width - margem : margem;
    const y = canto.includes('inferior') ? canvas.height - margem : margem;
    ctx.strokeText(texto, x, y);
    ctx.fillText(texto, x, y);
  }

  ctx.restore();
  return canvas;
}

/** Render final, em resolução cheia. */
export function compose(item, { background, feather, contorno, sombra }) {
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

  // Contorno antes da sombra: a sombra é projetada pela silhueta já com a
  // borda, como aconteceria se o adesivo existisse de verdade.
  if (contorno && contorno.largura > 0) cut = comContorno(cut, contorno);
  if (sombra && sombra.opacidade > 0) cut = comSombra(cut, sombra);

  // A marca vai por ÚLTIMO, depois do fundo: sobre o recorte ela sumiria junto
  // com as partes transparentes, que é o oposto do que uma marca serve.
  if (background === 'transparent') {
    return item.edit.marca ? desenharMarca(cut, item.edit.marca) : cut;
  }

  const out = document.createElement('canvas');
  out.width = cut.width;
  out.height = cut.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(cut, 0, 0);
  return item.edit.marca ? desenharMarca(out, item.edit.marca) : out;
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
