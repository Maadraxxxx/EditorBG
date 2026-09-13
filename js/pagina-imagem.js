/**
 * Converter, redimensionar e comprimir imagem.
 *
 * Tudo aqui é trabalho de canvas: decodificar, redesenhar no tamanho novo e
 * codificar no formato pedido. Nenhum modelo, nenhuma biblioteca, nada que
 * precise baixar — e por isso funciona em qualquer aparelho, inclusive nos
 * fracos, que é onde as outras ferramentas do site sofrem.
 */
import { MAX_DIM } from './limites.js';
import './conta-ui.js';
import { refreshSliders } from './sliders.js';

const $ = (id) => document.getElementById(id);

// O paywall injeta o próprio markup e baixa o Mercado Pago: entra por import
// dinâmico para não segurar a página por causa de uma tela que a maioria das
// visitas nunca abre.
let Paywall = null;
const paywallPronto = import('./paywall.js').then((m) => { Paywall = m; return m; });
const ehVip = () => !!(Paywall && Paywall.temHD());

/**
 * O VIP daqui só acrescenta.
 *
 * Desligado, a página continua exatamente o que era: converter, redimensionar
 * e comprimir pela qualidade escolhida, sem limite de arquivos e sem marca
 * nenhuma na saída. O alvo de peso é uma capacidade a mais, e o selo aparece
 * antes do clique — ninguém descobre que era pago depois de tentar.
 */
async function exigirVip(motivo) {
  if (ehVip()) return true;
  (await paywallPronto).abrirPaywall(null, null, motivo);
  return false;
}

/**
 * Tetos por formato.
 *
 * JPG não tem transparência: um PNG recortado vira fundo preto se for
 * convertido sem cuidado, então o fundo é pintado antes. WEBP aceita os dois
 * mundos e costuma sair menor que os dois — é a escolha certa para site, e a
 * errada para mandar para quem vai abrir num programa antigo.
 */
const FORMATOS = {
  jpeg: { nome: 'JPG', extensao: 'jpg', tipo: 'image/jpeg', transparencia: false },
  png: { nome: 'PNG', extensao: 'png', tipo: 'image/png', transparencia: true },
  webp: { nome: 'WEBP', extensao: 'webp', tipo: 'image/webp', transparencia: true },
};

let originais = [];   // { arquivo, bitmap }
let resultados = [];  // { nome, blob, antes, depois }

/* ------------------------------------------------------------------ *
 * Entrada
 * ------------------------------------------------------------------ */
$('drop').addEventListener('click', () => $('file').click());
$('drop').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
});
$('file').addEventListener('change', () => {
  if ($('file').files.length) receber([...$('file').files]);
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
  const bons = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
  if (bons.length) receber(bons);
});

window.addEventListener('paste', (e) => {
  const bons = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (bons.length) receber(bons);
});

async function receber(arquivos) {
  avisar('');
  for (const arquivo of arquivos) {
    try {
      // Respeita a orientação EXIF: sem isso, foto de celular entra deitada.
      const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      originais.push({ arquivo, bitmap });
    } catch {
      avisar('Não consegui abrir "' + arquivo.name + '". O arquivo pode estar corrompido.', true);
    }
  }
  if (!originais.length) return;

  $('drop').hidden = true;
  $('trabalho').hidden = false;

  // O tamanho do primeiro vira o padrão dos campos: é o que a pessoa espera
  // ver, e mostra em que unidade os campos trabalham.
  const primeiro = originais[0].bitmap;
  if (!$('larguraAlvo').value) {
    $('larguraAlvo').value = Math.min(primeiro.width, MAX_DIM);
    $('alturaAlvo').value = Math.round($('larguraAlvo').value * (primeiro.height / primeiro.width));
  }

  listar();
  converter();
}

