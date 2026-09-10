/**
 * Página "Melhorar qualidade".
 *
 * A melhoria roda inteira no navegador — a imagem nunca sai daqui. O servidor
 * só entra para uma coisa: contar quantas vezes quem não é VIP usou hoje.
 */
import * as M from './melhorar.js';
import { baixar as baixarComPlano } from './paywall.js';
import * as Conta from './conta.js';
import './conta-ui.js';
import { refreshSliders } from './sliders.js';

const $ = (id) => document.getElementById(id);

const MAX_DIM = 3000;   // mesmo teto das outras páginas, por memória

let original = null;    // bitmap da imagem carregada
let atual = null;       // canvas com o resultado
let nomeArquivo = 'imagem';
let usouCota = false;   // a cota é gasta uma vez por imagem, não por ajuste

/* ------------------------------------------------------------------ *
 * Entrada
 * ------------------------------------------------------------------ */
$('escolher').addEventListener('click', () => $('file').click());
$('drop').addEventListener('click', (e) => {
  if (!e.target.closest('button')) $('file').click();
});
$('file').addEventListener('change', () => {
  if ($('file').files[0]) carregar($('file').files[0]);
  $('file').value = '';
});

['dragenter', 'dragover'].forEach((ev) =>
  $('drop').addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('dragging'); })
);
['dragleave', 'drop'].forEach((ev) =>
  $('drop').addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragleave' && $('drop').contains(e.relatedTarget)) return;
    $('drop').classList.remove('dragging');
  })
);
$('drop').addEventListener('drop', (e) => {
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) carregar(f);
});

window.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) carregar(f);
});

$('trocar').addEventListener('click', () => {
  $('resultado').hidden = true;
  $('drop').hidden = false;
  original = atual = null;
  usouCota = false;
});

async function carregar(file) {
  avisar('');

  // Decodifica respeitando a orientação EXIF, senão foto de celular entra girada.
  let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maior = Math.max(bitmap.width, bitmap.height);
  if (maior > MAX_DIM) {
    const k = MAX_DIM / maior;
    bitmap = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * k),
      resizeHeight: Math.round(bitmap.height * k),
      resizeQuality: 'high',
    });
  }

  original = bitmap;
  nomeArquivo = file.name.replace(/\.[^.]+$/, '');
  usouCota = false;

  $('drop').hidden = true;
  $('resultado').hidden = false;
  $('nome').textContent = file.name;

  // A imagem original é o "antes" da comparação, e não muda mais.
  const c = document.createElement('canvas');
  c.width = bitmap.width; c.height = bitmap.height;
  c.getContext('2d').drawImage(bitmap, 0, 0);
  $('imgAntes').src = c.toDataURL('image/png');

  prepararIA();
  await aplicar();
}

/* ------------------------------------------------------------------ *
 * Melhoria instantânea
 * ------------------------------------------------------------------ */
let pendente = null;

function aplicarDepois() {
  clearTimeout(pendente);
  pendente = setTimeout(aplicar, 160);
}

async function aplicar() {
  if (!original) return;

  // A cota é cobrada uma vez por imagem. Mexer no slider de nitidez depois não
  // pode gastar um uso novo — seria cobrar por arrependimento.
  if (!usouCota) {
    const liberado = await pedirCota();
    if (!liberado) return;
    usouCota = true;
  }

  atual = M.rapido(original, {
    niveis: $('niveis').checked,
    ruido: Number($('ruido').value) / 100,
    nitidez: Number($('nitidez').value),
  });

  mostrar(atual);
}

function mostrar(canvas) {
  $('imgDepois').src = canvas.toDataURL('image/png');
  $('medidas').textContent = canvas.width + ' × ' + canvas.height + ' px';
}

for (const id of ['nitidez', 'ruido']) {
  $(id).addEventListener('input', () => {
    $('v' + id[0].toUpperCase() + id.slice(1)).textContent = $(id).value;
    aplicarDepois();
  });
}
$('niveis').addEventListener('change', aplicarDepois);

/* ------------------------------------------------------------------ *
 * Cota diária
 * ------------------------------------------------------------------ */
