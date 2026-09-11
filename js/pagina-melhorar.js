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

/**
 * Placa de vídeo ou processador. Começa no processador porque é a resposta
 * pessimista: prometer um tempo e estourar é pior do que prometer e entregar
 * antes. Quando a resposta real chega, o aviso na tela se refaz sozinho.
 */
let motor = 'wasm';
M.dispositivoProvavel().then((d) => {
  motor = d;
  if (original) prepararIA();
});

/* ------------------------------------------------------------------ *
 * Entrada
 * ------------------------------------------------------------------ */
$('drop').addEventListener('click', () => $('file').click());
$('drop').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
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
    vibracao: M.PERFIS[perfil].opcoes.vibracao,
    equilibrio: $('equilibrio').checked && temVip() ? 1 : 0,
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
 * Perfis por tipo de foto
 * ------------------------------------------------------------------ */
let perfil = 'auto';

(function montarPerfis() {
  const caixa = $('perfis');
  for (const [id, p] of Object.entries(M.PERFIS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mq-perfil' + (id === perfil ? ' is-active' : '');
    b.dataset.perfil = id;
    b.textContent = p.nome;
    caixa.append(b);
  }
  $('perfilDica').textContent = M.PERFIS[perfil].dica;

  caixa.addEventListener('click', (e) => {
    const b = e.target.closest('[data-perfil]');
    if (!b) return;
    perfil = b.dataset.perfil;
    for (const outro of caixa.children) outro.classList.toggle('is-active', outro === b);

    // O perfil move os sliders, não os substitui: quem quiser conferir ou
    // ajustar depois vê exatamente onde cada um parou.
    const o = M.PERFIS[perfil].opcoes;
    $('nitidez').value = o.nitidez;  $('vNitidez').textContent = o.nitidez;
    $('ruido').value = Math.round(o.ruido * 100); $('vRuido').textContent = $('ruido').value;
    $('niveis').checked = o.niveis;
    $('perfilDica').textContent = M.PERFIS[perfil].dica;
    refreshSliders();
    aplicarDepois();
  });
})();

/* ------------------------------------------------------------------ *
 * Equilíbrio de cor — VIP
 * ------------------------------------------------------------------ */
$('equilibrio').addEventListener('change', () => {
  if ($('equilibrio').checked && !temVip()) {
    // Desmarca e explica, em vez de deixar um controle morto na tela.
    $('equilibrio').checked = false;
    import('./paywall.js').then((P) => P.abrirPaywall(null, null));
    return;
  }
  aplicarDepois();
});

function temVip() {
  return Conta.ehVip();
}

// Perder o plano desliga o recurso em vez de deixá-lo de graça.
Conta.aoMudar(() => {
  if (!temVip() && $('equilibrio').checked) {
    $('equilibrio').checked = false;
    aplicarDepois();
  }
});

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
  const segundos = M.estimarSegundos(original.width, original.height, motor);
  const nota = $('iaNota');

  $('botaoIA').disabled = false;
  $('botaoIA').textContent = 'Dobrar com IA · ' + M.tempoEscrito(segundos);
  $('iaBarra').hidden = true;
  $('iaEstado').hidden = true;

  nota.textContent =
    'Vai de ' + original.width + '×' + original.height + ' para '
    + (original.width * 2) + '×' + (original.height * 2) + '. '
    + 'Nesta imagem leva ' + M.tempoEscrito(segundos) + ', rodando no SEU computador — '
    + 'a aba precisa ficar aberta.';

  // Acima de dois minutos o aviso deixa de ser informação e passa a ser
  // decisão: quem não souber quanto tempo vai esperar, desiste no meio.
  nota.className = segundos > 120 ? 'mq-nota mq-demora' : 'mq-nota';
}

/**
 * Confirmação de espera longa, na cara do site.
 *
 * Era um `confirm()` do navegador — aquela caixa cinza colada na barra de
 * endereço, com a cara do sistema operacional. Para uma decisão de "esperar
 * sete minutos ou não", ela some rápido demais e explica de menos.
 */
