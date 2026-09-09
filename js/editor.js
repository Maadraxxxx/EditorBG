/**
 * Editor: pincel para corrigir a máscara, ajustes de cor, recorte e posição.
 *
 * O preview trabalha sempre na resolução de tela (não na resolução original),
 * então pincelar continua fluido mesmo numa foto de 3000px. A resolução cheia
 * só é usada no "Aplicar", pelo compose() da galeria.
 */
import { geometry, drawCutout, fonteAjustada, cloneCanvas, defaultEdit } from './compose.js';
import { ajustesPadrao } from './adjust.js';
import * as L from './layers.js';
import { refreshSliders } from './sliders.js';

const $ = (id) => document.getElementById(id);

const el = {
  root: $('editor'),
  name: $('edName'),
  tabs: $('edTabs'),
  stage: $('edStage'),
  frame: $('edFrame'),
  canvas: $('edCanvas'),
  cropBox: $('cropBox'),
  cursor: $('brushCursor'),
  undo: $('edUndo'),
  reset: $('edReset'),
  cancel: $('edCancel'),
  apply: $('edApply'),
  brushMode: $('brushMode'),
  brushSize: $('brushSize'),
  brushSizeVal: $('brushSizeVal'),
  brushHard: $('brushHard'),
  brushHardVal: $('brushHardVal'),
  showMask: $('showMask'),
  brushHint: $('brushHint'),
  home: $('edHome'),
  empty: $('edEmpty'),
  inverter: $('inverter'),
  adjustReset: $('adjustReset'),
  ratios: $('ratios'),
  cropTrim: $('cropTrim'),
  cropReset: $('cropReset'),
  cropInfo: $('cropInfo'),
  outW: $('outW'),
  outH: $('outH'),
  lockRatio: $('lockRatio'),
  outReset: $('outReset'),
  rotate: $('rotate'),
  rotateVal: $('rotateVal'),
  rotL: $('rotL'),
  rotR: $('rotR'),
  flipH: $('flipH'),
  flipV: $('flipV'),
  transformReset: $('transformReset'),
  zoomIn: $('zoomIn'),
  zoomOut: $('zoomOut'),
  zoomVal: $('zoomVal'),
  applyHD: $('edApplyHD'),
  // camadas
  selecao: $('edSelecao'),
  selNome: $('selNome'),
  selOpacidade: $('selOpacidade'),
  selOpacidadeVal: $('selOpacidadeVal'),
  selExcluir: $('selExcluir'),
  selExcluirTexto: $('selExcluirTexto'),
  selDuplicar: $('selDuplicar'),
  selFrente: $('selFrente'),
  selFundo: $('selFundo'),
  addTexto: $('addTexto'),
  presets: document.querySelector('.ed-presets'),
  propsTexto: $('propsTexto'),
  txtConteudo: $('txtConteudo'),
  txtFonte: $('txtFonte'),
  txtTamanho: $('txtTamanho'),
  txtCor: $('txtCor'),
  txtContorno: $('txtContorno'),
  txtBorda: $('txtBorda'),
  txtAlinha: $('txtAlinha'),
  txtPeso: $('txtPeso'),
  formas: $('formas'),
  propsForma: $('propsForma'),
  fmCor: $('fmCor'),
  fmContorno: $('fmContorno'),
  fmBorda: $('fmBorda'),
  fmRaio: $('fmRaio'),
  addUpload: $('addUpload'),
  upFile: $('upFile'),
  uploadsGrid: $('uploadsGrid'),
};

const ctx = el.canvas.getContext('2d');

// Na página de edição pura não existe "fundo removido pela IA": o pincel é uma
// borracha comum, e os rótulos precisam dizer isso.
if (document.body.dataset.mode === 'editor') {
  el.brushHint.textContent = 'Pinte para apagar partes da imagem — o que sair vira transparente.';
  el.brushMode.children[0].textContent = 'Apagar';
  el.brushMode.children[1].textContent = 'Restaurar';
  el.showMask.parentElement.lastChild.textContent = ' Ver o que sobrou em vermelho';
  el.reset.textContent = 'Voltar ao original';
}

let S = null;      // sessão de edição em andamento
let rafPending = false;

/**
 * Os ajustes rodam pixel a pixel, caro demais para refazer a cada quadro. O
 * resultado fica em cache e só é recalculado quando algum valor muda — e no
 * preview com um teto de resolução, para o arrasto do slider não engasgar.
 */
const TETO_PREVIEW = 1600;
const TETO_ARRASTO = 700;   // enquanto o slider está sendo puxado, prioriza a resposta
let cacheAjuste = { chave: null, canvas: null };
let arrastandoAjuste = false;

function fonteDoPreview() {
  const teto = arrastandoAjuste ? TETO_ARRASTO : TETO_PREVIEW;
  const chave = teto + '|' + JSON.stringify(S.edit.adjust);
  if (cacheAjuste.chave !== chave) {
    cacheAjuste = { chave, canvas: fonteAjustada(S.item.bitmap, S.edit.adjust, teto) };
  }
  return cacheAjuste.canvas;
}

function invalidarAjuste() {
  cacheAjuste = { chave: null, canvas: null };
}

/* ------------------------------------------------------------------ *
 * Abertura / fechamento
 * ------------------------------------------------------------------ */