function listar() {
  $('lista').innerHTML = originais.map((o, i) => `
    <div class="pdf-arquivo">
      <span class="pdf-arquivo-nome">${o.arquivo.name}</span>
      <span class="pdf-arquivo-peso">${o.bitmap.width}×${o.bitmap.height} · ${tamanho(o.arquivo.size)}</span>
      <button class="pdf-tirar" data-tirar="${i}" type="button" title="Tirar da lista">✕</button>
    </div>`).join('');
}

$('lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tirar]');
  if (!b) return;
  originais.splice(Number(b.dataset.tirar), 1);
  if (!originais.length) {
    $('trabalho').hidden = true;
    $('drop').hidden = false;
    return;
  }
  listar();
  converter();
});

$('limpar').addEventListener('click', () => {
  originais = [];
  resultados = [];
  $('trabalho').hidden = true;
  $('drop').hidden = false;
  $('larguraAlvo').value = '';
  $('alturaAlvo').value = '';
});

$('mais').addEventListener('click', () => $('file').click());

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */
for (const id of ['formato', 'qualidade', 'larguraAlvo', 'alturaAlvo', 'manterProporcao', 'naoAumentar']) {
  const el = $(id);
  el.addEventListener('input', aoMudar);
  el.addEventListener('change', aoMudar);
}

let pendente = null;
function aoMudar(e) {
  $('qualidadeVal').textContent = $('qualidade').value + '%';

  // A qualidade só existe onde ela significa alguma coisa: PNG não perde nada
  // e o controle ali seria um botão que não faz nada.
  const perdeQualidade = $('formato').value !== 'png';
  $('grupoQualidade').hidden = !perdeQualidade;

  if ($('manterProporcao').checked && originais.length) {
    const p = originais[0].bitmap;
    if (e && e.target === $('larguraAlvo')) {
      $('alturaAlvo').value = Math.max(1, Math.round(Number($('larguraAlvo').value) * (p.height / p.width)));
    } else if (e && e.target === $('alturaAlvo')) {
      $('larguraAlvo').value = Math.max(1, Math.round(Number($('alturaAlvo').value) * (p.width / p.height)));
    }
  }

  clearTimeout(pendente);
  pendente = setTimeout(converter, 150);
}

for (const b of $('atalhos').children) {
  b.addEventListener('click', () => {
    if (!originais.length) return;
    const p = originais[0].bitmap;
    const fator = Number(b.dataset.fator);
    $('larguraAlvo').value = Math.max(1, Math.round(p.width * fator));
    $('alturaAlvo').value = Math.max(1, Math.round(p.height * fator));
    for (const outro of $('atalhos').children) outro.classList.toggle('is-active', outro === b);
    converter();
  });
}

/* ------------------------------------------------------------------ *
 * Conversão
 * ------------------------------------------------------------------ */
/**
 * Um contador de execucoes, para duas conversoes nao se atropelarem.
 *
 * `converter` e assincrona e cada arquivo espera o `toBlob`. Mexer num controle
 * no meio disso comeca uma segunda conversao enquanto a primeira ainda esta
 * dentro do laco — e as duas escreviam na MESMA lista de resultados. Com duas
 * imagens a lista terminava com quatro entradas, o botao oferecia baixar "as 4"
 * e a contagem de quem nao coube no peso saia dobrada.
 *
 * Agora cada execucao carrega o proprio numero e a propria lista: se o numero
 * mudou, chegou gente mais nova e esta aqui joga fora o que fez em vez de
 * publicar resultado velho por cima do novo.
 */
let execucao = 0;

