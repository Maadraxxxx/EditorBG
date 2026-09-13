/**
 * Foto 3×4 e outros formatos de documento.
 *
 * O que esta página resolve não é recortar uma imagem — é acertar a MEDIDA.
 * Uma foto de documento é recusada por enquadramento: cabeça grande demais,
 * pequena demais, ou a foto impressa num tamanho que não é o pedido. Por isso
 * aqui tudo é calculado em milímetros e só convertido para pixel no fim, a
 * 300 DPI, e o arquivo PNG sai com essa resolução gravada dentro dele.
 *
 * O recorte do fundo roda num Web Worker. Carregar o modelo e rodar a
 * inferência congelam a thread principal, e o pior sintoma é que nem a barra de
 * progresso se redesenha — de fora parece que travou de vez.
 */
import { MAX_DIM, ehCelular } from './limites.js';
import './conta-ui.js';
import { refreshSliders } from './sliders.js';

const $ = (id) => document.getElementById(id);

// O paywall injeta o próprio markup e baixa o Mercado Pago: entra por import
// dinâmico para não segurar a página por uma tela que a maioria nunca abre.
let Paywall = null;
const paywallPronto = import('./paywall.js').then((m) => { Paywall = m; return m; });
const ehVip = () => !!(Paywall && Paywall.temHD());

/**
 * O VIP daqui só acrescenta.
 *
 * Desligado, a página continua inteira: os quatro formatos, o fundo branco
 * automático, o enquadramento sugerido, as guias, a foto avulsa a 300 DPI e a
 * folha 10 × 15 com nove fotos. A medida livre e a folha A4 são capacidades a
 * mais, e o selo aparece antes do clique.
 */
async function exigirVip(motivo) {
  if (ehVip()) return true;
  (await paywallPronto).abrirPaywall(null, null, motivo);
  return false;
}

/** Tudo é medido em milímetro e só vira pixel no fim. */
const DPI = 300;
const mmPx = (mm) => Math.round((mm / 25.4) * DPI);

/**
 * Os formatos, com a altura da cabeça que cada um espera.
 *
 * "cabeca" é a fração da altura da foto que vai do queixo ao alto da cabeça —
 * é ela que as repartições conferem, não a largura do rosto. Os números dos
 * vistos vêm da faixa publicada em cada exigência e ficam no meio dela, que é
 * onde sobra margem para os dois lados:
 *
 * - Visto americano: cabeça entre 25 mm e 35 mm numa foto de 51 mm → 0,60 põe
 *   a cabeça em ~30 mm, no meio da faixa.
 * - Schengen: cabeça entre 32 mm e 36 mm numa foto de 45 mm → 0,755 dá 34 mm.
 *
 * O 3×4 brasileiro não tem faixa publicada; 0,72 é a proporção do que as
 * máquinas de foto de documento entregam.
 */
const FORMATOS = {
  '3x4': {
    nome: '3 × 4 cm',
    detalhe: 'RG, CNH, carteira de trabalho, crachá, concursos',
    mmL: 30, mmA: 40, cabeca: 0.72,
  },
  '5x7': {
    nome: '5 × 7 cm',
    detalhe: 'passaporte brasileiro e documentos que pedem foto maior',
    mmL: 50, mmA: 70, cabeca: 0.70,
  },
  eua: {
    nome: 'Visto americano',
    detalhe: '2 × 2 polegadas · cabeça entre 25 e 35 mm',
    mmL: 50.8, mmA: 50.8, cabeca: 0.60,
  },
  schengen: {
    nome: 'Visto Schengen',
    detalhe: '3,5 × 4,5 cm · cabeça entre 32 e 36 mm',
    mmL: 35, mmA: 45, cabeca: 0.755,
  },
  // Os números deste saem dos campos da tela. Existe porque exigência de
  // documento muda por país e por ano: em vez de eu adivinhar a medida de
  // cada consulado — e errar, que numa foto de visto significa recusa —, quem
  // lê a exigência digita o que ela diz.
  livre: {
    nome: 'Medida livre',
    detalhe: 'o tamanho que a exigência pedir',
    mmL: 30, mmA: 40, cabeca: 0.72,
  },
};