export function openEditor(item, opts) {
  S = {
    item,
    onApply: opts.onApply,
    background: opts.background,
    feather: opts.feather,
    pageMode: !!opts.pageMode,
    onDownload: opts.onDownload,
    onClose: opts.onClose,
    mask: cloneCanvas(item.maskCanvas),          // cópia: cancelar não altera nada
    edit: JSON.parse(JSON.stringify(item.edit)),
    tool: 'brush',
    brush: { mode: 'erase', size: Number(el.brushSize.value), hardness: Number(el.brushHard.value) / 100 },
    ratio: 'free',
    zoom: 1,
    fit: 1,
    scaleX: 1,
    scaleY: 1,
    // Retoma o recorte já salvo no item; layout() preenche com a caixa inteira se for null.
    crop: item.edit.crop ? { ...item.edit.crop } : null,
    resize: item.edit.resize ? { ...item.edit.resize } : null,
    layers: item.edit.layers ? L.copiarLista(item.edit.layers) : [],
    sel: null,          // camada selecionada
    arraste: null,      // { modo, ... } durante mover/girar/redimensionar
    history: [],
    painting: false,
    last: null,
  };

  invalidarAjuste();
  el.name.textContent = item.name;
  el.root.hidden = false;
  el.stage.scrollTo(0, 0);
  if (el.empty) el.empty.hidden = true;

  // Na página de edição o editor é a tela inteira, não um diálogo: em vez de
  // aplicar e voltar para uma galeria, a pessoa baixa o arquivo e segue.
  if (S.pageMode) {
    el.home.hidden = false;
    el.cancel.textContent = 'Trocar imagem';
    el.apply.lastChild.textContent = ' Baixar grátis';
    el.applyHD.hidden = false;
  }
  el.showMask.checked = false;
  [...el.ratios.children].forEach((x, i) => x.classList.toggle('is-active', i === 0));

  syncControlsFromEdit();
  atualizarPainelSelecao();
  selectTool('brush');
  layout();
  window.addEventListener('resize', layout);
}

export function isEditorOpen() {
  return !el.root.hidden;
}

function close() {
  window.removeEventListener('resize', layout);
  const pageMode = S && S.pageMode;
  const onClose = S && S.onClose;
  S = null;

  if (pageMode) {
    if (el.empty) el.empty.hidden = false;   // volta a pedir uma imagem
    if (onClose) onClose();
    return;
  }
  el.root.hidden = true;
}

/* ------------------------------------------------------------------ *
 * Layout e desenho
 * ------------------------------------------------------------------ */
function layout() {
  if (!S) return;
  const g = geom();
  if (!S.crop) S.crop = { x: 0, y: 0, w: g.boxW, h: g.boxH };
  clampCrop();

  // O tamanho pedido em pixels vira distorção no preview: assim dá pra ver o
  // esticamento antes de aplicar, em vez de descobrir só no arquivo salvo.
  const out = S.resize || cropSize();
  const sx = out.w / S.crop.w;
  const sy = out.h / S.crop.h;

  const pad = 48;
  const availW = Math.max(120, el.stage.clientWidth - pad);
  const availH = Math.max(120, el.stage.clientHeight - pad);
  S.fit = Math.min(availW / (g.boxW * sx), availH / (g.boxH * sy), 1.6);

  const k = S.fit * S.zoom;
  const dw = Math.max(1, Math.round(g.boxW * sx * k));
  const dh = Math.max(1, Math.round(g.boxH * sy * k));

  // A escala sai do tamanho já arredondado do canvas: com a escala fracionária
  // a imagem parava um pixel antes da borda e o xadrez aparecia como um risco.
  S.scaleX = dw / g.boxW;
  S.scaleY = dh / g.boxH;

  el.canvas.width = dw;
  el.canvas.height = dh;
  el.frame.style.width = dw + 'px';
  el.frame.style.height = dh + 'px';

  el.zoomVal.textContent = Math.round(S.zoom * 100) + '%';
  draw();
}

function geom() {
  return geometry(S.item.bitmap.width, S.item.bitmap.height, S.edit);
}

/* ------------------------------------------------------------------ *
 * Zoom
 * ------------------------------------------------------------------ */
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 8;

/**
 * Aplica o zoom mantendo sob o cursor o mesmo ponto da imagem. Sem esse
 * reposicionamento do scroll, aproximar joga a área de interesse para fora.
 */
function setZoom(z, anchorX, anchorY) {
  const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  if (novo === S.zoom) return;

  const stage = el.stage;
  const rect = el.canvas.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const temAncora = anchorX != null && rect.width > 0;

  // posição do ponto ancorado dentro da imagem, em fração
  const fx = temAncora ? (anchorX - rect.left) / rect.width : 0.5;
  const fy = temAncora ? (anchorY - rect.top) / rect.height : 0.5;
  // onde esse ponto está na janela do palco
  const viewX = temAncora ? anchorX - stageRect.left : stage.clientWidth / 2;
  const viewY = temAncora ? anchorY - stageRect.top : stage.clientHeight / 2;

  S.zoom = novo;
  layout();

  stage.scrollLeft = el.frame.offsetLeft + fx * el.canvas.width - viewX;
  stage.scrollTop = el.frame.offsetTop + fy * el.canvas.height - viewY;
}

el.zoomIn.addEventListener('click', () => { if (S) setZoom(S.zoom * 1.25); });
el.zoomOut.addEventListener('click', () => { if (S) setZoom(S.zoom / 1.25); });
el.zoomVal.addEventListener('click', () => { if (S) setZoom(1); });   // volta a caber na tela

// Ctrl/⌘ + roda amplia; a roda sozinha continua rolando o palco.
el.stage.addEventListener('wheel', (e) => {
  if (!S || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  setZoom(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
}, { passive: false });

function scheduleDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; draw(); });
}