async function pedirCota() {
  try {
    const cabecalhos = { 'Content-Type': 'application/json' };
    const token = Conta.tokenAcesso();
    if (token) cabecalhos.Authorization = 'Bearer ' + token;

    const r = await fetch('/api/uso', {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({ ferramenta: 'melhorar' }),
    });
    const d = await r.json().catch(() => ({}));

    // Servidor fora do ar ou rodando sem as funções (na sua máquina): não é
    // motivo para impedir alguém de usar o site.
    if (!r.ok || !d.ok) return true;

    if (d.permitido) {
      if (!d.ilimitado && !d.semContagem && d.limite) {
        avisar('Você usou ' + d.usados + ' de ' + d.limite + ' melhorias grátis de hoje.');
      }
      return true;
    }

    semCota(d.limite || 2);
    return false;
  } catch {
    return true;
  }
}

function semCota(limite) {
  $('resultado').hidden = true;
  $('drop').hidden = false;
  avisar('');

  import('./paywall.js').then((P) => P.abrirPaywall(null, null));
  alert(
    'Você já melhorou ' + limite + ' imagens hoje.\n\n' +
    'O VIP tira o limite — e o aviso na tela mostra os planos.'
  );
}

/* ------------------------------------------------------------------ *
 * Ampliação com IA
 * ------------------------------------------------------------------ */
function prepararIA() {
  const cabe = Math.max(original.width, original.height) <= M.TETO_IA;
  const botao = $('botaoIA');

  botao.disabled = !cabe;
  $('iaBarra').hidden = true;
  $('iaEstado').hidden = true;

  $('iaNota').textContent = cabe
    ? 'Dobra a resolução com IA. Leva cerca de ' + M.estimarSegundos(original.width, original.height)
      + ' s nesta imagem, e roda no seu computador.'
    : 'Só para imagens de até ' + M.TETO_IA + ' px de lado — acima disso a IA levaria minutos demais. '
      + 'Esta tem ' + Math.max(original.width, original.height) + ' px.';
}

$('botaoIA').addEventListener('click', async () => {
  if (!original) return;

  const botao = $('botaoIA');
  botao.disabled = true;
  $('iaBarra').hidden = false;
  $('iaEstado').hidden = false;

  try {
    const dobrado = await M.comIA(original, (fase, fracao) => {
      $('iaPreenche').style.width = Math.round(fracao * 100) + '%';
      $('iaEstado').textContent = fase === 'baixando'
        ? 'Baixando o modelo… ' + Math.round(fracao * 100) + '%'
        : 'Processando — pode demorar, não feche a aba.';
    });

    // Depois de dobrar, os ajustes finos entram por cima do resultado da IA.
    atual = M.rapido(dobrado, {
      niveis: $('niveis').checked,
      ruido: Number($('ruido').value) / 100,
      nitidez: Math.round(Number($('nitidez').value) * 0.6),   // a IA já entrega definido
    });
    mostrar(atual);

    $('iaEstado').textContent = 'Pronto: ' + atual.width + ' × ' + atual.height + ' px.';
    $('iaBarra').hidden = true;
  } catch (err) {
    $('iaEstado').textContent = err.message;
    $('iaBarra').hidden = true;
    botao.disabled = false;
  }
});

/* ------------------------------------------------------------------ *
 * Baixar
 * ------------------------------------------------------------------ */
$('baixar').addEventListener('click', () => {
  if (atual) baixarComPlano(atual, nomeArquivo + '-melhorada', { hd: false });
});
$('baixarHD').addEventListener('click', () => {
  if (atual) baixarComPlano(atual, nomeArquivo + '-melhorada', { hd: true });
});

function avisar(texto, tipo) {
  $('aviso').textContent = texto;
  $('aviso').className = 'hd-aviso' + (tipo ? ' ' + tipo : '');
}

/* ------------------------------------------------------------------ *
 * Comparação arrastável
 * ------------------------------------------------------------------ */
(function comparador() {
  const area = $('comparar');
  const caixa = $('antesCaixa');
  const alca = $('alca');
  let arrastando = false;

  function pos(clienteX) {
    const r = area.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clienteX - r.left) / r.width));
    caixa.style.width = p * 100 + '%';
    alca.style.left = p * 100 + '%';
  }

  area.addEventListener('pointerdown', (e) => {
    arrastando = true;
    area.setPointerCapture(e.pointerId);
    pos(e.clientX);
  });
  area.addEventListener('pointermove', (e) => { if (arrastando) pos(e.clientX); });
  area.addEventListener('pointerup', () => { arrastando = false; });
  area.addEventListener('pointercancel', () => { arrastando = false; });
})();

refreshSliders();
