/**
 * EditorBG — remoção de fundo 100% no navegador.
 * Os modelos (ONNX) rodam via transformers.js, em WebGPU quando disponível.
 * Nenhuma imagem é enviada para servidores.
 */
import { compose, cloneCanvas, defaultEdit } from './compose.js';
import { MODELS, loadSegmenter, segmentImage } from './segment.js';
import { openEditor } from './editor.js';
import { refreshSliders } from './sliders.js';
import { baixar as baixarComPlano, abrirPaywall, temHD, aplicarLimite } from './paywall.js';
import * as Conta from './conta.js';
import './conta-ui.js';

const MAX_DIM = 3000; // limite de segurança para não estourar memória com fotos gigantes

/* ------------------------------------------------------------------ *
 * Elementos
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);

const dropzone = $('dropzone');
const fileInput = $('fileInput');
const grid = $('grid');
const toolbar = $('toolbar');
const loader = $('loader');
const loaderBar = $('loaderBar');
const loaderPct = $('loaderPct');
const loaderTitle = $('loaderTitle');
const loaderNote = $('loaderNote');
const engineDot = $('engineDot');
const engineLabel = $('engineLabel');
const customColor = $('customColor');
const customSwatch = $('customSwatch');
const featherInput = $('feather');
const featherVal = $('featherVal');
const clearBtn = $('clearBtn');
const modelSel = $('modelSel');
const twoPassInput = $('twoPass');
const twoPassText = $('twoPassText');
const modelHint = $('modelHint');
const downloadAllBtn = $('downloadAllBtn');
const downloadAllLabel = $('downloadAllLabel');
const downloadHDBtn = $('downloadHDBtn');

/* ------------------------------------------------------------------ *
 * Estado
 * ------------------------------------------------------------------ */
const items = [];           // { id, name, bitmap, maskCanvas, resultCanvas, els, status }
let background = 'transparent';
let feather = 0;
let queue = Promise.resolve();
let modelPromise = null;
let loadedKey = null;
let modelKey = 'padrao';
let twoPass = false;   // recurso VIP; ligado só com plano ativo
let idSeq = 0;

/* ------------------------------------------------------------------ *
 * Carregamento do modelo (uma vez, com barra de progresso)
 * ------------------------------------------------------------------ */
const progressPerFile = new Map();

function updateLoaderProgress() {
  let loaded = 0;
  let total = 0;
  for (const f of progressPerFile.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  if (!loaderBar) return;
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  loaderBar.style.width = pct + '%';
  loaderPct.textContent = pct + '%';
}

function onProgress(data) {
  if (data.status === 'progress' && data.total) {
    progressPerFile.set(data.file, { loaded: data.loaded, total: data.total });
    updateLoaderProgress();
  } else if (data.status === 'done' && progressPerFile.has(data.file)) {
    const f = progressPerFile.get(data.file);
    progressPerFile.set(data.file, { loaded: f.total, total: f.total });
    updateLoaderProgress();
  }
}

function setEngine(state, label) {
  if (!engineDot || !engineLabel) return;   // a página de edição não tem esse indicador
  engineDot.className = 'dot ' + state;
  engineLabel.textContent = label;
}

/**
 * Carrega (ou reaproveita) o segmentador do modelo escolhido. Trocar de modelo
 * descarrega o anterior: dois modelos grandes no mesmo heap estouram a memória.
 */
function loadModel() {
  if (modelPromise && loadedKey === modelKey) return modelPromise;

  loadedKey = modelKey;
  progressPerFile.clear();
  updateLoaderProgress();
  if (loader) {
    loader.hidden = false;
    loaderTitle.textContent = 'Baixando o modelo "' + MODELS[modelKey].nome + '"…';
    loaderNote.textContent = 'Só acontece na primeira vez — depois fica em cache no navegador.';
  }
  setEngine('loading', 'Carregando modelo…');

  modelPromise = loadSegmenter(modelKey, { onProgress })
    .then((bundle) => {
      finishLoading(bundle.device === 'webgpu' ? 'WebGPU (placa de vídeo)' : 'WASM (CPU)');
      return bundle;
    })
    .catch((err) => {
      modelPromise = null;
      loadedKey = null;
      if (loader) {
        loaderTitle.textContent = 'Não foi possível carregar o modelo.';
        loaderNote.textContent = (err && err.message ? err.message : String(err));
      }
      setEngine('error', 'Erro ao carregar');
      throw err;
    });

  return modelPromise;
}

function finishLoading(deviceLabel) {
  setEngine('ready', MODELS[modelKey].nome + ' · ' + deviceLabel);
  if (!loader) return;
  loaderBar.style.width = '100%';
  loaderPct.textContent = '100%';
  setTimeout(() => { loader.hidden = true; }, 700);
}

/* ------------------------------------------------------------------ *
 * Entrada de arquivos
 * ------------------------------------------------------------------ */
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  })
);