function draw() {
  if (!S) return;
  const g = geom();
  const dw = el.canvas.width;
  const dh = el.canvas.height;

  // matriz origem -> tela (caixa inteira, sem recorte: o recorte é a moldura)
  const m = new DOMMatrix().scale(S.scaleX, S.scaleY).multiply(g.boxMatrix);

  const tmp = document.createElement('canvas');
  tmp.width = dw;
  tmp.height = dh;
  drawCutout(tmp.getContext('2d'), {
    bitmap: fonteDoPreview(),
    mask: S.mask,
    matrix: m,
    feather: S.feather * (S.scaleX + S.scaleY) / 2,
  });

  ctx.clearRect(0, 0, dw, dh);
  if (S.background !== 'transparent') {
    ctx.fillStyle = S.background;
    ctx.fillRect(0, 0, dw, dh);
  }
  ctx.drawImage(tmp, 0, 0);

  // camadas por cima da foto, na mesma matriz
  if (S.layers.length) {
    ctx.save();
    ctx.setTransform(m);
    L.desenharCamadas(ctx, S.layers);
    ctx.restore();
  }

  if (el.showMask.checked) {
    // vermelho onde a máscara está ativa, para enxergar as bordas
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = 'source-over';
    const tint = document.createElement('canvas');
    tint.width = dw; tint.height = dh;
    const tctx = tint.getContext('2d');
    tctx.setTransform(m);
    tctx.drawImage(S.mask, 0, 0);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = '#f43f5e';
    tctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(tint, 0, 0);
    ctx.restore();
  }

  if (modoCamadas() && S.sel) desenharSelecao(m);
  paintCropBox();
}

function paintCropBox() {
  const show = S.tool === 'crop';
  el.cropBox.hidden = !show;
  syncSizeInputs();
  if (!show) return;
  const c = S.crop;
  el.cropBox.style.left = c.x * S.scaleX + 'px';
  el.cropBox.style.top = c.y * S.scaleY + 'px';
  el.cropBox.style.width = c.w * S.scaleX + 'px';
  el.cropBox.style.height = c.h * S.scaleY + 'px';
}

/* ------------------------------------------------------------------ *
 * Camadas: seleção e manipulação
 * ------------------------------------------------------------------ */
const FERRAMENTAS_CAMADA = ['texto', 'elementos', 'uploads'];
const RAIO_ALCA = 7;

function modoCamadas() {
  return FERRAMENTAS_CAMADA.includes(S.tool);
}

/** Matriz que leva da imagem original para o canvas exibido. */
function matrizTela() {
  return new DOMMatrix().scale(S.scaleX, S.scaleY).multiply(geom().boxMatrix);
}

/** Cantos da camada já em pixels do canvas, mais a alça de rotação. */
function alcasNaTela(m) {
  const pts = L.cantos(S.sel).map((p) => m.transformPoint(new DOMPoint(p.x, p.y)));
  const meioTopo = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const meioBaixo = { x: (pts[3].x + pts[2].x) / 2, y: (pts[3].y + pts[2].y) / 2 };
  const dx = meioTopo.x - meioBaixo.x;
  const dy = meioTopo.y - meioBaixo.y;
  const comp = Math.hypot(dx, dy) || 1;
  const girar = { x: meioTopo.x + (dx / comp) * 26, y: meioTopo.y + (dy / comp) * 26 };
  return { pts, girar, meioTopo };
}

function desenharSelecao(m) {
  const { pts, girar, meioTopo } = alcasNaTela(m);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(meioTopo.x, meioTopo.y);
  ctx.lineTo(girar.x, girar.y);
  ctx.stroke();

  const bolinha = (p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, RAIO_ALCA, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  pts.forEach(bolinha);
  bolinha(girar);
  ctx.restore();
}

/** Qual alça está sob o ponto (em pixels do canvas)? */
function alcaEm(cx, cy) {
  if (!S.sel) return null;
  const { pts, girar } = alcasNaTela(matrizTela());
  if (Math.hypot(girar.x - cx, girar.y - cy) <= RAIO_ALCA + 4) return { tipo: 'girar' };
  for (let i = 0; i < 4; i++) {
    if (Math.hypot(pts[i].x - cx, pts[i].y - cy) <= RAIO_ALCA + 4) return { tipo: 'canto', i };
  }
  return null;
}

function selecionar(layer) {
  S.sel = layer;
  atualizarPainelSelecao();
  scheduleDraw();
}

/** Redimensiona mantendo o canto oposto parado. */
function redimensionar(indiceCanto, ponto) {
  const l = S.sel;
  const oposto = L.cantos(l)[(indiceCanto + 2) % 4];

  const a = (-l.rot * Math.PI) / 180;
  const dx = ponto.x - oposto.x;
  const dy = ponto.y - oposto.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);

  const novoW = Math.max(12, Math.abs(lx));
  const novoH = Math.max(12, Math.abs(ly));

  if (l.tipo === 'texto') {
    // no texto o corpo da letra acompanha a largura, como em qualquer editor
    const k = novoW / Math.max(1, l.w);
    l.size = Math.max(8, Math.round(l.size * k));
    l.w = Math.round(novoW);
  } else {
    l.w = Math.round(novoW);
    l.h = Math.round(novoH);
  }

  const sx = Math.sign(lx) || 1;
  const sy = Math.sign(ly) || 1;
  const hw = (l.w / 2) * sx;
  const hh = (L.alturaReal(l) / 2) * sy;
  const ang = (l.rot * Math.PI) / 180;
  l.x = oposto.x + hw * Math.cos(ang) - hh * Math.sin(ang);
  l.y = oposto.y + hw * Math.sin(ang) + hh * Math.cos(ang);
}

/* --------------------- tamanho em pixels -------------------------- */

function cropSize() {
  return { w: Math.round(S.crop.w), h: Math.round(S.crop.h) };
}