/** As folhas de impressão. A 10 × 15 é grátis; a A4 é VIP. */
const FOLHAS = {
  '10x15': {
    nome: '10 × 15 cm', mmL: 100, mmA: 150, vip: false,
    detalhe: 'A que qualquer farmácia ou laboratório revela por poucos reais.',
  },
  a4: {
    nome: 'A4', mmL: 210, mmA: 297, vip: true,
    detalhe: 'Cabe muito mais foto na mesma folha — para quem imprime em casa '
      + 'ou manda imprimir em papel comum.',
  },
};


/** Quanto de céu fica acima da cabeça, em fração da altura da foto. */
const MARGEM_TOPO = 0.09;

let original = null;      // ImageBitmap da foto como veio
let recortado = null;     // canvas da pessoa sem fundo (ou null)
let silhueta = null;      // { topo, pescoco, centroX } em pixel da foto
let formato = '3x4';
let folha = '10x15';
let fundo = '#ffffff';
let semFundo = true;
let guias = true;

/** O recorte em coordenadas da foto: centro e escala. */
let quadro = { cx: 0, cy: 0, escala: 1 };

const fotoCanvas = document.createElement('canvas');   // só a foto, é o que baixa
let travado = false;

/* ------------------------------------------------------------------ *
 * Worker
 * ------------------------------------------------------------------ */
let worker = null;
let carregando = null;
const pedidos = new Map();
let proximoId = 1;

function ligar() {
  if (worker) return worker;
  worker = new Worker(new URL('./foto-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.tipo === 'baixando') {
      avisar('Baixando o modelo… ' + Math.round(m.fracao * 100) + '%');
      return;
    }
    if (m.tipo === 'andamento') { avisar(m.texto); return; }
    if (m.tipo === 'carregado') { carregando?.ok(m); carregando = null; return; }
    const p = pedidos.get(m.id);
    if (!p) return;
    pedidos.delete(m.id);
    if (m.tipo === 'erro') p.falha(new Error(m.mensagem));
    else p.ok(m);
  };
  worker.onerror = (e) => {
    const erro = new Error(e.message || 'O recorte falhou.');
    carregando?.falha(erro); carregando = null;
    for (const p of pedidos.values()) p.falha(erro);
    pedidos.clear();
  };
  return worker;
}

function carregarModelo() {
  return new Promise((ok, falha) => {
    carregando = { ok, falha };
    ligar().postMessage({ tipo: 'carregar', modelo: 'padrao' });
  });
}

function pedirRecorte(bitmap) {
  const id = proximoId++;
  return new Promise((ok, falha) => {
    pedidos.set(id, { ok, falha });
    ligar().postMessage({ tipo: 'recortar', id, bitmap });
  });
}

/* ------------------------------------------------------------------ *
 * Entrada
 * ------------------------------------------------------------------ */
$('drop').addEventListener('click', () => $('file').click());
$('drop').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
});
$('file').addEventListener('change', () => {
  if ($('file').files[0]) receber($('file').files[0]);
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
  if (f) receber(f);
});
window.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) receber(f);
});

async function receber(arquivo) {
  avisar('');
  try {
    // imageOrientation: sem isto, foto de celular entra deitada e a pessoa
    // acha que a ferramenta quebrou.
    original = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    avisar('Não consegui abrir esta imagem.', true);
    return;
  }

  // Reduzir antes do modelo: o resultado final tem 354 px de largura num 3×4,
  // então guardar 4000 px de origem só gasta memória e tempo — e em celular é
  // a diferença entre funcionar e a aba morrer.
  original = await reduzir(original, MAX_DIM);

  $('drop').hidden = true;
  $('trabalho').hidden = false;
  recortado = null;
  silhueta = null;

  await prepararFundo();
  enquadrarAutomatico();
  desenhar();
}

async function reduzir(bitmap, teto) {
  const maior = Math.max(bitmap.width, bitmap.height);
  if (maior <= teto) return bitmap;
  const k = teto / maior;
  return createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * k),
    resizeHeight: Math.round(bitmap.height * k),
    resizeQuality: 'high',
  });
}

/* ------------------------------------------------------------------ *
 * Recorte do fundo
 * ------------------------------------------------------------------ */