['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
    dropzone.classList.remove('dragging');
  })
);

dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) addFiles(files);
});

function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;

  toolbar.hidden = false;
  loadModel().catch(() => {});

  for (const file of files) {
    const item = createItem(file);
    items.push(item);
    queue = queue.then(() => processItem(item, file)).catch((err) => {
      console.error(err);
      failItem(item, err);
    });
  }
  updateDownloadAll();
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */
function createItem(file) {
  const id = ++idSeq;
  const safeName = escapeHtml(file.name);

  // Ícones em SVG (não emoji): ficam nítidos, monocromáticos e herdam a cor do botão.
  const svg = (paths, size) =>
    '<svg viewBox="0 0 24 24" width="' + (size || 15) + '" height="' + (size || 15) + '" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + paths + '</svg>';

  const icon = {
    eye: svg('<path d="M1.8 12S5.2 5.2 12 5.2 22.2 12 22.2 12 18.8 18.8 12 18.8 1.8 12 1.8 12Z"/><circle cx="12" cy="12" r="3.1"/>'),
    down: svg('<path d="M12 3.4v11.8"/><path d="m7.2 10.6 4.8 4.8 4.8-4.8"/><path d="M4.2 20.2h15.6"/>'),
    close: svg('<path d="M6.4 6.4 17.6 17.6"/><path d="M17.6 6.4 6.4 17.6"/>'),
    pencil: svg('<path d="M4 20h4L18.4 9.6a2.83 2.83 0 0 0-4-4L4 16v4Z"/><path d="m13.4 6.6 4 4"/>', 14),
    arrows: svg('<path d="M9.5 7.5 5 12l4.5 4.5"/><path d="M14.5 7.5 19 12l-4.5 4.5"/>', 13),
    redo: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5v5h-5"/>'),
    estrela: svg('<path d="m12 3.2 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.3 1.4-6.3L3 9.7l6.4-.6Z"/>'),
  };

  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = [
    '<div class="thumb checkerboard">',
    '  <div class="cmp-area">',
    '    <img class="result" alt="' + safeName + '" />',
    '    <img class="before" alt="" aria-hidden="true" />',
    '    <div class="split"></div>',
    '    <span class="grip">' + icon.arrows + '</span>',
    '    <div class="cmp-tag">Original</div>',
    '  </div>',
    '  <div class="overlay"><div class="spinner"></div><span>Na fila…</span></div>',
    '</div>',
    '<div class="card-body">',
    '  <span class="card-name">' + safeName + '</span>',
    '  <div class="card-actions">',
    '    <button class="edit-btn" disabled>' + icon.pencil + 'Editar</button>',
    '    <button class="icon-btn redo" title="Reprocessar com o modelo atual" disabled>' + icon.redo + '</button>',
    '    <button class="icon-btn cmp" title="Comparar em tela cheia" disabled>' + icon.eye + '</button>',
    '    <button class="icon-btn dl" title="Baixar gr\u00e1tis" disabled>' + icon.down + '</button>',
    '    <button class="icon-btn hd" title="Baixar em HD" disabled>' + icon.estrela + '</button>',
    '    <button class="icon-btn rm" title="Remover">' + icon.close + '</button>',
    '  </div>',
    '</div>',
  ].join('\n');

  grid.prepend(card);

  const els = {
    card,
    img: card.querySelector('.result'),
    before: card.querySelector('.before'),
    cmpArea: card.querySelector('.cmp-area'),
    overlay: card.querySelector('.overlay'),
    status: card.querySelector('.overlay span'),
    cmpBtn: card.querySelector('.cmp'),
    dlBtn: card.querySelector('.dl'),
    hdBtn: card.querySelector('.hd'),
    rmBtn: card.querySelector('.rm'),
    redoBtn: card.querySelector('.redo'),
    editBtn: card.querySelector('.edit-btn'),
  };

  const item = {
    id,
    name: file.name,
    els,
    status: 'queued',
    bitmap: null,
    aiMask: null,       // máscara original da IA, para o "Restaurar tudo"
    maskCanvas: null,   // máscara em uso (com as pinceladas do usuário)
    edit: defaultEdit(),
    resultCanvas: null,
    resultUrl: null,
    originalUrl: URL.createObjectURL(file),
  };

  els.img.src = item.originalUrl;
  els.before.src = item.originalUrl;
  setupCardCompare(item);
  els.dlBtn.addEventListener('click', () => downloadItem(item));
  els.hdBtn.addEventListener('click', () => downloadItem(item, { hd: true }));
  els.cmpBtn.addEventListener('click', () => openCompare(item));
  els.rmBtn.addEventListener('click', () => removeItem(item));
  els.redoBtn.addEventListener('click', () => reprocessItem(item));
  els.editBtn.addEventListener('click', () => abrirEditor(item));

  return item;
}