/** Reflete moldura e tamanho final nos campos numéricos. */
function syncSizeInputs() {
  if (!S || !S.crop) return;
  const out = S.resize || cropSize();
  // Não sobrescreve o campo que a pessoa está digitando.
  if (document.activeElement !== el.outW) el.outW.value = out.w;
  if (document.activeElement !== el.outH) el.outH.value = out.h;
  el.cropInfo.textContent = 'Arquivo final: ' + out.w + ' × ' + out.h + ' px';
}

/**
 * Com a proporção travada, mudar a moldura reajusta a altura de saída para não
 * distorcer a imagem. Destravada, o tamanho pedido é respeitado como está.
 */
function followCrop() {
  if (!S.resize || !el.lockRatio.checked) return;
  const c = cropSize();
  S.resize = { w: S.resize.w, h: Math.max(1, Math.round(S.resize.w * c.h / c.w)) };
}

function setOutSize(w, h) {
  const base = S.resize || cropSize();
  const ratio = base.w / base.h;
  let nw = w || base.w;
  let nh = h || base.h;

  if (el.lockRatio.checked) {
    if (w) nh = Math.round(nw / ratio); else nw = Math.round(nh * ratio);
  }
  S.resize = {
    w: Math.min(20000, Math.max(1, Math.round(nw))),
    h: Math.min(20000, Math.max(1, Math.round(nh))),
  };
  layout();   // o preview precisa refletir a nova proporção
}

// 'change' (e não 'input') para não brigar com quem está digitando o número.
el.outW.addEventListener('change', () => { pushHistory(); setOutSize(Number(el.outW.value), 0); });
el.outH.addEventListener('change', () => { pushHistory(); setOutSize(0, Number(el.outH.value)); });

el.outReset.addEventListener('click', () => {
  pushHistory();
  S.resize = null;
  layout();
});

/* ------------------------------------------------------------------ *
 * Ferramentas
 * ------------------------------------------------------------------ */
el.tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tool]');
  if (b) selectTool(b.dataset.tool);
});

function selectTool(tool) {
  S.tool = tool;
  [...el.tabs.children].forEach((b) => b.classList.toggle('is-active', b.dataset.tool === tool));
  document.querySelectorAll('.ed-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tool));
  el.stage.classList.toggle('tool-brush', tool === 'brush');
  el.cursor.hidden = tool !== 'brush';
  if (!modoCamadas()) S.sel = null;
  atualizarPainelSelecao();
  draw();
}

/* ---------------------------- pincel ------------------------------ */
el.brushMode.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  S.brush.mode = b.dataset.mode;
  [...el.brushMode.children].forEach((x) => x.classList.toggle('is-active', x === b));
});

el.brushSize.addEventListener('input', () => {
  S.brush.size = Number(el.brushSize.value);
  el.brushSizeVal.textContent = S.brush.size + 'px';
  sizeCursor();
});

el.brushHard.addEventListener('input', () => {
  S.brush.hardness = Number(el.brushHard.value) / 100;
  el.brushHardVal.textContent = el.brushHard.value + '%';
});

el.showMask.addEventListener('change', draw);

function sizeCursor() {
  el.cursor.style.width = S.brush.size + 'px';
  el.cursor.style.height = S.brush.size + 'px';
}

/** Ponto na tela -> ponto na imagem original. */
function toSource(ev) {
  const r = el.canvas.getBoundingClientRect();
  const m = new DOMMatrix().scale(S.scaleX, S.scaleY).multiply(geom().boxMatrix);
  return m.inverse().transformPoint(new DOMPoint(ev.clientX - r.left, ev.clientY - r.top));
}

function stamp(from, to) {
  const c = S.mask.getContext('2d');
  // com escala diferente por eixo, a média mantém o pincel redondo o bastante
  const radius = (S.brush.size / 2) / ((S.scaleX + S.scaleY) / 2);
  const inner = Math.min(0.98, S.brush.hardness);

  c.save();
  c.globalCompositeOperation = S.brush.mode === 'erase' ? 'destination-out' : 'source-over';

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius * 0.25)));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const grad = c.createRadialGradient(x, y, radius * inner, x, y, radius);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

el.canvas.addEventListener('pointerdown', (e) => {
  if (!S || !modoCamadas()) return;
  e.preventDefault();
  try { el.canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }

  const r = el.canvas.getBoundingClientRect();
  const cx = e.clientX - r.left;
  const cy = e.clientY - r.top;
  const p = toSource(e);

  const alca = alcaEm(cx, cy);
  if (alca) {
    pushHistory();
    S.arraste = alca.tipo === 'girar'
      ? { modo: 'girar', anguloInicial: Math.atan2(p.y - S.sel.y, p.x - S.sel.x), rotInicial: S.sel.rot }
      : { modo: 'canto', i: alca.i };
    return;
  }

  const alvoCamada = L.camadaEm(S.layers, p.x, p.y);
  if (alvoCamada) {
    if (alvoCamada !== S.sel) selecionar(alvoCamada);
    pushHistory();
    S.arraste = { modo: 'mover', dx: alvoCamada.x - p.x, dy: alvoCamada.y - p.y };
  } else {
    selecionar(null);
  }
});

el.canvas.addEventListener('pointermove', (e) => {
  if (!S || !S.arraste) return;
  const p = toSource(e);
  const a = S.arraste;

  if (a.modo === 'mover') {
    S.sel.x = p.x + a.dx;
    S.sel.y = p.y + a.dy;
  } else if (a.modo === 'girar') {
    const ang = Math.atan2(p.y - S.sel.y, p.x - S.sel.x);
    let g = a.rotInicial + ((ang - a.anguloInicial) * 180) / Math.PI;
    if (e.shiftKey) g = Math.round(g / 15) * 15;   // Shift trava de 15 em 15
    S.sel.rot = Math.round(g);
  } else if (a.modo === 'canto') {
    redimensionar(a.i, p);
  }
  scheduleDraw();
});