async function prepararFundo() {
  if (!semFundo || !original) { recortado = null; return; }
  if (recortado) return;

  travar(true);
  try {
    avisar('Preparando o modelo…');
    await carregarModelo();

    // O bitmap é transferido, então precisa de uma cópia: o original continua
    // sendo usado aqui para redesenhar sempre que alguém mexe no enquadramento.
    const copia = await createImageBitmap(original);
    const r = await pedirRecorte(copia);

    const cv = document.createElement('canvas');
    cv.width = original.width;
    cv.height = original.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(original, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(r.mascara, 0, 0, cv.width, cv.height);
    recortado = cv;

    silhueta = medirSilhueta(cv);
    avisar('');
  } catch (erro) {
    // Sem o modelo a ferramenta ainda serve: a pessoa fotografa contra uma
    // parede branca e usa o enquadramento manual. Recusar tudo seria pior.
    recortado = null;
    semFundo = false;
    $('semFundo').checked = false;
    avisar('Não consegui remover o fundo (' + erro.message + '). '
      + 'Dá para continuar usando a foto como ela é — fotografe contra uma parede clara.', true);
  } finally {
    travar(false);
  }
}

/**
 * Onde estão o alto da cabeça e o pescoço, lendo só a silhueta.
 *
 * A largura da silhueta linha a linha conta a história: ela cresce no crânio,
 * chega ao máximo na altura das orelhas, ESTREITA no pescoço e volta a crescer
 * de vez nos ombros. O fundo do vale entre a cabeça e os ombros é o pescoço, e
 * o queixo fica praticamente nessa altura, porque na silhueta o maxilar já se
 * funde ao pescoço.
 *
 * Isto é uma estimativa, não uma medição de rosto: cabelo comprido, gorro ou
 * cachecol enganam o vale. Por isso o resultado é só o PONTO DE PARTIDA, e o
 * enquadramento continua ajustável na mão, com as guias à vista.
 */
function medirSilhueta(cv) {
  const w = cv.width;
  const h = cv.height;
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

  const larguras = new Int32Array(h);
  const somaX = new Float64Array(h);
  let topo = -1;
  for (let y = 0; y < h; y++) {
    let n = 0;
    let sx = 0;
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 128) { n++; sx += x; }
    }
    larguras[y] = n;
    somaX[y] = n ? sx / n : 0;
    if (topo < 0 && n > w * 0.01) topo = y;
  }
  if (topo < 0) return null;

  // Desce procurando o vale: passa o ponto mais largo da cabeça e para quando
  // a largura volta a crescer de verdade.
  let maiorCabeca = 0;
  let pescoco = -1;
  let minimo = Infinity;
  for (let y = topo; y < h; y++) {
    const l = larguras[y];
    if (l > maiorCabeca) maiorCabeca = l;

    // Só procura o vale depois que já estreitou bem abaixo do máximo: senão o
    // topo arredondado do crânio, que é estreito, viraria "pescoço".
    if (maiorCabeca > 0 && l < maiorCabeca * 0.82) {
      if (l < minimo) { minimo = l; pescoco = y; }
      // Voltou a alargar 25% acima do fundo do vale: são os ombros, e o
      // pescoço já ficou para trás.
      else if (l > minimo * 1.25 && pescoco > 0) break;
    }
  }

  // Sem vale reconhecível (foto só do rosto, cabelo cobrindo tudo) não há
  // chute honesto a dar: a página mostra as guias e a pessoa ajusta.
  if (pescoco < 0 || pescoco <= topo) return null;

  let centro = 0;
  let peso = 0;
  for (let y = topo; y <= pescoco; y++) { centro += somaX[y] * larguras[y]; peso += larguras[y]; }

  return { topo, pescoco, centroX: peso ? centro / peso : w / 2 };
}