/**
 * Comparação antes/depois direto na miniatura: arrastar sobre a imagem revela o
 * original à esquerda da linha. Não depende do modal nem de passar o mouse antes.
 */
function setupCardCompare(item) {
  const area = item.els.cmpArea;
  let dragging = false;

  const setSplit = (clientX) => {
    const r = area.getBoundingClientRect();
    if (!r.width) return;
    const pct = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    area.style.setProperty('--split', pct + '%');
    item.els.card.classList.toggle('comparing', pct > 1);
  };

  area.addEventListener('pointerdown', (e) => {
    if (item.status !== 'done') return;
    e.preventDefault();
    dragging = true;
    try { area.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    setSplit(e.clientX);
  });

  area.addEventListener('pointermove', (e) => { if (dragging) setSplit(e.clientX); });

  ['pointerup', 'pointercancel'].forEach((ev) =>
    area.addEventListener(ev, () => { dragging = false; })
  );

  // Duplo clique volta a mostrar só o resultado.
  area.addEventListener('dblclick', () => {
    area.style.setProperty('--split', '0%');
    item.els.card.classList.remove('comparing');
  });
}

function abrirEditor(item) {
  openEditor(item, {
    background,
    feather,
    onApply: async (it) => {
      await render(it);
      it.els.card.classList.add('edited');
      updateDownloadAll();
    },
  });
}

function removeItem(item) {
  const i = items.indexOf(item);
  if (i >= 0) items.splice(i, 1);
  URL.revokeObjectURL(item.originalUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  item.els.card.remove();
  if (!items.length) toolbar.hidden = true;
  updateDownloadAll();
}

function failItem(item, err) {
  item.status = 'error';
  item.els.card.classList.add('error');
  if (item.els.status) {
    item.els.status.textContent = 'Falhou: ' + ((err && err.message) || 'erro desconhecido');
  }
  const spinner = item.els.overlay && item.els.overlay.querySelector('.spinner');
  if (spinner) spinner.remove();
}

/* ------------------------------------------------------------------ *
 * Processamento
 * ------------------------------------------------------------------ */
async function processItem(item, file) {
  setStatus(item, 'Analisando imagem…');

  // Decodifica uma única vez respeitando a orientação EXIF, para que a
  // máscara fique perfeitamente alinhada com o que é desenhado na tela.
  let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  bitmap = await downscaleIfNeeded(bitmap);
  item.bitmap = bitmap;

  await runSegmentation(item);
}

/** Roda a IA sobre o bitmap já decodificado. Reutilizado pelo "Reprocessar". */
async function runSegmentation(item) {
  setStatus(item, 'Carregando modelo…');
  const { segmenter } = await loadModel();
  item.aiMask = await segmentImage(segmenter, item.bitmap, {
    twoPass,
    onStatus: (s) => setStatus(item, s),
  });
  item.maskCanvas = cloneCanvas(item.aiMask);
  item.status = 'done';

  // Espera o PNG ficar pronto antes de liberar os botões — senão dá pra clicar
  // em comparar/baixar num instante em que o resultado ainda não existe.
  await render(item);

  item.els.overlay.hidden = true;
  item.els.card.classList.remove('busy');
  item.els.card.classList.add('can-compare');
  ['dlBtn', 'hdBtn', 'cmpBtn', 'editBtn', 'redoBtn'].forEach((k) => { item.els[k].disabled = false; });
  updateDownloadAll();
}

function setStatus(item, text) {
  if (item.els.status) item.els.status.textContent = text;
}

/**
 * Reprocessa a imagem com o modelo/ajustes atuais. As edições de enquadramento
 * e cor são mantidas; as pinceladas na máscara se perdem, porque a máscara é
 * justamente o que está sendo refeito.
 */
function reprocessItem(item) {
  if (item.status !== 'done') return;
  item.status = 'processing';
  item.els.card.classList.add('busy');
  item.els.card.classList.remove('can-compare');
  item.els.overlay.hidden = false;
  setStatus(item, 'Na fila…');
  ['dlBtn', 'hdBtn', 'cmpBtn', 'editBtn', 'redoBtn'].forEach((k) => { item.els[k].disabled = true; });
  updateDownloadAll();

  queue = queue.then(() => runSegmentation(item)).catch((err) => {
    console.error(err);
    failItem(item, err);
  });
}

async function downscaleIfNeeded(bitmap) {
  const max = Math.max(bitmap.width, bitmap.height);
  if (max <= MAX_DIM) return bitmap;
  const scale = MAX_DIM / max;
  return createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'high',
  });
}