['pointerup', 'pointercancel'].forEach((ev) =>
  el.canvas.addEventListener(ev, () => {
    if (S && S.arraste) { S.arraste = null; atualizarPainelSelecao(); }
  })
);

el.canvas.addEventListener('pointerdown', (e) => {
  if (!S || S.tool !== 'brush') return;
  e.preventDefault();
  try { el.canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
  pushHistory();
  S.painting = true;
  S.last = toSource(e);
  stamp(S.last, S.last);
  scheduleDraw();
});

el.canvas.addEventListener('pointermove', (e) => {
  if (!S) return;
  moveCursor(e);
  if (!S.painting) return;
  const p = toSource(e);
  stamp(S.last, p);
  S.last = p;
  scheduleDraw();
});

['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  el.canvas.addEventListener(ev, () => { if (S) S.painting = false; })
);

el.canvas.addEventListener('pointerenter', () => { if (S && S.tool === 'brush') el.cursor.hidden = false; });
el.canvas.addEventListener('pointerleave', () => { el.cursor.hidden = true; });

function moveCursor(e) {
  if (S.tool !== 'brush') return;
  const r = el.canvas.getBoundingClientRect();
  el.cursor.hidden = false;
  el.cursor.style.left = (e.clientX - r.left) + 'px';
  el.cursor.style.top = (e.clientY - r.top) + 'px';
}

/* --------------------------- ajustes ------------------------------ */
document.querySelectorAll('input.aj').forEach((input) => {
  const chave = input.dataset.aj;
  input.addEventListener('input', () => {
    if (!S) return;
    S.edit.adjust[chave] = Number(input.value);
    $(chave + 'Val').textContent = input.value;
    scheduleDraw();
  });
  // uma entrada só no histórico por arrasto, não uma por pixel movido
  input.addEventListener('pointerdown', () => {
    if (!S) return;
    pushHistory();
    arrastandoAjuste = true;
  });
});

// Ao soltar o slider, refaz o preview na resolução boa.
window.addEventListener('pointerup', () => {
  if (!arrastandoAjuste) return;
  arrastandoAjuste = false;
  if (S) scheduleDraw();
});

el.inverter.addEventListener('change', () => {
  if (!S) return;
  pushHistory();
  S.edit.adjust.inverter = el.inverter.checked;
  draw();
});

el.adjustReset.addEventListener('click', () => {
  pushHistory();
  S.edit.adjust = ajustesPadrao();
  syncControlsFromEdit();
  draw();
});

/* --------------------------- recorte ------------------------------ */
el.ratios.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ratio]');
  if (!b) return;
  [...el.ratios.children].forEach((x) => x.classList.toggle('is-active', x === b));
  S.ratio = b.dataset.ratio;
  if (S.ratio !== 'free') applyRatio();
  paintCropBox();
});

function applyRatio() {
  const g = geom();
  const r = Number(S.ratio);
  const c = S.crop;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  let w = c.w;
  let h = w / r;
  if (h > g.boxH) { h = g.boxH; w = h * r; }
  if (w > g.boxW) { w = g.boxW; h = w / r; }
  S.crop = { x: cx - w / 2, y: cy - h / 2, w, h };
  clampCrop();
}

function clampCrop() {
  const g = geom();
  const c = S.crop;
  c.w = Math.min(Math.max(16, c.w), g.boxW);
  c.h = Math.min(Math.max(16, c.h), g.boxH);
  c.x = Math.min(Math.max(0, c.x), g.boxW - c.w);
  c.y = Math.min(Math.max(0, c.y), g.boxH - c.h);
}

el.cropReset.addEventListener('click', () => {
  const g = geom();
  S.crop = { x: 0, y: 0, w: g.boxW, h: g.boxH };
  S.ratio = 'free';
  [...el.ratios.children].forEach((x, i) => x.classList.toggle('is-active', i === 0));
  paintCropBox();
});

/** Enquadra a moldura na área visível do objeto (bounding box da máscara). */
el.cropTrim.addEventListener('click', () => {
  const box = maskBounds();
  if (!box) return;
  const g = geom();
  const m = new DOMMatrix().multiply(g.boxMatrix);
  const pts = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]
    .map(([x, y]) => m.transformPoint(new DOMPoint(x, y)));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = Math.max(4, Math.min(g.boxW, g.boxH) * 0.02);
  S.crop = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: (Math.max(...xs) - Math.min(...xs)) + pad * 2,
    h: (Math.max(...ys) - Math.min(...ys)) + pad * 2,
  };
  S.ratio = 'free';
  [...el.ratios.children].forEach((x, i) => x.classList.toggle('is-active', i === 0));
  clampCrop();
  followCrop();
  paintCropBox();
});

/**
 * Bounding box dos pixels visíveis da máscara, no espaço da imagem original.
 * O corte usa 50% de opacidade: com um limiar baixo, qualquer resíduo fraco da
 * segmentação espalhado pela imagem faria a moldura abrir quase inteira.
 */
function maskBounds() {
  const w = S.mask.width;
  const h = S.mask.height;
  const step = Math.max(1, Math.round(Math.max(w, h) / 700)); // amostragem: rápido o bastante
  const data = S.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < x0 ? null : { x0, y0, x1: x1 + step, y1: y1 + step };
}

// arrastar / redimensionar a moldura
let cropDrag = null;

