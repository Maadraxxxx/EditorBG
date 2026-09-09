/**
 * Camadas sobre a foto: texto, formas e outras imagens.
 *
 * Toda camada vive em coordenadas da imagem ORIGINAL — as mesmas da máscara.
 * Com isso recorte, rotação e redimensionamento se aplicam a elas de graça: o
 * compose() desenha as camadas com a mesma matriz da foto, então o que aparece
 * no editor é exatamente o que sai no arquivo.
 */

let idSeq = 0;

/* Fontes do sistema — nada de baixar da rede, o app continua funcionando offline. */
export const FONTES = [
  { id: '"Segoe UI", system-ui, sans-serif', nome: 'Padrão' },
  { id: 'Georgia, serif', nome: 'Georgia' },
  { id: '"Times New Roman", serif', nome: 'Times' },
  { id: 'Impact, sans-serif', nome: 'Impact' },
  { id: '"Courier New", monospace', nome: 'Courier' },
  { id: '"Trebuchet MS", sans-serif', nome: 'Trebuchet' },
  { id: '"Comic Sans MS", cursive', nome: 'Comic' },
  { id: 'Verdana, sans-serif', nome: 'Verdana' },
];

export const FORMAS = ['rect', 'roundRect', 'ellipse', 'triangle', 'star', 'heart', 'line', 'arrow'];

/* ------------------------------------------------------------------ *
 * Criação
 * ------------------------------------------------------------------ */
function base(w, h, cx, cy) {
  return { id: ++idSeq, x: cx, y: cy, w, h, rot: 0, opacity: 1 };
}

const PRESETS_TEXTO = {
  titulo: { text: 'Seu título', size: 84, weight: 700 },
  subtitulo: { text: 'Seu subtítulo', size: 52, weight: 600 },
  corpo: { text: 'Um pouquinho de texto', size: 32, weight: 400 },
};

export function novoTexto(cx, cy, escala, preset = 'titulo') {
  const p = PRESETS_TEXTO[preset] || PRESETS_TEXTO.corpo;
  const size = Math.max(8, Math.round(p.size * escala));
  const l = base(Math.round(size * 8), Math.round(size * 1.3), cx, cy);
  return Object.assign(l, {
    tipo: 'texto',
    text: p.text,
    font: FONTES[0].id,
    size,
    weight: p.weight,
    color: '#ffffff',
    align: 'center',
    stroke: '#000000',
    strokeWidth: 0,
  });
}

export function novaForma(shape, cx, cy, escala) {
  const lado = Math.max(16, Math.round(300 * escala));
  const fina = shape === 'line' || shape === 'arrow';
  const l = base(lado, fina ? Math.max(6, Math.round(lado * 0.22)) : lado, cx, cy);
  return Object.assign(l, {
    tipo: 'forma',
    shape,
    fill: '#6366f1',
    stroke: '#000000',
    strokeWidth: 0,
    radius: Math.round(lado * 0.12),
  });
}

export function novaImagem(bitmap, cx, cy, larguraAlvo) {
  const k = larguraAlvo / bitmap.width;
  const l = base(Math.round(bitmap.width * k), Math.round(bitmap.height * k), cx, cy);
  return Object.assign(l, { tipo: 'imagem', bitmap });
}

export function duplicar(layer, deslocamento) {
  return { ...layer, id: ++idSeq, x: layer.x + deslocamento, y: layer.y + deslocamento };
}

/** Cópia rasa serve para o histórico: bitmaps são imutáveis, dá para compartilhar. */
export function copiarLista(layers) {
  return layers.map((l) => ({ ...l }));
}

/* ------------------------------------------------------------------ *
 * Texto
 * ------------------------------------------------------------------ */
const medidor = document.createElement('canvas').getContext('2d');

export function fonteCss(l) {
  return l.weight + ' ' + l.size + 'px ' + l.font;
}