/** Recompõe o resultado: imagem + máscara + edições + fundo escolhido. */
function render(item) {
  if (!item.maskCanvas) return Promise.resolve();

  const final = compose(item, { background, feather });
  item.resultCanvas = final;
  return new Promise((resolve) => {
    final.toBlob((blob) => {
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      item.resultUrl = URL.createObjectURL(blob);
      item.els.img.src = item.resultUrl;
      resolve();
    }, 'image/png');
  });
}

function renderAll() {
  for (const item of items) if (item.status === 'done') render(item);
}

/* ------------------------------------------------------------------ *
 * Controles de fundo / borda
 * ------------------------------------------------------------------ */
$('bgOptions').addEventListener('click', (e) => {
  const chip = e.target.closest('.bg-chip');
  if (!chip) return;
  document.querySelectorAll('.bg-chip').forEach((c) => c.classList.remove('is-active'));
  chip.classList.add('is-active');
  background = chip.classList.contains('custom') ? customColor.value : chip.dataset.bg;
  renderAll();
});

customColor.addEventListener('input', () => {
  customSwatch.style.background = customColor.value;
  background = customColor.value;
  document.querySelectorAll('.bg-chip').forEach((c) => c.classList.remove('is-active'));
  customColor.closest('.bg-chip').classList.add('is-active');
  renderAll();
});

featherInput.addEventListener('input', () => {
  feather = Number(featherInput.value);
  featherVal.textContent = feather + 'px';
  renderAll();
});

clearBtn.addEventListener('click', () => {
  [...items].forEach(removeItem);
});

/* ------------------------------------------------------------------ *
 * Downloads
 * ------------------------------------------------------------------ */
function outputName(name) {
  return name.replace(/\.[^./\\]+$/, '') + '-sem-fundo.png';
}

function downloadItem(item, opcoes) {
  if (!item.resultCanvas) return;
  baixarComPlano(item.resultCanvas, outputName(item.name), opcoes);
}

function updateDownloadAll() {
  const ready = items.filter((i) => i.status === 'done');
  downloadAllBtn.disabled = ready.length === 0;
  downloadHDBtn.disabled = ready.length === 0;
  downloadAllLabel.textContent = ready.length > 1
    ? 'Baixar todas (' + ready.length + ') .zip'
    : 'Baixar PNG';
}

/** O .zip também obedece ao plano — senão seria a porta dos fundos para a alta resolução. */
async function baixarTodas(hd) {
  const ready = items.filter((i) => i.status === 'done');
  if (!ready.length) return;

  if (hd && !temHD()) {
    abrirPaywall(ready[0].resultCanvas, outputName(ready[0].name));
    return;
  }
  if (ready.length === 1) return downloadItem(ready[0], { hd });

  const botao = hd ? downloadHDBtn : downloadAllBtn;
  const rotulo = hd ? null : downloadAllLabel;
  const original = rotulo ? rotulo.textContent : botao.textContent;
  botao.disabled = true;
  if (rotulo) rotulo.textContent = 'Compactando\u2026';

  try {
    const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const zip = new JSZip();
    const used = new Set();

    for (const item of ready) {
      const canvas = aplicarLimite(item.resultCanvas, hd);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      let name = outputName(item.name);
      let n = 2;
      while (used.has(name)) name = outputName(item.name).replace(/\.png$/, '-' + n++ + '.png');
      used.add(name);
      zip.file(name, blob);
    }

    const out = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(out);
    const a = document.createElement('a');
    a.href = url;
    a.download = hd ? 'imagens-sem-fundo-HD.zip' : 'imagens-sem-fundo.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.error(err);
    alert('N\u00e3o foi poss\u00edvel gerar o .zip: ' + err.message);
  } finally {
    if (rotulo) rotulo.textContent = original;
    botao.disabled = false;
  }
}

