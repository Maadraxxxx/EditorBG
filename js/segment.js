/**
 * Segmentação: escolha de modelo, carregamento e a segunda passada em alta
 * resolução.
 *
 * Todos os modelos passam pelo pipeline `background-removal` do transformers.js,
 * que devolve a imagem em RGBA com o alpha já preenchido. Só nos interessa esse
 * canal alpha — o resto do app trabalha com a máscara.
 */
import { PRECISAO_GPU } from './limites.js';
import {
  pipeline,
  RawImage,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;

export const MODELS = {
  padrao: {
    id: 'briaai/RMBG-1.4',
    nome: 'Padrão',
    descricao: 'Rápido, funciona em qualquer máquina. ~44 MB.',
    dtype: { webgpu: PRECISAO_GPU, wasm: 'q8' },
    gpuOnly: false,
  },
  finos: {
    id: 'onnx-community/ISNet-ONNX',
    nome: 'Detalhes finos',
    descricao: 'Outro treino (DIS5K), bom em objetos vazados e hastes finas. ~44 MB.',
    dtype: { webgpu: PRECISAO_GPU, wasm: 'q8' },
    vip: true,
  },
};

/**
 * `navigator.gpu` existir não garante WebGPU: em muitos PCs o adapter não é
 * concedido. Só uma requisição real responde isso.
 */
let gpuPromise = null;
export function hasWebGPU() {
  if (!gpuPromise) {
    gpuPromise = (async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
      try {
        return !!(await navigator.gpu.requestAdapter());
      } catch {
        return false;
      }
    })();
  }
  return gpuPromise;
}

/* ------------------------------------------------------------------ *
 * Carregamento
 * ------------------------------------------------------------------ */
let current = null;   // { key, device, segmenter }

/**
 * Carrega (ou reaproveita) o segmentador. Só um modelo fica vivo por vez: dois
 * modelos grandes no mesmo heap WASM estouram a memória e derrubam os dois.
 */
export async function loadSegmenter(key, { onProgress } = {}) {
  if (current && current.key === key) return current;

  if (current) {
    try { await current.segmenter.dispose(); } catch { /* já liberado */ }
    current = null;
  }

  const spec = MODELS[key];
  const device = (await hasWebGPU()) ? 'webgpu' : 'wasm';
  const segmenter = await pipeline('background-removal', spec.id, {
    device,
    dtype: spec.dtype[device],
    progress_callback: onProgress,
  });

  current = { key, device, segmenter };
  return current;
}

export function currentDevice() {
  return current ? current.device : null;
}

/* ------------------------------------------------------------------ *
 * Inferência
 * ------------------------------------------------------------------ */

/** Roda o modelo num recorte da imagem e devolve a máscara daquele recorte. */
async function segmentRegion(segmenter, bitmap, sx, sy, sw, sh) {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const rgba = ctx.getImageData(0, 0, sw, sh);

  const input = new RawImage(rgba.data, sw, sh, 4).rgb();
  const out = await segmenter(input);
  const res = Array.isArray(out) ? out[0] : out;

  return alphaToMask(res, sw, sh);
}

/** RawImage RGBA -> canvas branco cujo ALPHA é a máscara. */
function alphaToMask(res, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const dst = img.data;
  const src = res.data;
  const ch = res.channels || 4;

  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4;
    dst[o] = 255;
    dst[o + 1] = 255;
    dst[o + 2] = 255;
    dst[o + 3] = ch === 4 ? src[i * ch + 3] : src[i * ch];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Caixa que envolve os pixels opacos da máscara. */
function maskBounds(maskCanvas, threshold) {
  const w = maskCanvas.width;
  const h = maskCanvas.height;
  const data = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.round(Math.max(w, h) / 600));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return null;
  return { x: x0, y: y0, w: Math.min(w - x0, x1 - x0 + step), h: Math.min(h - y0, y1 - y0 + step) };
}

/**
 * Segmenta a imagem inteira.
 *
 * Com `twoPass`, faz uma segunda passada: acha o objeto, recorta em volta dele e
 * roda o modelo de novo só nesse pedaço. Como o modelo sempre reduz a entrada
 * para 1024², um objeto que ocupa um quarto da foto chega à rede com o dobro da
 * resolução linear na segunda passada — é daí que vem o ganho em detalhe fino.
 * Se o objeto já preenche o quadro, a segunda passada não acrescenta nada e é
 * pulada.
 */
export async function segmentImage(segmenter, bitmap, { twoPass = true, onStatus } = {}) {
  const w = bitmap.width;
  const h = bitmap.height;

  if (onStatus) onStatus('Removendo o fundo…');
  const first = await segmentRegion(segmenter, bitmap, 0, 0, w, h);
  if (!twoPass) return first;

  const box = maskBounds(first, 128);
  if (!box) return first;

  const cover = (box.w * box.h) / (w * h);
  if (cover > 0.6 || cover < 0.002) return first;   // já preenche o quadro, ou nada achado

  // Margem generosa: se a 1ª passada cortou parte do objeto, a 2ª ainda a vê.
  const pad = Math.round(Math.max(box.w, box.h) * 0.15);
  const sx = Math.max(0, box.x - pad);
  const sy = Math.max(0, box.y - pad);
  const sw = Math.min(w - sx, box.w + pad * 2);
  const sh = Math.min(h - sy, box.h + pad * 2);

  if (onStatus) onStatus('Refinando detalhes…');
  const second = await segmentRegion(segmenter, bitmap, sx, sy, sw, sh);

  // Fora do recorte já era fundo na 1ª passada, então fica transparente.
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(second, sx, sy);
  return out;
}