function enquadrarAutomatico() {
  if (!original) return;
  const f = FORMATOS[formato];
  const alvoA = mmPx(f.mmA);
  const alvoL = mmPx(f.mmL);

  if (silhueta) {
    const alturaCabeca = silhueta.pescoco - silhueta.topo;
    const escala = (f.cabeca * alvoA) / alturaCabeca;
    const alturaRecorte = alvoA / escala;
    quadro = {
      escala,
      cx: silhueta.centroX,
      cy: silhueta.topo - (MARGEM_TOPO * alvoA) / escala + alturaRecorte / 2,
    };
  } else {
    // Sem silhueta, o melhor palpite é preencher o quadro pela dimensão que
    // sobra menos — qualquer chute sobre onde está o rosto seria pior que
    // deixar a pessoa arrastar.
    const escala = Math.max(alvoL / original.width, alvoA / original.height);
    quadro = { escala, cx: original.width / 2, cy: original.height / 2 };
  }
  const pedida = quadro.escala;
  limitarQuadro();
  $('zoom').value = String(Math.round(quadro.escala * 100));

  /*
   * A foto pode não ter margem para o enquadramento pedido.
   *
   * Para deixar a cabeça pequena dentro do quadro é preciso afastar, e afastar
   * exige imagem em volta que talvez não exista — um retrato já cortado no
   * ombro não tem de onde tirar. O limite corrige a escala sozinho, e sem
   * aviso o resultado sairia com a cabeça maior que a pedida sem ninguém
   * perceber. Numa foto de visto é exatamente isso que faz ser recusada, então
   * a diferença precisa ser dita.
   */
  if (silhueta && quadro.escala > pedida * 1.02) {
    const virou = ((silhueta.pescoco - silhueta.topo) * quadro.escala) / mmPx(f.mmA);
    avisar('Esta foto não tem margem para deixar a cabeça em '
      + Math.round(f.cabeca * 100) + '%: ficou em ' + Math.round(virou * 100)
      + '%. Use uma foto com mais espaço em volta da pessoa.', true);
  } else if ($('aviso').textContent.startsWith('Esta foto não tem margem')) {
    avisar('');
  }
}

/** O recorte não pode sair da foto: fora dela só há vazio. */
function limitarQuadro() {
  if (!original) return;
  const f = FORMATOS[formato];
  const larguraRec = mmPx(f.mmL) / quadro.escala;
  const alturaRec = mmPx(f.mmA) / quadro.escala;

  if (larguraRec > original.width || alturaRec > original.height) {
    quadro.escala = Math.max(mmPx(f.mmL) / original.width, mmPx(f.mmA) / original.height);
    return limitarQuadro();
  }
  quadro.cx = Math.min(original.width - larguraRec / 2, Math.max(larguraRec / 2, quadro.cx));
  quadro.cy = Math.min(original.height - alturaRec / 2, Math.max(alturaRec / 2, quadro.cy));
}

/* ------------------------------------------------------------------ *
 * Desenho
 * ------------------------------------------------------------------ */
function desenhar() {
  if (!original) return;
  const f = FORMATOS[formato];
  const alvoL = mmPx(f.mmL);
  const alvoA = mmPx(f.mmA);

  fotoCanvas.width = alvoL;
  fotoCanvas.height = alvoA;
  const ctx = fotoCanvas.getContext('2d');

  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, alvoL, alvoA);

  const larguraRec = alvoL / quadro.escala;
  const alturaRec = alvoA / quadro.escala;
  const fonte = recortado || original;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    fonte,
    quadro.cx - larguraRec / 2, quadro.cy - alturaRec / 2, larguraRec, alturaRec,
    0, 0, alvoL, alvoA
  );

  // As guias vão só na prévia. Desenhá-las no fotoCanvas as mandaria junto
  // para dentro do arquivo baixado, e ninguém quer linhas azuis no RG.
  const p = $('previa');
  p.width = alvoL;
  p.height = alvoA;
  const pctx = p.getContext('2d');
  pctx.drawImage(fotoCanvas, 0, 0);
  if (guias) desenharGuias(pctx, alvoL, alvoA, f);

  $('medidas').textContent = f.nome + ' · ' + alvoL + ' × ' + alvoA + ' px a ' + DPI + ' DPI';
  atualizarFolha();
}