async function converter() {
  if (!originais.length) return;
  const meu = ++execucao;

  const f = FORMATOS[$('formato').value];
  const qualidade = Number($('qualidade').value) / 100;
  const alvoL = Math.max(1, Number($('larguraAlvo').value) || originais[0].bitmap.width);
  const alvoA = Math.max(1, Number($('alturaAlvo').value) || originais[0].bitmap.height);

  const locais = [];
  let foraDoAlvo = 0;
  let antesTotal = 0;
  let depoisTotal = 0;

  for (const o of originais) {
    let largura = alvoL;
    let altura = alvoA;

    // Com vários arquivos de tamanhos diferentes, o número digitado vira um
    // TETO e cada imagem mantém a própria proporção. Forçar todas ao mesmo
    // tamanho distorceria as que não são do mesmo formato.
    if (originais.length > 1 || $('manterProporcao').checked) {
      const k = Math.min(alvoL / o.bitmap.width, alvoA / o.bitmap.height);
      const escala = $('naoAumentar').checked ? Math.min(1, k) : k;
      largura = Math.max(1, Math.round(o.bitmap.width * escala));
      altura = Math.max(1, Math.round(o.bitmap.height * escala));
    }

    const cv = document.createElement('canvas');
    cv.width = largura;
    cv.height = altura;
    const ctx = cv.getContext('2d');

    // JPG não tem transparência. Sem pintar o fundo, o que era transparente
    // vira preto — o defeito clássico de converter PNG recortado para JPG.
    if (!f.transparencia) {
      ctx.fillStyle = $('fundo').value;
      ctx.fillRect(0, 0, largura, altura);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(o.bitmap, 0, 0, largura, altura);

    const alvoBytes = pesoAlvoAtivo() ? Number($('pesoAlvo').value) * 1024 : 0;
    const procura = alvoBytes ? await procurarQualidade(cv, f, alvoBytes) : null;
    const blob = procura ? procura.blob : await new Promise((r) => cv.toBlob(r, f.tipo, qualidade));
    if (procura && !procura.coube) foraDoAlvo++;
    if (!blob) { avisar('Este navegador não sabe gravar em ' + f.nome + '.', true); return; }

    // Chegou conversao mais nova enquanto esta esperava: o trabalho daqui ja
    // nao vale, e insistir sobrescreveria o resultado certo.
    if (meu !== execucao) return;

    locais.push({
      nome: semExtensao(o.arquivo.name) + '.' + f.extensao,
      blob,
      antes: o.arquivo.size,
      depois: blob.size,
      largura,
      altura,
    });
    antesTotal += o.arquivo.size;
    depoisTotal += blob.size;
  }

  if (meu !== execucao) return;
  resultados = locais;
  mostrar(antesTotal, depoisTotal, foraDoAlvo);
}

/* ------------------------------------------------------------------ *
 * Alvo de peso — VIP
 * ------------------------------------------------------------------ */
const pesoAlvoAtivo = () => $('pesoAlvoLigar').checked && ehVip();

/**
 * Procura a melhor qualidade que ainda cabe no peso pedido.
 *
 * Não dá para calcular: quanto um JPG pesa em cada qualidade depende do que
 * está na foto — céu liso comprime muito, folhagem quase nada. Então o jeito é
 * tentar. Busca binária em 8 passos cobre a faixa de 30% a 100% com precisão
 * melhor que meio ponto, e cada passo é uma codificação, que numa foto comum
 * leva poucos milissegundos.
 *
 * A regra é "a MELHOR que ainda cabe", nunca "a primeira que coube": guardar o
 * melhor resultado visto e continuar subindo entrega a imagem mais bonita que
 * respeita o limite, em vez de uma qualquer bem abaixo dele.
 */
async function procurarQualidade(cv, f, alvoBytes) {
  // PNG não perde nada e por isso não tem qualidade para negociar: o que ele
  // pesa é o que ele pesa. Resta dizer se coube ou não.
  if (f.tipo === 'image/png') {
    const unico = await new Promise((r) => cv.toBlob(r, f.tipo));
    return { blob: unico, coube: !!unico && unico.size <= alvoBytes };
  }

  let baixo = 0.15;
  let alto = 1.0;
  let melhor = null;

  for (let i = 0; i < 8; i++) {
    const meio = (baixo + alto) / 2;
    const tentativa = await new Promise((r) => cv.toBlob(r, f.tipo, meio));
    if (!tentativa) return null;
    if (tentativa.size <= alvoBytes) { melhor = tentativa; baixo = meio; }
    else { alto = meio; }
  }

  if (melhor) return { blob: melhor, coube: true };

  // Nem no mínimo coube. Devolver a menor possível e DIZER isso é melhor que
  // entregar em silêncio um arquivo acima do limite que o formulário vai
  // recusar — a pessoa precisa saber que tem de diminuir os pixels.
  return { blob: await new Promise((r) => cv.toBlob(r, f.tipo, baixo)), coube: false };
}

$('pesoAlvoLigar').addEventListener('change', async () => {
  if (!$('pesoAlvoLigar').checked) { $('pesoAlvoControles').hidden = true; converter(); return; }
  const liberado = await exigirVip({
    titulo: 'Caber num peso exato',
    texto: 'Diga o limite em KB e a melhor qualidade que ainda cabe é procurada '
      + 'sozinha — feito para formulário que recusa arquivo grande.',
  });
  if (!liberado) { $('pesoAlvoLigar').checked = false; return; }
  $('pesoAlvoControles').hidden = false;
  converter();
});

$('pesoAlvo').addEventListener('input', () => {
  clearTimeout(pendente);
  pendente = setTimeout(converter, 300);
});

let previaUrl = null;

function mostrar(antes, depois, foraDoAlvo = 0) {
  const r = resultados[0];
  if (previaUrl) URL.revokeObjectURL(previaUrl);
  previaUrl = URL.createObjectURL(r.blob);
  $('previa').src = previaUrl;

  $('medidas').textContent = r.largura + ' × ' + r.altura + ' px';

  const diferenca = antes ? Math.round((1 - depois / antes) * 100) : 0;
  $('peso').textContent = tamanho(antes) + ' → ' + tamanho(depois)
    + (diferenca > 0 ? ' · ' + diferenca + '% menor'
      : diferenca < 0 ? ' · ' + Math.abs(diferenca) + '% maior' : '');
  $('peso').className = 'img-peso' + (diferenca > 0 ? ' bom' : diferenca < 0 ? ' ruim' : '');

  $('baixar').textContent = resultados.length === 1
    ? 'Baixar imagem'
    : 'Baixar as ' + resultados.length + ' num .zip';
  $('fundoGrupo').hidden = FORMATOS[$('formato').value].transparencia;

  // Com alvo de peso, a qualidade deixa de ser escolha: ela passa a ser
  // consequência do limite. Deixar o controle ligado ali daria a impressão de
  // que ele ainda manda em alguma coisa.
  $('grupoQualidade').hidden = pesoAlvoAtivo() || $('formato').value === 'png';

  if (pesoAlvoAtivo() && foraDoAlvo) {
    const quais = resultados.length === 1
      ? 'Não cheguei'
      : foraDoAlvo + ' de ' + resultados.length + ' imagens não chegaram';
    avisar(quais + ' a ' + $('pesoAlvo').value + ' KB nem na qualidade mais baixa. '
      + 'Diminua a largura em pixels, ou tente WEBP, que costuma sair bem menor.', true);
  } else if (pesoAlvoAtivo()) {
    avisar('');
  }
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */
$('baixar').addEventListener('click', async () => {
  if (!resultados.length) return;

  if (resultados.length === 1) {
    baixarArquivo(resultados[0].blob, resultados[0].nome);
    return;
  }

  const { zipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm');
  const dentro = {};
  for (const r of resultados) dentro[r.nome] = new Uint8Array(await r.blob.arrayBuffer());
  // level 0: JPG e WEBP já vêm comprimidos, e insistir só gasta tempo.
  baixarArquivo(new Blob([zipSync(dentro, { level: 0 })], { type: 'application/zip' }), 'imagens.zip');
});

function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
const semExtensao = (n) => String(n || 'imagem').replace(/\.[^.]+$/, '');

function tamanho(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function avisar(texto, erro = false) {
  $('aviso').hidden = !texto;
  $('aviso').textContent = texto;
  $('aviso').className = erro ? 'pdf-aviso' : 'ed-hint';
}

refreshSliders();