el.cropBox.addEventListener('pointerdown', (e) => {
  if (!S || S.tool !== 'crop') return;
  e.preventDefault();
  e.stopPropagation();
  const handle = e.target.closest('.ch');
  try { el.cropBox.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
  cropDrag = {
    handle: handle ? handle.dataset.h : 'move',
    startX: e.clientX,
    startY: e.clientY,
    orig: { ...S.crop },
  };
});

el.cropBox.addEventListener('pointermove', (e) => {
  if (!cropDrag) return;
  const dx = (e.clientX - cropDrag.startX) / S.scaleX;
  const dy = (e.clientY - cropDrag.startY) / S.scaleY;
  const o = cropDrag.orig;
  const g = geom();
  let { x, y, w, h } = o;

  if (cropDrag.handle === 'move') {
    x = o.x + dx;
    y = o.y + dy;
  } else {
    const hs = cropDrag.handle;
    if (hs.includes('w')) { x = o.x + dx; w = o.w - dx; }
    if (hs.includes('e')) { w = o.w + dx; }
    if (hs.includes('n')) { y = o.y + dy; h = o.h - dy; }
    if (hs.includes('s')) { h = o.h + dy; }

    if (S.ratio !== 'free') {
      const r = Number(S.ratio);
      if (hs === 'n' || hs === 's') w = h * r; else h = w / r;
      if (hs.includes('w')) x = o.x + o.w - w;
      if (hs.includes('n')) y = o.y + o.h - h;
    }
    w = Math.max(16, w);
    h = Math.max(16, h);
  }

  S.crop = { x, y, w, h };
  // limita sem deixar a moldura sair da imagem
  S.crop.w = Math.min(S.crop.w, g.boxW);
  S.crop.h = Math.min(S.crop.h, g.boxH);
  S.crop.x = Math.min(Math.max(0, S.crop.x), g.boxW - S.crop.w);
  S.crop.y = Math.min(Math.max(0, S.crop.y), g.boxH - S.crop.h);
  followCrop();
  paintCropBox();
});

['pointerup', 'pointercancel'].forEach((ev) =>
  el.cropBox.addEventListener(ev, () => { cropDrag = null; })
);

/* --------------------------- posição ------------------------------ */
el.rotate.addEventListener('input', () => {
  S.edit.rotate = Number(el.rotate.value);
  el.rotateVal.textContent = S.edit.rotate + '°';
  S.crop = null;            // a caixa mudou de tamanho: recomeça o recorte
  layout();
});

function turn(delta) {
  pushHistory();
  S.edit.rotate = ((S.edit.rotate + delta + 180 + 360) % 360) - 180;
  el.rotate.value = S.edit.rotate;
  el.rotateVal.textContent = S.edit.rotate + '°';
  S.crop = null;
  layout();
}

el.rotL.addEventListener('click', () => turn(-90));
el.rotR.addEventListener('click', () => turn(90));

el.flipH.addEventListener('click', () => { pushHistory(); S.edit.flipH = !S.edit.flipH; draw(); });
el.flipV.addEventListener('click', () => { pushHistory(); S.edit.flipV = !S.edit.flipV; draw(); });

el.transformReset.addEventListener('click', () => {
  pushHistory();
  const d = defaultEdit();
  S.edit.rotate = d.rotate;
  S.edit.flipH = d.flipH;
  S.edit.flipV = d.flipV;
  S.crop = null;
  syncControlsFromEdit();
  layout();
});

/* ------------------------------------------------------------------ *
 * Histórico, reset, aplicar
 * ------------------------------------------------------------------ */
function pushHistory() {
  S.history.push({
    mask: cloneCanvas(S.mask),
    edit: JSON.parse(JSON.stringify({ ...S.edit, layers: [] })),
    layers: L.copiarLista(S.layers),
    selId: S.sel ? S.sel.id : null,
    resize: S.resize ? { ...S.resize } : null,
    crop: S.crop ? { ...S.crop } : null,
  });
  if (S.history.length > 24) S.history.shift();
  el.undo.disabled = false;
}

el.undo.addEventListener('click', undo);

function undo() {
  if (!S || !S.history.length) return;
  const prev = S.history.pop();
  S.mask = prev.mask;
  S.edit = prev.edit;
  S.crop = prev.crop ? { ...prev.crop } : null;
  S.resize = prev.resize ? { ...prev.resize } : null;
  S.layers = L.copiarLista(prev.layers || []);
  S.sel = S.layers.find((l) => l.id === prev.selId) || null;
  atualizarPainelSelecao();
  el.undo.disabled = S.history.length === 0;
  syncControlsFromEdit();
  layout();
}

el.reset.addEventListener('click', () => {
  pushHistory();
  S.mask = cloneCanvas(S.item.aiMask);
  S.edit = defaultEdit();
  S.crop = null;
  S.resize = null;
  S.layers = [];
  S.sel = null;
  atualizarPainelSelecao();
  syncControlsFromEdit();
  layout();
});

function syncControlsFromEdit() {
  const a = S.edit.adjust;
  document.querySelectorAll('input.aj').forEach((input) => {
    const chave = input.dataset.aj;
    input.value = a[chave];
    $(chave + 'Val').textContent = a[chave];
  });
  el.inverter.checked = !!a.inverter;
  el.rotate.value = S.edit.rotate;
  el.rotateVal.textContent = S.edit.rotate + '°';
  el.brushSizeVal.textContent = S.brush.size + 'px';
  el.brushHardVal.textContent = Math.round(S.brush.hardness * 100) + '%';
  el.undo.disabled = S.history.length === 0;
  sizeCursor();
  refreshSliders(el.root);   // os `value` acima foram setados por código: repinta o degradê
}

/* ------------------------------------------------------------------ *
 * Camadas: paineis
 * ------------------------------------------------------------------ */
L.FONTES.forEach((f) => {
  const o = document.createElement('option');
  o.value = f.id;
  o.textContent = f.nome;
  o.style.fontFamily = f.id;
  el.txtFonte.appendChild(o);
});

const ICONES_FORMA = {
  rect: '<rect x="3" y="5" width="18" height="14" rx="1"/>',
  roundRect: '<rect x="3" y="5" width="18" height="14" rx="5"/>',
  ellipse: '<circle cx="12" cy="12" r="8.5"/>',
  triangle: '<path d="M12 3.5 21 20H3Z"/>',
  star: '<path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.8 6.4 20.1l1.4-6.3L3 9.5l6.4-.6Z"/>',
  heart: '<path d="M12 20S3.5 14.6 3.5 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8.5 2.2C20.5 14.6 12 20 12 20Z"/>',
  line: '<path d="M3.5 12h17"/>',
  arrow: '<path d="M3.5 12h15"/><path d="m14 7 5.5 5-5.5 5"/>',
};

L.FORMAS.forEach((shape) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.shape = shape;
  const traco = (shape === 'line' || shape === 'arrow');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="' +
    (traco ? 'none' : 'currentColor') + '" stroke="currentColor" stroke-width="' +
    (traco ? '2.2' : '1.6') + '" stroke-linecap="round" stroke-linejoin="round">' +
    ICONES_FORMA[shape] + '</svg>';
  el.formas.appendChild(b);
});

