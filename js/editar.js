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
import * as Conta from './conta.js';
import * as Rascunho from './rascunho.js';

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

  abrirItem(item);
}

function abrirItem(item) {
  root.classList.remove('is-empty');
  $('edRetomar').hidden = true;
  openEditor(item, {
    background: 'transparent',
    feather: 0,
    pageMode: true,
    onDownload: baixar,
    onClose: aoFechar,
    onMudou: guardarRascunho,
  });
}

function aoFechar() {
  mostrarVazio();
  oferecerRetomada();   // fechou sem querer? o trabalho continua guardado
}

/* ------------------------------------------------------------------ *
 * Continuar de onde parou
 * ------------------------------------------------------------------ *
 * Guardado no navegador de quem edita, nunca no servidor: o site promete em
 * três telas que as imagens não são enviadas para lugar nenhum, e essa
 * promessa vale mais do que a conveniência de o rascunho seguir a pessoa
 * entre aparelhos.
 */
function guardarRascunho(item) {
  const u = Conta.usuario();
  if (!u) return;                     // sem conta não há a quem amarrar o rascunho
  Rascunho.guardar(u.id, item);
}

let miniaturaUrl = null;

async function oferecerRetomada() {
  const convite = $('edRetomar');
  const u = Conta.usuario();

  if (!u) { convite.hidden = true; return; }

  const r = await Rascunho.resumo(u.id);
  if (!r) { convite.hidden = true; return; }

  $('edRetomarInfo').textContent =
    r.nome + ' · ' + r.largura + '×' + r.altura + ' · ' + faz(r.quando);

  // A miniatura precisa da imagem, então só é lida depois de haver rascunho.
  const cheio = await Rascunho.ler(u.id);
  if (cheio) {
    if (miniaturaUrl) URL.revokeObjectURL(miniaturaUrl);
    const c = document.createElement('canvas');
    const k = 64 / Math.max(cheio.bitmap.width, cheio.bitmap.height);
    c.width = Math.max(1, Math.round(cheio.bitmap.width * k));
    c.height = Math.max(1, Math.round(cheio.bitmap.height * k));
    c.getContext('2d').drawImage(cheio.bitmap, 0, 0, c.width, c.height);
    miniaturaUrl = c.toDataURL('image/png');
    $('edRetomarMiniatura').src = miniaturaUrl;
  }

  convite.hidden = false;
}

function faz(quando) {
  const min = Math.floor((Date.now() - quando) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'há ' + h + (h === 1 ? ' hora' : ' horas');
  const d = Math.floor(h / 24);
  return 'há ' + d + (d === 1 ? ' dia' : ' dias');
}

$('edRetomarAbrir').addEventListener('click', async () => {
  const u = Conta.usuario();
  if (!u) return;
  const r = await Rascunho.ler(u.id);
  if (!r) { $('edRetomar').hidden = true; return; }

  abrirItem({
    name: r.name,
    bitmap: r.bitmap,
    aiMask: r.maskCanvas,
    maskCanvas: cloneCanvas(r.maskCanvas),
    edit: { ...defaultEdit(), ...r.edit },
  });
});

$('edRetomarDescartar').addEventListener('click', async () => {
  const u = Conta.usuario();
  if (u) await Rascunho.apagar(u.id);
  $('edRetomar').hidden = true;
});

// Entrar na conta revela o rascunho daquela conta; sair esconde o dos outros.
Conta.aoMudar(() => { if (!empty.hidden) oferecerRetomada(); });

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */
function baixar(item, opcoes) {
  const canvas = compose(item, { background: 'transparent', feather: 0 });
  const nome = item.name.replace(/\.[^.]+$/, '') + '-editada';
  baixarComPlano(canvas, nome, opcoes);
}
