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
import { MAX_DIM, AREA_MAX_CANVAS, ehIOS, ehCelular } from './limites.js';

const $ = (id) => document.getElementById(id);

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
  trocarImagem('antes', c);

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

/**
 * Endereços temporários das duas imagens da comparação.
 *
 * Antes isto era `toDataURL`, e era o que matava a aba no iPhone: o data URL
 * é a imagem inteira virada TEXTO dentro da memória do JavaScript — numa foto
 * de 3000px são dezenas de megabytes — e `mostrar()` roda a cada movimento de
 * slider. Com blob o navegador guarda os bytes fora do heap e ainda evita a
 * codificação em base64, que é pura perda.
 *
 * Cada endereço precisa ser devolvido quando troca, senão o vazamento só muda
 * de lugar: eles ficam vivos até a aba fechar.
 */
const enderecos = { antes: null, depois: null };

function trocarImagem(qual, canvas) {
  const alvo = qual === 'antes' ? $('imgAntes') : $('imgDepois');
  canvas.toBlob((blob) => {
    if (!blob) return;
    const novo = URL.createObjectURL(blob);
    if (enderecos[qual]) URL.revokeObjectURL(enderecos[qual]);
    enderecos[qual] = novo;
    alvo.src = novo;
  }, 'image/png');
}

function mostrar(canvas) {
  trocarImagem('depois', canvas);
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

  // Um canvas grande demais não dá erro no Safari do iOS: ele devolve a tela
  // em branco. Recusar com explicação é melhor do que a pessoa esperar
  // minutos para receber uma imagem vazia.
  const areaDobrada = original.width * 2 * original.height * 2;
  if (areaDobrada > AREA_MAX_CANVAS) {
    $('botaoIA').disabled = true;
    $('botaoIA').textContent = 'Dobrar com IA';
    $('iaBarra').hidden = true;
    $('iaEstado').hidden = true;
    nota.className = 'mq-nota mq-demora';
    nota.textContent =
      'Esta imagem é grande demais para dobrar neste aparelho'
      + (ehIOS ? ' — o iPhone e o iPad têm um limite de tamanho de imagem' : '')
      + '. Use uma foto menor, ou abra o site no computador.';
    return;
  }

  $('botaoIA').disabled = false;
  $('botaoIA').textContent = 'Dobrar com IA · ' + M.tempoEscrito(segundos);
  $('iaBarra').hidden = true;
  $('iaEstado').hidden = true;

  nota.textContent =
    'Vai de ' + original.width + '×' + original.height + ' para '
    + (original.width * 2) + '×' + (original.height * 2) + '. '
    + 'Nesta imagem leva ' + M.tempoEscrito(segundos)
    + (ehCelular ? ', rodando no SEU aparelho — ' : ', rodando no SEU computador — ')
    // No celular não basta deixar a aba aberta: trocar de aplicativo congela a
    // página, e no iPhone o sistema chega a descartar a aba inteira.
    + (ehCelular
      ? 'mantenha a tela ligada e não troque de aplicativo.'
      : 'a aba precisa ficar aberta.');

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
let motivoParada = null;   // por que parou, quando não foi a pessoa que cancelou

/**
 * Teto de espera no celular, em segundos.
 *
 * Oito minutos não é um número de conforto: é quanto o aparelho aguenta. Com a
 * tela acesa e o processador no talo o celular esquenta, o sistema reduz a
 * velocidade e, no iPhone, acaba descartando a aba — a página recarrega
 * sozinha e o trabalho todo se perde sem explicação nenhuma.
 */
const LIMITE_CELULAR = 8 * 60;

/**
 * Impede a tela de apagar enquanto a IA trabalha.
 *
 * É a causa mais provável de a conta nunca terminar no celular: a tela apaga,
 * o sistema congela a aba e, no iPhone, chega a descartá-la. Devolve sempre uma
 * função de soltar, mesmo quando o navegador não tem o recurso, para quem chama
 * não precisar verificar nada.
 */
async function segurarTela() {
  if (!('wakeLock' in navigator)) return () => {};
  try {
    const trava = await navigator.wakeLock.request('screen');
    return () => { try { trava.release(); } catch { /* já solta */ } };
  } catch {
    return () => {};
  }
}

/**
 * Sair da aba no meio congela a conta. Parar com explicação é melhor do que
 * a pessoa voltar minutos depois e encontrar uma barra de progresso parada
 * sem saber se ainda está viva.
 */
function pararSeSumir() {
  // Só no celular. No computador trocar de aba não interrompe nada — o Worker
  // continua trabalhando — e cancelar ali jogaria fora minutos de conta por
  // causa de um perigo que não existe naquela máquina.
  if (!ehCelular || !document.hidden) return;
  motivoParada = 'você saiu da aba, e o celular congela a conta quando isso '
    + 'acontece. Toque de novo para recomeçar, sem trocar de aplicativo.';
  cancelar = true;
}

$('botaoIA').addEventListener('click', async () => {
  if (!original) return;

  const botao = $('botaoIA');
  const segundos = M.estimarSegundos(original.width, original.height, motor);

  // Espera longa merece confirmação. Começar sem avisar e a pessoa descobrir
  // dez minutos depois é o pior desfecho possível aqui.
  if (segundos > 120 && !(await confirmarDemora(segundos))) return;

  cancelar = false;
  motivoParada = null;
  botao.disabled = true;
  $('cancelarIA').hidden = false;
  $('iaBarra').hidden = false;
  $('iaEstado').hidden = false;

  const comecou = Date.now();
  const solta = await segurarTela();
  document.addEventListener('visibilitychange', pararSeSumir);

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
      const porPedaco = decorrido / info.feitos;
      const faltam = Math.round(porPedaco * (info.total - info.feitos));

      // Freio de mão do celular. O número teórico vem de um computador; o ritmo
      // real do aparelho só aparece no primeiro pedaço. Se a projeção passar do
      // limite, parar agora é melhor do que deixar a pessoa esperar dez minutos
      // de tela acesa para o sistema matar a aba no fim — que foi exatamente o
      // que aconteceu no iPhone.
      if (ehCelular && info.feitos === 1 && porPedaco * info.total > LIMITE_CELULAR) {
        motivoParada = 'longo demais para este aparelho: seriam '
          + M.tempoEscrito(Math.round(porPedaco * info.total))
          + ' de tela acesa, e o celular desiste antes disso. '
          + 'Funciona com uma foto menor, ou no computador.';
        cancelar = true;
        return;
      }

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
    $('iaEstado').textContent = err.message !== 'cancelado'
      ? err.message
      : motivoParada
        ? 'Parado: ' + motivoParada
        : 'Cancelado. A imagem continua como estava.';
    $('iaBarra').hidden = true;
    $('cancelarIA').hidden = true;
    botao.disabled = false;
  } finally {
    document.removeEventListener('visibilitychange', pararSeSumir);
    solta();
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