/** Centro da area visivel, para a camada nova nascer onde da pra ver. */
function centroVisivel() {
  const g = geom();
  const c = S.crop || { x: 0, y: 0, w: g.boxW, h: g.boxH };
  const p = g.boxMatrix.inverse().transformPoint(new DOMPoint(c.x + c.w / 2, c.y + c.h / 2));
  return { x: p.x, y: p.y, escala: Math.max(c.w, c.h) / 1000 };
}

function adicionar(layer) {
  pushHistory();
  S.layers.push(layer);
  selecionar(layer);
}

el.addTexto.addEventListener('click', () => {
  if (!S) return;
  const c = centroVisivel();
  adicionar(L.novoTexto(c.x, c.y, c.escala, 'titulo'));
});

el.presets.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-preset]');
  if (!b || !S) return;
  const c = centroVisivel();
  adicionar(L.novoTexto(c.x, c.y, c.escala, b.dataset.preset));
});

el.formas.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-shape]');
  if (!b || !S) return;
  const c = centroVisivel();
  adicionar(L.novaForma(b.dataset.shape, c.x, c.y, c.escala));
});

el.addUpload.addEventListener('click', () => el.upFile.click());

el.upFile.addEventListener('change', async () => {
  for (const f of el.upFile.files) {
    if (!f.type.startsWith('image/')) continue;
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    guardarUpload(bmp);
    const c = centroVisivel();
    adicionar(L.novaImagem(bmp, c.x, c.y, Math.max(c.escala * 500, 60)));
  }
  el.upFile.value = '';
});

/** Miniaturas das imagens enviadas, para reaproveitar sem enviar de novo. */
function guardarUpload(bmp) {
  const mini = document.createElement('canvas');
  const k = 120 / Math.max(bmp.width, bmp.height);
  mini.width = Math.max(1, Math.round(bmp.width * k));
  mini.height = Math.max(1, Math.round(bmp.height * k));
  mini.getContext('2d').drawImage(bmp, 0, 0, mini.width, mini.height);

  const box = document.createElement('div');
  box.className = 'upload-item';

  const img = document.createElement('img');
  img.src = mini.toDataURL();
  img.title = 'Adicionar de novo';
  img.addEventListener('click', () => {
    if (!S) return;
    const c = centroVisivel();
    adicionar(L.novaImagem(bmp, c.x, c.y, Math.max(c.escala * 500, 60)));
  });

  // Tirar da lista não mexe nas camadas já colocadas — só some o atalho.
  const tirar = document.createElement('button');
  tirar.className = 'upload-x';
  tirar.type = 'button';
  tirar.title = 'Tirar da lista';
  tirar.textContent = '×';
  tirar.addEventListener('click', (e) => {
    e.stopPropagation();
    box.remove();
  });

  box.append(img, tirar);
  el.uploadsGrid.appendChild(box);
}

/* --- propriedades da camada selecionada --- */
function atualizarPainelSelecao() {
  const l = S && S.sel;
  el.selecao.hidden = !l;
  el.propsTexto.hidden = !(l && l.tipo === 'texto');
  el.propsForma.hidden = !(l && l.tipo === 'forma');
  if (!l) return;

  el.selNome.textContent = l.tipo === 'texto' ? 'Texto' : l.tipo === 'forma' ? 'Forma' : 'Imagem';
  el.selOpacidade.value = Math.round(l.opacity * 100);
  el.selOpacidadeVal.textContent = Math.round(l.opacity * 100) + '%';

  if (l.tipo === 'texto') {
    if (document.activeElement !== el.txtConteudo) el.txtConteudo.value = l.text;
    el.txtFonte.value = l.font;
    el.txtTamanho.value = l.size;
    $('txtTamanhoVal').textContent = l.size;
    el.txtCor.value = l.color;
    el.txtContorno.value = l.stroke || '#000000';
    el.txtBorda.value = l.strokeWidth;
    $('txtBordaVal').textContent = l.strokeWidth;
    marcarAtivo(el.txtAlinha, 'align', l.align);
    marcarAtivo(el.txtPeso, 'weight', String(l.weight));
  } else if (l.tipo === 'forma') {
    el.fmCor.value = l.fill;
    el.fmContorno.value = l.stroke || '#000000';
    el.fmBorda.value = l.strokeWidth;
    $('fmBordaVal').textContent = l.strokeWidth;
    el.fmRaio.value = l.radius;
    $('fmRaioVal').textContent = l.radius;
  }
  refreshSliders(el.selecao);
  refreshSliders(el.propsTexto);
  refreshSliders(el.propsForma);
}