function desenharGuias(ctx, L, A, f) {
  const alto = MARGEM_TOPO * A;
  const queixo = alto + f.cabeca * A;

  ctx.save();
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.85)';
  ctx.lineWidth = Math.max(1, Math.round(L / 180));
  ctx.setLineDash([ctx.lineWidth * 4, ctx.lineWidth * 3]);

  for (const y of [alto, queixo]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L, y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2, A); ctx.stroke();

  // A faixa fora das guias escurece: o olho entende "a cabeça vai no claro"
  // muito mais rápido do que leria uma instrução escrita.
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(11, 16, 32, 0.16)';
  ctx.fillRect(0, 0, L, alto);
  ctx.fillRect(0, queixo, L, A - queixo);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Arrastar e aproximar
 * ------------------------------------------------------------------ */
/**
 * Um dedo arrasta, dois dedos aproximam.
 *
 * No celular não existe roda do mouse, e `touch-action: none` — que é o que
 * impede a página inteira de rolar enquanto se arrasta a foto — também desliga
 * o pinçar do navegador. Sem tratar os dois dedos aqui, quem estivesse no
 * telefone conseguiria mover a foto e nunca aproximá-la.
 */
const dedos = new Map();
let arrastando = null;
let pincando = null;

const distancia = () => {
  const [a, b] = [...dedos.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};

$('previa').addEventListener('pointerdown', (e) => {
  if (!original || travado) return;
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // A captura só serve para continuar recebendo o movimento quando o dedo sai
  // de cima da foto. Ela pode ser recusada, e quando era a primeira linha daqui
  // a recusa derrubava o gesto inteiro — o dedo deslizava e nada acontecia.
  // Registrar o dedo primeiro e engolir a recusa deixa o arraste funcionar de
  // qualquer jeito, só sem a comodidade de poder sair da borda.
  try { $('previa').setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }

  if (dedos.size === 2) {
    pincando = { inicial: distancia(), escala: quadro.escala };
    arrastando = null;
  } else if (dedos.size === 1) {
    arrastando = { x: e.clientX, y: e.clientY, cx: quadro.cx, cy: quadro.cy };
  }
});

$('previa').addEventListener('pointermove', (e) => {
  if (!dedos.has(e.pointerId)) return;
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pincando && dedos.size === 2) {
    const agora = distancia();
    if (pincando.inicial > 0) {
      quadro.escala = pincando.escala * (agora / pincando.inicial);
      limitarQuadro();
      $('zoom').value = String(Math.round(quadro.escala * 100));
      desenhar();
    }
    return;
  }

  if (!arrastando) return;
  const r = $('previa').getBoundingClientRect();
  // O movimento do dedo está em pixel de tela; o quadro vive em pixel da foto.
  const porPixel = (mmPx(FORMATOS[formato].mmL) / r.width) / quadro.escala;
  quadro.cx = arrastando.cx - (e.clientX - arrastando.x) * porPixel;
  quadro.cy = arrastando.cy - (e.clientY - arrastando.y) * porPixel;
  limitarQuadro();
  desenhar();
});

for (const ev of ['pointerup', 'pointercancel']) {
  $('previa').addEventListener(ev, (e) => {
    dedos.delete(e.pointerId);
    if (dedos.size < 2) pincando = null;
    // Tirar um dedo dos dois não deve fazer a foto saltar: o que sobrou vira o
    // novo ponto de partida do arraste.
    if (dedos.size === 1) {
      const [p] = [...dedos.values()];
      arrastando = { x: p.x, y: p.y, cx: quadro.cx, cy: quadro.cy };
    } else {
      arrastando = null;
    }
  });
}

$('previa').addEventListener('wheel', (e) => {
  if (!original || travado) return;
  e.preventDefault();
  quadro.escala *= e.deltaY < 0 ? 1.06 : 1 / 1.06;
  limitarQuadro();
  $('zoom').value = String(Math.round(quadro.escala * 100));
  desenhar();
}, { passive: false });

$('zoom').addEventListener('input', () => {
  quadro.escala = Number($('zoom').value) / 100;
  limitarQuadro();
  // O limite pode ter recusado o valor pedido — afastar mais do que isto
  // deixaria vazio dentro da foto. Devolver o valor real ao controle faz o
  // botão encostar no limite, em vez de continuar andando sem nada acontecer.
  $('zoom').value = String(Math.round(quadro.escala * 100));
  desenhar();
});