downloadAllBtn.addEventListener('click', () => baixarTodas(false));
downloadHDBtn.addEventListener('click', () => baixarTodas(true));

/* ------------------------------------------------------------------ *
 * Modal de comparação (slider antes/depois)
 * ------------------------------------------------------------------ */
const modal = $('modal');
const cmpAfter = $('cmpAfter');
const cmpBefore = $('cmpBefore');
const cmpBeforeWrap = $('cmpBeforeWrap');
const cmpHandle = $('cmpHandle');
const compare = $('compare');

function openCompare(item) {
  if (!item.resultUrl) return;
  cmpAfter.src = item.resultUrl;
  cmpBefore.src = item.originalUrl;
  modal.hidden = false;
  setSplit(0.5);
  // A largura real só existe depois do layout / do carregamento da imagem.
  cmpAfter.addEventListener('load', syncBeforeSize, { once: true });
  requestAnimationFrame(syncBeforeSize);
}

function setSplit(ratio) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  cmpBeforeWrap.style.width = pct + '%';
  cmpHandle.style.left = pct + '%';
  syncBeforeSize();
}

/** O "antes" precisa manter a largura total do container para não esticar dentro do recorte. */
function syncBeforeSize() {
  const w = compare.clientWidth;
  if (w > 0) {
    cmpBefore.style.width = w + 'px';
    cmpBefore.style.height = 'auto';
  }
}

let dragging = false;
const pointerRatio = (e) => {
  const r = compare.getBoundingClientRect();
  return (e.clientX - r.left) / r.width;
};

compare.addEventListener('pointerdown', (e) => {
  dragging = true;
  compare.setPointerCapture(e.pointerId);
  setSplit(pointerRatio(e));
});
compare.addEventListener('pointermove', (e) => { if (dragging) setSplit(pointerRatio(e)); });
compare.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('resize', () => {
  if (!modal.hidden) setSplit((parseFloat(cmpBeforeWrap.style.width) || 50) / 100);
});

$('modalClose').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.hidden = true; });

/* ------------------------------------------------------------------ *
 * Utils
 * ------------------------------------------------------------------ */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/* ------------------------------------------------------------------ *
 * Escolha do modelo
 * ------------------------------------------------------------------ */
if (modelSel) modelSel.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-model]');
  if (!b || b.disabled || b.dataset.model === modelKey) return;

  // Modelo reservado ao VIP: sem plano, abre a assinatura e nao troca.
  if (MODELS[b.dataset.model].vip && !temHD()) {
    abrirPaywall(null, null);
    return;
  }

  selecionarModelo(b.dataset.model);
  if (items.length) loadModel().catch(() => {});
});

function selecionarModelo(chave) {
  modelKey = chave;
  [...modelSel.children].forEach((x) => x.classList.toggle('is-active', x.dataset.model === chave));
  modelHint.textContent = MODELS[chave].descricao;
}

if (twoPassInput) twoPassInput.addEventListener('change', () => {
  // Recurso VIP: sem plano, o interruptor volta e a tela de assinatura aparece.
  if (twoPassInput.checked && !temHD()) {
    twoPassInput.checked = false;
    abrirPaywall(null, null);
    return;
  }
  twoPass = twoPassInput.checked;
  twoPassText.textContent = twoPass ? 'Ligada' : 'Desligada';
});

/** Mantem o interruptor coerente com o plano da conta. */
function refletirPlano() {
  if (!twoPassInput) return;
  const vip = temHD();

  twoPassInput.closest('.tool-group').classList.toggle('e-vip', !vip);
  if (!vip && twoPassInput.checked) {
    twoPassInput.checked = false;
    twoPass = false;
    twoPassText.textContent = 'Desligada';
  }

  // Perder o plano nao pode deixar um modelo VIP selecionado.
  for (const [chave, spec] of Object.entries(MODELS)) {
    const btn = modelSel && modelSel.querySelector('button[data-model="' + chave + '"]');
    if (btn) btn.classList.toggle('e-vip', !!spec.vip && !vip);
  }
  if (!vip && MODELS[modelKey].vip) selecionarModelo('padrao');

  refreshSliders();
}

Conta.aoMudar(refletirPlano);
document.addEventListener('vip-mudou', refletirPlano);
// Os eventos 'abrir-conta' e 'mostrar-vip' foram embora: cada módulo agora
// chama o outro direto. Eram ouvidos só aqui e em editar.js, o que fazia os
// mesmos botões não funcionarem na home.

if (modelHint) modelHint.textContent = MODELS[modelKey].descricao;

setEngine('', 'Modelo não carregado');
refreshSliders();