function marcarAtivo(grupo, attr, valor) {
  [...grupo.children].forEach((b) => b.classList.toggle('is-active', b.dataset[attr] === valor));
}

/** Liga um controle a uma propriedade da camada selecionada. */
function ligar(elemento, evento, aplicar, historico) {
  elemento.addEventListener(evento, () => {
    if (!S || !S.sel) return;
    if (historico) pushHistory();
    aplicar(S.sel, elemento);
    atualizarPainelSelecao();
    scheduleDraw();
  });
}

ligar(el.selOpacidade, 'input', (l, e) => { l.opacity = Number(e.value) / 100; });
ligar(el.txtConteudo, 'input', (l, e) => { l.text = e.value; });
ligar(el.txtFonte, 'change', (l, e) => { l.font = e.value; }, true);
ligar(el.txtTamanho, 'input', (l, e) => { l.size = Number(e.value); });
ligar(el.txtCor, 'input', (l, e) => { l.color = e.value; });
ligar(el.txtContorno, 'input', (l, e) => { l.stroke = e.value; });
ligar(el.txtBorda, 'input', (l, e) => { l.strokeWidth = Number(e.value); });
ligar(el.fmCor, 'input', (l, e) => { l.fill = e.value; });
ligar(el.fmContorno, 'input', (l, e) => { l.stroke = e.value; });
ligar(el.fmBorda, 'input', (l, e) => { l.strokeWidth = Number(e.value); });
ligar(el.fmRaio, 'input', (l, e) => { l.radius = Number(e.value); });

el.txtAlinha.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-align]');
  if (!b || !S || !S.sel) return;
  pushHistory();
  S.sel.align = b.dataset.align;
  atualizarPainelSelecao();
  scheduleDraw();
});

el.txtPeso.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-weight]');
  if (!b || !S || !S.sel) return;
  pushHistory();
  S.sel.weight = Number(b.dataset.weight);
  atualizarPainelSelecao();
  scheduleDraw();
});

function excluirSelecionada() {
  if (!S || !S.sel) return;
  pushHistory();
  S.layers.splice(S.layers.indexOf(S.sel), 1);
  selecionar(null);
}

el.selExcluir.addEventListener('click', excluirSelecionada);
el.selExcluirTexto.addEventListener('click', excluirSelecionada);

el.selDuplicar.addEventListener('click', () => {
  if (!S || !S.sel) return;
  pushHistory();
  const copia = L.duplicar(S.sel, Math.max(10, S.item.bitmap.width * 0.03));
  S.layers.push(copia);
  selecionar(copia);
});

el.selFrente.addEventListener('click', () => {
  if (!S || !S.sel) return;
  pushHistory();
  L.reordenar(S.layers, S.sel, 'frente');
  scheduleDraw();
});

el.selFundo.addEventListener('click', () => {
  if (!S || !S.sel) return;
  pushHistory();
  L.reordenar(S.layers, S.sel, 'tras');
  scheduleDraw();
});

/** Fecha as edições pendentes no item antes de qualquer download. */
function fixarEdicoes() {
  const g = geom();
  const c = S.crop;
  const full = !c || (c.x <= 0.5 && c.y <= 0.5 && c.w >= g.boxW - 1 && c.h >= g.boxH - 1);
  S.edit.crop = full ? null : { x: c.x, y: c.y, w: c.w, h: c.h };
  const cs = cropSize();
  S.edit.resize = (S.resize && (S.resize.w !== cs.w || S.resize.h !== cs.h))
    ? { w: S.resize.w, h: S.resize.h }
    : null;
  S.edit.layers = L.copiarLista(S.layers);
  S.item.edit = S.edit;
  S.item.maskCanvas = S.mask;
  return S.item;
}

el.applyHD.addEventListener('click', async () => {
  if (!S || !S.pageMode) return;
  await S.onDownload(fixarEdicoes(), { hd: true });
});

el.cancel.addEventListener('click', close);

el.apply.addEventListener('click', async () => {
  if (!S) return;
  const g = geom();
  const c = S.crop;
  const full = !c || (c.x <= 0.5 && c.y <= 0.5 && c.w >= g.boxW - 1 && c.h >= g.boxH - 1);

  S.edit.crop = full ? null : { x: c.x, y: c.y, w: c.w, h: c.h };

  // Guarda o tamanho final so quando ele difere do recorte.
  const cs = cropSize();
  S.edit.resize = (S.resize && (S.resize.w !== cs.w || S.resize.h !== cs.h))
    ? { w: S.resize.w, h: S.resize.h }
    : null;

  S.edit.layers = L.copiarLista(S.layers);
  S.item.edit = S.edit;
  S.item.maskCanvas = S.mask;

  const item = S.item;

  if (S.pageMode) {
    // não fecha: a pessoa pode continuar ajustando e baixar de novo
    await S.onDownload(item);
    return;
  }

  const onApply = S.onApply;
  close();
  await onApply(item);
});

window.addEventListener('keydown', (e) => {
  if (!S || el.root.hidden) return;
  if (e.key === 'Escape') { e.stopPropagation(); close(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  // Delete apaga a camada, mas nao enquanto se digita o texto dela
  const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if ((e.key === 'Delete' || e.key === 'Backspace') && !digitando && S.sel) {
    e.preventDefault();
    excluirSelecionada();
  }
});