$('reenquadrar').addEventListener('click', () => { enquadrarAutomatico(); desenhar(); });

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */
$('formatos').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-formato]');
  if (!b) return;

  if (b.dataset.formato === 'livre' && !(await exigirVip({
    titulo: 'Medida livre em milímetros',
    texto: 'Digite o tamanho e a altura da cabeça que a exigência pedir — serve '
      + 'para qualquer documento de qualquer país, inclusive os que mudam de regra.',
  }))) return;

  formato = b.dataset.formato;
  for (const o of $('formatos').children) o.classList.toggle('is-active', o === b);
  $('formatoDetalhe').textContent = FORMATOS[formato].detalhe;
  $('camposLivre').hidden = formato !== 'livre';
  enquadrarAutomatico();
  desenhar();
});

/* Os campos da medida livre alimentam a própria entrada da tabela. */
for (const id of ['livreL', 'livreA', 'livreCabeca']) {
  $(id).addEventListener('input', () => {
    $('livreCabecaVal').textContent = $('livreCabeca').value + '%';
    FORMATOS.livre.mmL = Math.min(200, Math.max(10, Number($('livreL').value) || 30));
    FORMATOS.livre.mmA = Math.min(200, Math.max(10, Number($('livreA').value) || 40));
    FORMATOS.livre.cabeca = Number($('livreCabeca').value) / 100;
    FORMATOS.livre.nome = FORMATOS.livre.mmL + ' × ' + FORMATOS.livre.mmA + ' mm';
    if (formato === 'livre') { enquadrarAutomatico(); desenhar(); }
  });
}

$('folhas').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-folha]');
  if (!b) return;

  if (FOLHAS[b.dataset.folha].vip && !(await exigirVip({
    titulo: 'Folha A4 cheia de fotos',
    texto: 'Na A4 cabem 49 fotos 3×4 em vez de 9, com as linhas de corte no lugar '
      + '— é a folha de quem imprime em casa ou manda imprimir em papel comum.',
  }))) return;

  folha = b.dataset.folha;
  for (const o of $('folhas').children) o.classList.toggle('is-active', o === b);
  $('folhaDetalhe').textContent = FOLHAS[folha].detalhe;
  atualizarFolha();
});

$('fundos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fundo]');
  if (!b) return;
  fundo = b.dataset.fundo;
  for (const o of $('fundos').querySelectorAll('[data-fundo]')) o.classList.toggle('is-active', o === b);
  $('corFundo').value = fundo;
  desenhar();
});
$('corFundo').addEventListener('input', () => {
  fundo = $('corFundo').value;
  for (const o of $('fundos').querySelectorAll('[data-fundo]')) o.classList.remove('is-active');
  desenhar();
});

$('semFundo').addEventListener('change', async () => {
  semFundo = $('semFundo').checked;
  await prepararFundo();
  if (semFundo && silhueta) enquadrarAutomatico();
  desenhar();
});

$('guias').addEventListener('change', () => { guias = $('guias').checked; desenhar(); });

$('trocar').addEventListener('click', () => {
  original = null; recortado = null; silhueta = null;
  $('trabalho').hidden = true;
  $('drop').hidden = false;
  avisar('');
});

/* ------------------------------------------------------------------ *
 * Folha para impressão
 * ------------------------------------------------------------------ */
function gradeDaFolha() {
  const f = FORMATOS[formato];
  // Sem espaço entre as fotos: o corte cai na divisa, que é como o laboratório
  // faz. Deixar folga só reduziria quantas cabem.
  const lf = FOLHAS[folha];
  const colunas = Math.floor(lf.mmL / f.mmL);
  const linhas = Math.floor(lf.mmA / f.mmA);
  return { colunas, linhas, total: colunas * linhas };
}

function atualizarFolha() {
  const g = gradeDaFolha();
  $('baixarFolha').textContent = 'Baixar folha ' + FOLHAS[folha].nome + ' com ' + g.total
    + (g.total === 1 ? ' foto' : ' fotos');
  $('baixarFolha').disabled = g.total < 1;
}