function confirmarDemora(segundos) {
  const modal = $('modalDemora');

  $('dmTempo').textContent = M.tempoEscrito(segundos);
  $('dmMedidas').textContent =
    original.width + '×' + original.height + ' vira '
    + (original.width * 2) + '×' + (original.height * 2) + ' pixels.';
  modal.hidden = false;

  return new Promise((resolver) => {
    function fechar(resposta) {
      modal.hidden = true;
      $('dmComecar').removeEventListener('click', sim);
      $('dmCancelar').removeEventListener('click', nao);
      modal.removeEventListener('click', fora);
      document.removeEventListener('keydown', tecla);
      resolver(resposta);
    }
    const sim = () => fechar(true);
    const nao = () => fechar(false);
    const fora = (e) => { if (e.target === modal) fechar(false); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(false); };

    $('dmComecar').addEventListener('click', sim);
    $('dmCancelar').addEventListener('click', nao);
    modal.addEventListener('click', fora);
    document.addEventListener('keydown', tecla);
    $('dmComecar').focus();
  });
}

let cancelar = false;

$('botaoIA').addEventListener('click', async () => {
  if (!original) return;

  const botao = $('botaoIA');
  const segundos = M.estimarSegundos(original.width, original.height, motor);

  // Espera longa merece confirmação. Começar sem avisar e a pessoa descobrir
  // dez minutos depois é o pior desfecho possível aqui.
  if (segundos > 120 && !(await confirmarDemora(segundos))) return;

  cancelar = false;
  botao.disabled = true;
  $('cancelarIA').hidden = false;
  $('iaBarra').hidden = false;
  $('iaEstado').hidden = false;

  const comecou = Date.now();

  try {
    const dobrado = await M.comIA(original, (fase, fracao, info) => {
      // O motor que realmente pegou pode não ser o previsto — GPU reconhecida
      // que recusa o modelo cai no processador. Guarda o verdadeiro para as
      // próximas estimativas desta sessão não repetirem a conta errada.
      if (fase === 'motor') {
        if (info && info.dispositivo) motor = info.dispositivo;
        return;
      }

      $('iaPreenche').style.width = Math.round(fracao * 100) + '%';

      if (fase === 'baixando') {
        $('iaEstado').textContent = 'Baixando o modelo… ' + Math.round(fracao * 100) + '%';
        return;
      }
      if (!info || !info.feitos) {
        $('iaEstado').textContent = 'Preparando…';
        return;
      }

      // Estimativa que se corrige sozinha: depois do primeiro pedaço já dá para
      // medir o ritmo desta máquina em vez de repetir o número teórico.
      const decorrido = (Date.now() - comecou) / 1000;
      const faltam = Math.round(decorrido / info.feitos * (info.total - info.feitos));
      $('iaEstado').textContent =
        'Pedaço ' + info.feitos + ' de ' + info.total
        + ' · faltam ' + M.tempoEscrito(faltam);
    }, () => cancelar);

    // Depois de dobrar, os ajustes finos entram por cima do resultado da IA.
    atual = M.rapido(dobrado, {
      niveis: $('niveis').checked,
      ruido: Number($('ruido').value) / 100,
      nitidez: Math.round(Number($('nitidez').value) * 0.6),   // a IA já entrega definido
    });
    mostrar(atual);

    $('iaEstado').textContent = 'Pronto: ' + atual.width + ' × ' + atual.height + ' px.';
    $('iaBarra').hidden = true;
    $('cancelarIA').hidden = true;
  } catch (err) {
    $('iaEstado').textContent = err.message === 'cancelado'
      ? 'Cancelado. A imagem continua como estava.'
      : err.message;
    $('iaBarra').hidden = true;
    $('cancelarIA').hidden = true;
    botao.disabled = false;
  }
});

$('cancelarIA').addEventListener('click', () => {
  cancelar = true;
  $('iaEstado').textContent = 'Cancelando no fim deste pedaço…';
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
