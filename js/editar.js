/**
 * Página de edição: aqui o editor É a página, não um diálogo sobre uma galeria.
 * A imagem entra pelo cartão no centro da mesa de trabalho e sai pelo botão de
 * baixar — sem passar por uma tela intermediária de upload.
 */
import { compose, cloneCanvas, defaultEdit } from './compose.js';
import { openEditor } from './editor.js';
import { baixar as baixarComPlano } from './paywall.js';
import './conta-ui.js';

// Os eventos 'abrir-conta' e 'mostrar-vip' foram embora: cada módulo agora
// chama o outro direto. Eram ouvidos só aqui e em editar.js, o que fazia os
// mesmos botões não funcionarem na home.
import { refreshSliders } from './sliders.js';

const $ = (id) => document.getElementById(id);

const root = $('editor');
const empty = $('edEmpty');
const card = $('edEmptyCard');
const pick = $('edPick');
const fileInput = $('edFile');

const MAX_DIM = 3000;   // mesmo limite da outra página, por memória

/* ------------------------------------------------------------------ *
 * Estado vazio
 * ------------------------------------------------------------------ */
function mostrarVazio() {
  root.hidden = false;
  empty.hidden = false;
  root.classList.add('is-empty');
}

mostrarVazio();
$('edHome').hidden = false;   // o atalho para o início vale também sem imagem
refreshSliders();

pick.addEventListener('click', () => fileInput.click());
card.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) carregar(fileInput.files[0]);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((ev) =>
  empty.addEventListener(ev, (e) => { e.preventDefault(); empty.classList.add('dragging'); })
);
['dragleave', 'drop'].forEach((ev) =>
  empty.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragleave' && empty.contains(e.relatedTarget)) return;
    empty.classList.remove('dragging');
  })
);
empty.addEventListener('drop', (e) => {
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) carregar(f);
});

// Colar funciona a qualquer momento — inclusive para trocar a imagem aberta.
window.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) carregar(f);
});

/* ------------------------------------------------------------------ *
 * Carregar e abrir
 * ------------------------------------------------------------------ */
async function carregar(file) {
  // Decodifica respeitando a orientação EXIF, senão fotos de celular entram giradas.
  let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maior = Math.max(bitmap.width, bitmap.height);
  if (maior > MAX_DIM) {
    const escala = MAX_DIM / maior;
    bitmap = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * escala),
      resizeHeight: Math.round(bitmap.height * escala),
      resizeQuality: 'high',
    });
  }

  // A máscara nasce opaca: a imagem inteira aparece, e o pincel é uma borracha.
  const mask = document.createElement('canvas');
  mask.width = bitmap.width;
  mask.height = bitmap.height;
  const mctx = mask.getContext('2d');
  mctx.fillStyle = '#fff';
  mctx.fillRect(0, 0, mask.width, mask.height);

  const item = {
    name: file.name,
    bitmap,
    aiMask: mask,
    maskCanvas: cloneCanvas(mask),
    edit: defaultEdit(),
  };

  root.classList.remove('is-empty');
  openEditor(item, {
    background: 'transparent',
    feather: 0,
    pageMode: true,
    onDownload: baixar,
    onClose: mostrarVazio,
  });
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */
function baixar(item, opcoes) {
  const canvas = compose(item, { background: 'transparent', feather: 0 });
  const nome = item.name.replace(/\.[^.]+$/, '') + '-editada';
  baixarComPlano(canvas, nome, opcoes);
}