function montarFolha() {
  const f = FORMATOS[formato];
  const g = gradeDaFolha();
  const folhaL = mmPx(FOLHAS[folha].mmL);
  const folhaA = mmPx(FOLHAS[folha].mmA);
  const fotoL = mmPx(f.mmL);
  const fotoA = mmPx(f.mmA);

  const cv = document.createElement('canvas');
  cv.width = folhaL;
  cv.height = folhaA;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, folhaL, folhaA);

  const x0 = Math.round((folhaL - g.colunas * fotoL) / 2);
  const y0 = Math.round((folhaA - g.linhas * fotoA) / 2);

  for (let l = 0; l < g.linhas; l++) {
    for (let c = 0; c < g.colunas; c++) {
      const x = x0 + c * fotoL;
      const y = y0 + l * fotoA;
      ctx.drawImage(fotoCanvas, x, y, fotoL, fotoA);
      // A linha de corte fica EM CIMA da divisa: ela some na tesourada, em vez
      // de virar uma moldura cinza dentro da foto entregue.
      ctx.strokeStyle = 'rgba(120, 120, 120, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, fotoL - 1, fotoA - 1);
    }
  }
  return cv;
}

/* ------------------------------------------------------------------ *
 * Saída
 * ------------------------------------------------------------------ */
$('baixarFoto').addEventListener('click', () => sair(fotoCanvas, 'foto-' + formato));
$('baixarFolha').addEventListener('click', () => sair(montarFolha(), 'folha-' + formato));

async function sair(canvas, nome) {
  if (!original) return;
  const png = $('tipoArquivo').value === 'png';
  const blob = await new Promise((r) =>
    canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.94));
  baixar(png ? await comDpi(blob, DPI) : blob, nome + (png ? '.png' : '.jpg'));
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ------------------------------------------------------------------ *
 * A resolução gravada dentro do PNG
 * ------------------------------------------------------------------ */

/** CRC-32, que é como o PNG fecha cada pedaço do arquivo. */
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Grava a resolução dentro do PNG, no pedaço "pHYs".
 *
 * ISTO É O QUE FAZ A FOTO SAIR NO TAMANHO CERTO. Um PNG sem resolução gravada
 * é impresso pelo programa no palpite dele — normalmente 96 DPI, que
 * transformaria um 3×4 em quase 9×12 cm. O arquivo teria os pixels certos e
 * ainda assim o documento seria recusado.
 *
 * O pedaço entra logo depois do IHDR, que no PNG é sempre o primeiro e sempre
 * tem 13 bytes de conteúdo: 8 da assinatura + 4 de tamanho + 4 do nome + 13 do
 * conteúdo + 4 do CRC = 33.
 */
async function comDpi(blob, dpi) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const porMetro = Math.round(dpi / 0.0254);

  const pedaco = new Uint8Array(21);           // 4 tamanho + 4 nome + 9 conteúdo + 4 CRC
  const dv = new DataView(pedaco.buffer);
  dv.setUint32(0, 9);
  pedaco.set([0x70, 0x48, 0x59, 0x73], 4);     // "pHYs"
  dv.setUint32(8, porMetro);
  dv.setUint32(12, porMetro);
  pedaco[16] = 1;                              // a unidade é o metro
  dv.setUint32(17, crc32(pedaco.subarray(4, 17)));

  const fora = new Uint8Array(bytes.length + pedaco.length);
  fora.set(bytes.subarray(0, 33), 0);
  fora.set(pedaco, 33);
  fora.set(bytes.subarray(33), 33 + pedaco.length);
  return new Blob([fora], { type: 'image/png' });
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
function avisar(texto, erro = false) {
  $('aviso').hidden = !texto;
  $('aviso').textContent = texto;
  $('aviso').className = erro ? 'pdf-aviso' : 'ed-hint';
}

function travar(sim) {
  travado = sim;
  for (const id of ['baixarFoto', 'baixarFolha', 'reenquadrar', 'zoom', 'semFundo']) {
    $(id).disabled = sim;
  }
  $('previa').classList.toggle('ocupado', sim);
}

// Mandar alguém "rolar o mouse" num telefone é instrução para um aparelho que
// a pessoa não tem na mão.
if (ehCelular) {
  $('dica').textContent = 'Arraste com um dedo para mover e junte dois dedos para aproximar.';
  $('previa').title = 'Arraste para mover · dois dedos para aproximar';
}

refreshSliders();