/** Quebra o texto na largura da caixa, respeitando as quebras manuais. */
export function linhasDe(l) {
  medidor.font = fonteCss(l);
  const linhas = [];
  for (const paragrafo of String(l.text).split('\n')) {
    if (!paragrafo.trim()) { linhas.push(''); continue; }
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/)) {
      const tentativa = atual ? atual + ' ' + palavra : palavra;
      if (atual && medidor.measureText(tentativa).width > l.w) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Altura ocupada de fato — o texto cresce conforme as linhas quebram. */
export function alturaReal(l) {
  if (l.tipo !== 'texto') return l.h;
  return Math.max(l.size * 1.3, linhasDe(l).length * l.size * 1.3);
}

/* ------------------------------------------------------------------ *
 * Desenho
 * ------------------------------------------------------------------ */
function caminho(ctx, l) {
  const w = l.w;
  const h = l.h;
  const x = -w / 2;
  const y = -h / 2;

  switch (l.shape) {
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      return;
    case 'roundRect':
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(l.radius, w / 2, h / 2));
      return;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      return;
    case 'star': {
      ctx.beginPath();
      const rExt = Math.min(w, h) / 2;
      const rInt = rExt * 0.44;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? rInt : rExt;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      return;
    }
    case 'heart': {
      ctx.beginPath();
      const s = Math.min(w, h) / 2;
      ctx.moveTo(0, s * 0.78);
      ctx.bezierCurveTo(-s * 1.65, -s * 0.28, -s * 0.62, -s * 1.25, 0, -s * 0.42);
      ctx.bezierCurveTo(s * 0.62, -s * 1.25, s * 1.65, -s * 0.28, 0, s * 0.78);
      ctx.closePath();
      return;
    }
    case 'line':
    case 'arrow': {
      const meia = h / 2;
      const ponta = l.shape === 'arrow' ? Math.min(w * 0.34, h * 2) : 0;
      ctx.beginPath();
      ctx.moveTo(x, -meia * 0.5);
      ctx.lineTo(x + w - ponta, -meia * 0.5);
      if (ponta) {
        ctx.lineTo(x + w - ponta, -meia);
        ctx.lineTo(x + w, 0);
        ctx.lineTo(x + w - ponta, meia);
        ctx.lineTo(x + w - ponta, meia * 0.5);
      } else {
        ctx.lineTo(x + w, -meia * 0.5);
        ctx.lineTo(x + w, meia * 0.5);
      }
      ctx.lineTo(x, meia * 0.5);
      ctx.closePath();
      return;
    }
    default:
      ctx.beginPath();
      ctx.rect(x, y, w, h);
  }
}

export function desenharCamada(ctx, l) {
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.translate(l.x, l.y);
  if (l.rot) ctx.rotate((l.rot * Math.PI) / 180);

  if (l.tipo === 'imagem') {
    ctx.drawImage(l.bitmap, -l.w / 2, -l.h / 2, l.w, l.h);
  } else if (l.tipo === 'forma') {
    caminho(ctx, l);
    ctx.fillStyle = l.fill;
    ctx.fill();
    if (l.strokeWidth > 0) {
      ctx.lineWidth = l.strokeWidth;
      ctx.strokeStyle = l.stroke;
      ctx.stroke();
    }
  } else if (l.tipo === 'texto') {
    const linhas = linhasDe(l);
    const alturaLinha = l.size * 1.3;
    ctx.font = fonteCss(l);
    ctx.textAlign = l.align;
    ctx.textBaseline = 'middle';
    const x = l.align === 'left' ? -l.w / 2 : l.align === 'right' ? l.w / 2 : 0;
    const y0 = -((linhas.length - 1) * alturaLinha) / 2;
    ctx.lineJoin = 'round';

    linhas.forEach((linha, i) => {
      const y = y0 + i * alturaLinha;
      if (l.strokeWidth > 0) {
        ctx.lineWidth = l.strokeWidth;
        ctx.strokeStyle = l.stroke;
        ctx.strokeText(linha, x, y);
      }
      ctx.fillStyle = l.color;
      ctx.fillText(linha, x, y);
    });
  }

  ctx.restore();
}

export function desenharCamadas(ctx, layers) {
  if (!layers) return;
  for (const l of layers) desenharCamada(ctx, l);
}

/* ------------------------------------------------------------------ *
 * Geometria e seleção
 * ------------------------------------------------------------------ */

/** Os 4 cantos da camada, em coordenadas da imagem original. */
export function cantos(l) {
  const hw = l.w / 2;
  const hh = alturaReal(l) / 2;
  const a = (l.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => ({
    x: l.x + dx * cos - dy * sen,
    y: l.y + dx * sen + dy * cos,
  }));
}

/** Leva um ponto do espaço da imagem para o espaço local da camada. */
export function paraLocal(l, px, py) {
  const a = (-l.rot * Math.PI) / 180;
  const dx = px - l.x;
  const dy = py - l.y;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
}

export function contem(l, px, py) {
  const p = paraLocal(l, px, py);
  return Math.abs(p.x) <= l.w / 2 && Math.abs(p.y) <= alturaReal(l) / 2;
}

/** Camada mais ao topo sob o ponto. */
export function camadaEm(layers, px, py) {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (contem(layers[i], px, py)) return layers[i];
  }
  return null;
}

export function reordenar(layers, layer, direcao) {
  const i = layers.indexOf(layer);
  if (i < 0) return;
  layers.splice(i, 1);
  const destino =
    direcao === 'topo' ? layers.length :
    direcao === 'fundo' ? 0 :
    direcao === 'frente' ? Math.min(layers.length, i + 1) :
    Math.max(0, i - 1);
  layers.splice(destino, 0, layer);
}
