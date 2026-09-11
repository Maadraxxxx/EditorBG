/**
 * Operações de PDF, todas dentro do navegador.
 *
 * Vale aqui a mesma promessa do resto do site: o arquivo não sai do aparelho.
 * Isso é o que decide quais ferramentas existem. Juntar, dividir, girar,
 * numerar e converter para imagem são manipulação de estrutura e desenho —
 * o pdf-lib e o pdf.js fazem tudo isso no navegador.
 *
 * Converter para Word e Excel é mais difícil, mas cabe aqui também: o PDF
 * guarda letras com posição e corpo, não parágrafos e colunas, então a
 * estrutura precisa ser DEDUZIDA — pelo tamanho da letra, no caso dos títulos,
 * e pelo alinhamento dos X, no caso das tabelas. O resultado é um documento
 * editável de verdade, e não uma foto da página; o que se perde é o layout
 * milimétrico, que o PDF simplesmente não tem para entregar.
 *
 * Senha e reparo passam pelo MuPDF, que é uma biblioteca de PDF completa
 * compilada para WebAssembly.
 *
 * TODAS as bibliotecas são carregadas sob demanda, não no topo: quem entra na
 * página só para ver as opções não deve baixar dezenas de megabytes à toa.
 */

let libPromise = null;
let jsPromise = null;
let zipPromise = null;

/** pdf-lib: cria e altera a estrutura do PDF. */
function lib() {
  if (!libPromise) libPromise = import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  return libPromise;
}

/** pdf.js: desenha a página, que o pdf-lib não sabe fazer. */
async function leitor() {
  if (!jsPromise) {
    jsPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs')
      .then((J) => {
        J.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
        return J;
      });
  }
  return jsPromise;
}

function zipador() {
  if (!zipPromise) zipPromise = import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm');
  return zipPromise;
}

const bytesDe = (arquivo) => arquivo.arrayBuffer();
const comoPdf = (b) => new Blob([b], { type: 'application/pdf' });

/** Tira a extensão, para montar nomes de saída sem ".pdf.pdf". */
export function semExtensao(nome) {
  return String(nome || 'arquivo').replace(/\.[^.]+$/, '');
}

/**
 * Abre um PDF para alteração.
 *
 * `ignoreEncryption` existe porque muito PDF de banco e de nota fiscal vem com
 * uma marcação de "só leitura" que não tem senha nenhuma. Recusar esses seria
 * recusar justamente os arquivos que as pessoas mais querem juntar.
 */
async function abrir(arquivo) {
  const { PDFDocument } = await lib();
  return PDFDocument.load(await bytesDe(arquivo), { ignoreEncryption: true });
}

/** Quantas páginas, e o tamanho da primeira — para a tela mostrar antes de agir. */
export async function informacoes(arquivo) {
  const doc = await abrir(arquivo);
  const p = doc.getPage(0);
  const { width, height } = p.getSize();
  return {
    paginas: doc.getPageCount(),
    largura: Math.round(width),
    altura: Math.round(height),
    bytes: arquivo.size,
  };
}

/* ------------------------------------------------------------------ *
 * Estrutura: juntar, dividir, organizar, girar
 * ------------------------------------------------------------------ */

export async function juntar(arquivos) {
  const { PDFDocument } = await lib();
  const saida = await PDFDocument.create();

  for (const arquivo of arquivos) {
    const doc = await abrir(arquivo);
    const paginas = await saida.copyPages(doc, doc.getPageIndices());
    for (const p of paginas) saida.addPage(p);
  }
  return comoPdf(await saida.save());
}

/**
 * Lê "1-3, 7, 10-12" e devolve os números de página.
 *
 * Aceita o que a pessoa escreve de verdade: ponto e vírgula, espaços, traço
 * comum ou travessão. Descarta o que estiver fora do documento em vez de
 * quebrar — uma vírgula sobrando no fim não pode invalidar a linha inteira.
 */
export function lerIntervalos(texto, total) {
  const numeros = [];
  for (const parte of String(texto).split(/[,;]+/)) {
    const limpo = parte.trim().replace(/[–—]/g, '-');
    if (!limpo) continue;

    const faixa = limpo.match(/^(\d+)\s*-\s*(\d+)$/);
    if (faixa) {
      const a = Number(faixa[1]);
      const b = Number(faixa[2]);
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) {
        if (n >= 1 && n <= total) numeros.push(n);
      }
      continue;
    }
    const n = Number(limpo);
    if (Number.isInteger(n) && n >= 1 && n <= total) numeros.push(n);
  }
  return numeros;
}

/**
 * Divide. Em 'cada' sai um arquivo por página; em 'intervalos' sai um arquivo
 * com as páginas escolhidas.
 */
export async function dividir(arquivo, modo, texto) {
  const { PDFDocument } = await lib();
  const doc = await abrir(arquivo);
  const total = doc.getPageCount();
  const base = semExtensao(arquivo.name);

  if (modo === 'intervalos') {
    const numeros = lerIntervalos(texto, total);
    if (!numeros.length) throw new Error('Nenhuma página válida no intervalo. Exemplo: 1-3, 7');
    const saida = await PDFDocument.create();
    const paginas = await saida.copyPages(doc, numeros.map((n) => n - 1));
    for (const p of paginas) saida.addPage(p);
    return [{ nome: base + '-selecao.pdf', blob: comoPdf(await saida.save()) }];
  }

  const partes = [];
  for (let i = 0; i < total; i++) {
    const saida = await PDFDocument.create();
    const [p] = await saida.copyPages(doc, [i]);
    saida.addPage(p);
    partes.push({ nome: base + '-' + String(i + 1).padStart(2, '0') + '.pdf', blob: comoPdf(await saida.save()) });
  }
  return partes;
}

/** Mantém só as páginas pedidas, na ordem pedida. */
export async function organizar(arquivo, texto) {
  const { PDFDocument } = await lib();
  const doc = await abrir(arquivo);
  const numeros = lerIntervalos(texto, doc.getPageCount());
  if (!numeros.length) throw new Error('Nenhuma página válida. Exemplo: 3, 1, 2');

  const saida = await PDFDocument.create();
  const paginas = await saida.copyPages(doc, numeros.map((n) => n - 1));
  for (const p of paginas) saida.addPage(p);
  return comoPdf(await saida.save());
}

/**
 * Gira. O ângulo SOMA ao que a página já tinha: um PDF de celular costuma
 * chegar com 90 gravado, e ignorar isso deixaria a página de cabeça para baixo
 * justamente nos arquivos que precisavam ser girados.
 */
export async function rodar(arquivo, graus, texto) {
  const { degrees } = await lib();
  const doc = await abrir(arquivo);
  const total = doc.getPageCount();
  const alvo = texto && texto.trim()
    ? new Set(lerIntervalos(texto, total))
    : null;   // vazio = todas

  doc.getPages().forEach((p, i) => {
    if (alvo && !alvo.has(i + 1)) return;
    p.setRotation(degrees((p.getRotation().angle + graus + 360) % 360));
  });
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Desenho por cima: números e marca d'água
 * ------------------------------------------------------------------ */

export async function numerarPaginas(arquivo, opcoes = {}) {
  const { StandardFonts, rgb } = await lib();
  const doc = await abrir(arquivo);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const tamanho = opcoes.tamanho || 11;
  const total = doc.getPageCount();
  const comeco = opcoes.comeco || 1;

  doc.getPages().forEach((p, i) => {
    const { width } = p.getSize();
    const n = i + comeco;

    const texto =
      opcoes.formato === 'de' ? n + ' de ' + (total + comeco - 1)
        : opcoes.formato === 'romano' ? romano(n, true)
          : opcoes.formato === 'romano-minusculo' ? romano(n, false)
            : String(n);

    const largura = fonte.widthOfTextAtSize(texto, tamanho);

    const x = opcoes.posicao === 'esquerda' ? 40
      : opcoes.posicao === 'direita' ? width - 40 - largura
        : (width - largura) / 2;

    p.drawText(texto, { x, y: 26, size: tamanho, font: fonte, color: rgb(0.25, 0.25, 0.25) });
  });
  return comoPdf(await doc.save());
}

export async function marcaDagua(arquivo, texto, opcoes = {}) {
  const limpo = String(texto || '').trim();
  if (!limpo) throw new Error('Escreva o texto da marca d\'água.');

  const { StandardFonts, rgb, degrees } = await lib();
  const doc = await abrir(arquivo);
  const fonte = await doc.embedFont(StandardFonts.HelveticaBold);
  const opacidade = opcoes.opacidade ?? 0.18;

  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    // O tamanho sai da página, não é fixo: a mesma marca precisa cobrir igual
    // num A4 e num slide deitado.
    const corpo = Math.max(18, Math.min(width, height) * (opcoes.tamanho ?? 0.09));
    const largura = fonte.widthOfTextAtSize(limpo, corpo);

    p.drawText(limpo, {
      x: (width - largura * 0.86) / 2,
      y: height / 2 - corpo / 2,
      size: corpo,
      font: fonte,
      color: rgb(0.45, 0.45, 0.5),
      opacity: opacidade,
      rotate: degrees(opcoes.diagonal === false ? 0 : 35),
    });
  }
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Entre PDF e imagem
 * ------------------------------------------------------------------ */

/**
 * Cada página vira um JPG.
 *
 * A escala multiplica o tamanho natural da página (72 pontos por polegada):
 * 2 dá aproximadamente 144 dpi, que é o que serve para ler na tela; 4 chega
 * perto de qualidade de impressão e pesa quatro vezes mais.
 */
export async function paraImagens(arquivo, opcoes = {}, aoProgredir = () => {}) {
  const J = await leitor();
  const doc = await J.getDocument({ data: await bytesDe(arquivo) }).promise;
  const escala = opcoes.escala || 2;
  const tipo = opcoes.tipo === 'png' ? 'image/png' : 'image/jpeg';
  const base = semExtensao(arquivo.name);
  const saidas = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const vista = pagina.getViewport({ scale: escala });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vista.width);
    cv.height = Math.round(vista.height);
    const ctx = cv.getContext('2d');

    // Fundo branco antes de desenhar: PDF não tem fundo, e sem isto o JPG sai
    // com o que estiver na memória do canvas, normalmente preto.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    await pagina.render({ canvasContext: ctx, viewport: vista, canvas: cv }).promise;

    const blob = await new Promise((r) => cv.toBlob(r, tipo, 0.92));
    saidas.push({
      nome: base + '-' + String(n).padStart(2, '0') + (tipo === 'image/png' ? '.png' : '.jpg'),
      blob,
    });
    aoProgredir(n / doc.numPages, n, doc.numPages);
  }
  return saidas;
}

/** Imagens viram um PDF, uma por página, cada página do tamanho da imagem. */
export async function deImagens(arquivos, opcoes = {}) {
  const { PDFDocument } = await lib();
  const doc = await PDFDocument.create();

  for (const arquivo of arquivos) {
    let bytes = await bytesDe(arquivo);
    let tipo = arquivo.type;

    // WebP e companhia o pdf-lib não embute; passar pelo canvas resolve sem a
    // pessoa precisar converter antes em outro lugar.
    if (tipo !== 'image/jpeg' && tipo !== 'image/png') {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: tipo || 'image/png' }));
      const cv = document.createElement('canvas');
      cv.width = bitmap.width; cv.height = bitmap.height;
      cv.getContext('2d').drawImage(bitmap, 0, 0);
      const convertido = await new Promise((r) => cv.toBlob(r, 'image/png'));
      bytes = await convertido.arrayBuffer();
      tipo = 'image/png';
    }

    const imagem = tipo === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    const margem = opcoes.margem || 0;
    const pagina = doc.addPage([imagem.width + margem * 2, imagem.height + margem * 2]);
    pagina.drawImage(imagem, { x: margem, y: margem, width: imagem.width, height: imagem.height });
  }
  return comoPdf(await doc.save());
}

/**
 * Comprimir redesenhando cada página como imagem.
 *
 * É preciso ser franco sobre o que isso faz: o texto deixa de ser texto e vira
 * desenho. O arquivo encolhe bastante num documento digitalizado, e não pode
 * mais ser pesquisado nem copiado. Para PDF que já é só imagem, é troca boa;
 * para contrato com texto de verdade, é troca ruim — e a tela avisa.
 */
export async function comprimir(arquivo, opcoes = {}, aoProgredir = () => {}) {
  const { PDFDocument } = await lib();
  const paginas = await paraImagens(arquivo, { escala: opcoes.escala || 1.5, tipo: 'jpeg' }, aoProgredir);
  const doc = await PDFDocument.create();

  for (const { blob } of paginas) {
    const imagem = await doc.embedJpg(await blob.arrayBuffer());
    const p = doc.addPage([imagem.width, imagem.height]);
    p.drawImage(imagem, { x: 0, y: 0, width: imagem.width, height: imagem.height });
  }
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Texto
 * ------------------------------------------------------------------ */

/**
 * Extrai o texto que já existe no PDF. Não faz OCR: página digitalizada é
 * imagem, e daí não sai texto nenhum — a tela diz isso quando o resultado
 * volta vazio, em vez de entregar um arquivo em branco sem explicação.
 */
export async function paraTexto(arquivo) {
  const J = await leitor();
  const doc = await J.getDocument({ data: await bytesDe(arquivo) }).promise;
  const partes = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();

    // O pdf.js entrega pedaços soltos com a posição de cada um. Quebrar linha
    // quando o Y muda é o que transforma isso em texto legível em vez de uma
    // parede de palavras.
    let linha = '';
    let ultimoY = null;
    const linhas = [];
    for (const item of conteudo.items) {
      const y = Math.round(item.transform[5]);
      if (ultimoY !== null && Math.abs(y - ultimoY) > 2) { linhas.push(linha.trim()); linha = ''; }
      linha += item.str;
      if (item.hasEOL) { linhas.push(linha.trim()); linha = ''; }
      ultimoY = y;
    }
    if (linha.trim()) linhas.push(linha.trim());
    partes.push(linhas.filter(Boolean).join('\n'));
  }
  return partes.join('\n\n');
}

/* ------------------------------------------------------------------ *
 * Entrega
 * ------------------------------------------------------------------ */

export function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  // Soltar na hora cancela o download em alguns navegadores; um instante
  // depois já foi lido.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Vários arquivos viram um .zip. Baixar trinta arquivos seguidos faz o
 * navegador bloquear a partir do segundo, e a pessoa fica sem entender o que
 * aconteceu com o resto.
 */
export async function baixarVarios(itens, nomeZip) {
  if (itens.length === 1) return baixar(itens[0].blob, itens[0].nome);

  const { zipSync } = await zipador();
  const dentro = {};
  for (const { nome, blob } of itens) {
    dentro[nome] = new Uint8Array(await blob.arrayBuffer());
  }
  // level 0: PDF e JPG já vêm comprimidos, e insistir só gasta tempo.
  const zip = zipSync(dentro, { level: 0 });
  baixar(new Blob([zip], { type: 'application/zip' }), nomeZip);
}

/* ------------------------------------------------------------------ *
 * Numeração em romanos
 * ------------------------------------------------------------------ */

/**
 * Romano de verdade, com a regra subtrativa: 4 é IV e não IIII, 9 é IX e não
 * VIIII. A tabela já traz os casos subtrativos como se fossem símbolos, que é
 * o jeito de resolver isso sem uma pilha de condições.
 */
const ROMANOS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function romano(n, maiusculo = true) {
  let resto = Math.max(1, Math.floor(n));
  let saida = '';
  for (const [valor, simbolo] of ROMANOS) {
    while (resto >= valor) { saida += simbolo; resto -= valor; }
  }
  return maiusculo ? saida : saida.toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Prévia de uma página — compartilhada por recortar e assinar
 * ------------------------------------------------------------------ */

/**
 * Desenha UMA página num canvas, para a pessoa ver onde está mexendo.
 *
 * Recortar às cegas, escrevendo margens em números, é como cortar papel de
 * olhos fechados: só dá para saber se acertou depois de baixar. Com a página
 * na tela, a moldura mostra o resultado antes.
 */
export async function renderizarPagina(arquivo, numero = 1, larguraAlvo = 520) {
  const J = await leitor();
  const doc = await J.getDocument({ data: await bytesDe(arquivo) }).promise;
  const pagina = await doc.getPage(Math.min(Math.max(1, numero), doc.numPages));

  const natural = pagina.getViewport({ scale: 1 });
  const vista = pagina.getViewport({ scale: larguraAlvo / natural.width });

  const cv = document.createElement('canvas');
  cv.width = Math.round(vista.width);
  cv.height = Math.round(vista.height);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  await pagina.render({ canvasContext: ctx, viewport: vista, canvas: cv }).promise;

  return { canvas: cv, paginas: doc.numPages, largura: natural.width, altura: natural.height };
}

/* ------------------------------------------------------------------ *
 * Recortar
 * ------------------------------------------------------------------ */

/**
 * Corta as margens. As sobras chegam em FRAÇÃO de cada lado, não em pontos:
 * assim a mesma escolha vale para páginas de tamanhos diferentes no mesmo
 * documento, e a moldura da tela — que trabalha em porcentagem — não precisa
 * converter nada.
 *
 * Mexe no CropBox e não no MediaBox de propósito: o conteúdo continua lá,
 * apenas fora da área visível, e um corte errado pode ser desfeito depois.
 */
export async function recortar(arquivo, sobras, texto) {
  const doc = await abrir(arquivo);
  const total = doc.getPageCount();
  const alvo = texto && texto.trim() ? new Set(lerIntervalos(texto, total)) : null;

  const { esq = 0, dir = 0, topo = 0, base = 0 } = sobras;
  if (esq + dir >= 0.95 || topo + base >= 0.95) {
    throw new Error('O corte não deixou quase nada de página. Diminua as margens.');
  }

  doc.getPages().forEach((p, i) => {
    if (alvo && !alvo.has(i + 1)) return;
    const caixa = p.getCropBox();
    p.setCropBox(
      caixa.x + caixa.width * esq,
      caixa.y + caixa.height * base,
      caixa.width * (1 - esq - dir),
      caixa.height * (1 - topo - base),
    );
  });
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Assinar
 * ------------------------------------------------------------------ */

/**
 * Coloca uma imagem — a assinatura desenhada ou fotografada — sobre a página.
 *
 * Isto NÃO é assinatura digital com certificado: é o equivalente a escrever à
 * caneta e digitalizar. Serve para o que a maioria das pessoas precisa, e a
 * tela diz isso com todas as letras, porque prometer validade jurídica que não
 * existe seria pior do que não ter a ferramenta.
 *
 * Posição e tamanho vêm em fração da página, pelo mesmo motivo do recorte.
 */
export async function assinar(arquivo, pngBytes, onde) {
  const doc = await abrir(arquivo);
  const imagem = await doc.embedPng(pngBytes);
  const total = doc.getPageCount();

  const numeros = onde.todas
    ? Array.from({ length: total }, (_, i) => i + 1)
    : [Math.min(Math.max(1, onde.pagina || 1), total)];

  for (const n of numeros) {
    const p = doc.getPage(n - 1);
    const { width, height } = p.getSize();
    const larg = width * (onde.largura || 0.28);
    const alt = larg * (imagem.height / imagem.width);

    p.drawImage(imagem, {
      x: width * onde.x,
      // A fração vem do topo, como na tela; o PDF conta do rodapé.
      y: height * (1 - onde.y) - alt,
      width: larg,
      height: alt,
    });
  }
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Comparar
 * ------------------------------------------------------------------ */

/**
 * Compara dois PDFs página a página, por pixel.
 *
 * Comparar o texto extraído acharia trocas de palavra, mas não veria carimbo
 * movido, assinatura acrescentada, tabela redesenhada nem logotipo trocado —
 * e é justamente isso que se procura ao conferir duas versões de um contrato.
 * Por pixel, qualquer mudança visível aparece.
 *
 * As duas páginas são desenhadas na MESMA largura antes da conta: um PDF
 * gerado com escala diferente acusaria o documento inteiro como alterado.
 */
export async function comparar(arquivoA, arquivoB, aoProgredir = () => {}) {
  const J = await leitor();
  const a = await J.getDocument({ data: await bytesDe(arquivoA) }).promise;
  const b = await J.getDocument({ data: await bytesDe(arquivoB) }).promise;
  const total = Math.max(a.numPages, b.numPages);
  const LARGURA = 700;

  async function desenhar(doc, n) {
    if (n > doc.numPages) return null;
    const pagina = await doc.getPage(n);
    const natural = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: LARGURA / natural.width });
    const cv = document.createElement('canvas');
    cv.width = LARGURA;
    cv.height = Math.round(vista.height);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    await pagina.render({ canvasContext: ctx, viewport: vista, canvas: cv }).promise;
    return cv;
  }

  const resultados = [];

  for (let n = 1; n <= total; n++) {
    const ca = await desenhar(a, n);
    const cb = await desenhar(b, n);
    aoProgredir(n / total, n, total);

    if (!ca || !cb) {
      resultados.push({ pagina: n, so: ca ? 'primeiro' : 'segundo', diferenca: 1 });
      continue;
    }

    const alturaComum = Math.min(ca.height, cb.height);
    const pa = ca.getContext('2d').getImageData(0, 0, LARGURA, alturaComum).data;
    const pb = cb.getContext('2d').getImageData(0, 0, LARGURA, alturaComum).data;

    const marca = document.createElement('canvas');
    marca.width = LARGURA;
    marca.height = cb.height;
    const mctx = marca.getContext('2d');
    mctx.drawImage(cb, 0, 0);
    const capa = mctx.getImageData(0, 0, LARGURA, alturaComum);

    let diferentes = 0;
    for (let i = 0; i < pa.length; i += 4) {
      // Soma dos três canais, com 30 de folga: o antisserrilhado do texto nunca
      // sai idêntico entre duas renderizações, e sem folga o documento inteiro
      // apareceria como diferente.
      const d = Math.abs(pa[i] - pb[i])
        + Math.abs(pa[i + 1] - pb[i + 1])
        + Math.abs(pa[i + 2] - pb[i + 2]);
      if (d > 30) {
        diferentes++;
        capa.data[i] = 244; capa.data[i + 1] = 63; capa.data[i + 2] = 94;
      }
    }
    mctx.putImageData(capa, 0, 0);

    resultados.push({
      pagina: n,
      diferenca: diferentes / (pa.length / 4),
      imagem: await new Promise((r) => marca.toBlob(r, 'image/png')),
    });
  }
  return resultados;
}

/* ------------------------------------------------------------------ *
 * Markdown
 * ------------------------------------------------------------------ */

/**
 * Texto com a estrutura recuperada pelo TAMANHO DA LETRA.
 *
 * O PDF não guarda "isto é um título": guarda letras com posição e corpo. Mas
 * título quase sempre é escrito maior que o corpo do texto, e é nisso que dá
 * para se apoiar. A referência é a MEDIANA dos tamanhos da página — não a
 * média, que um título gigante sozinho puxaria para cima, fazendo o próprio
 * título deixar de se destacar.
 */
export async function paraMarkdown(arquivo) {
  const J = await leitor();
  const doc = await J.getDocument({ data: await bytesDe(arquivo) }).promise;
  const saida = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();

    // Junta os pedaços em linhas, guardando o maior corpo de letra de cada uma.
    const linhas = [];
    let atual = null;
    for (const item of conteudo.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const corpo = Math.abs(item.transform[3]) || item.height || 0;
      const negrito = /bold|black|heavy/i.test(item.fontName || '');

      if (!atual || Math.abs(y - atual.y) > 2) {
        if (atual) linhas.push(atual);
        atual = { y, texto: '', corpo, negrito };
      }
      atual.texto += item.str;
      atual.corpo = Math.max(atual.corpo, corpo);
      atual.negrito = atual.negrito && negrito;
      if (item.hasEOL) { linhas.push(atual); atual = null; }
    }
    if (atual) linhas.push(atual);

    const uteis = linhas.filter((l) => l.texto.trim());
    if (!uteis.length) continue;

    // A referência é o tamanho em que está escrita a MAIOR QUANTIDADE DE TEXTO,
    // não a mediana das linhas. Numa página com quatro linhas, das quais duas
    // são títulos, a mediana cai em cima de um título — e aí o próprio título
    // vira a régua e deixa de se destacar. Contando caracteres, o corpo do
    // texto ganha sempre, porque é onde está o volume.
    const porTamanho = new Map();
    for (const l of uteis) {
      const chave = Math.round(l.corpo * 2) / 2;   // meio ponto de tolerância
      porTamanho.set(chave, (porTamanho.get(chave) || 0) + l.texto.trim().length);
    }
    let base = 1;
    let maior = -1;
    for (const [tamanho, letras] of porTamanho) {
      if (letras > maior) { maior = letras; base = tamanho; }
    }

    // O nível sai da ORDEM dos tamanhos, não de razões fixas. Num documento com
    // título de 30 e subtítulo de 18 sobre corpo de 12, as razões são 2,5 e 1,5
    // — qualquer corte fixo entre elas funciona neste documento e erra no
    // próximo. Ordenando, o maior é sempre #, o seguinte sempre ##.
    const niveis = new Map();
    [...porTamanho.keys()]
      .filter((t) => t > base * 1.08)
      .sort((x, y) => y - x)
      .forEach((t, i) => niveis.set(t, '#'.repeat(Math.min(3, i + 1))));

    for (const l of uteis) {
      const texto = l.texto.trim();
      const nivel = niveis.get(Math.round(l.corpo * 2) / 2);

      if (nivel) saida.push(nivel + ' ' + texto);
      else if (/^[•·▪◦-]\s+/.test(texto)) {
        saida.push('- ' + texto.replace(/^[•·▪◦-]\s+/, ''));
      } else if (/^\d+[.)]\s+/.test(texto)) saida.push(texto);
      else if (l.negrito) saida.push('**' + texto + '**');
      else saida.push(texto);
    }
    // Separador de página: ajuda quem for reler a saber de onde veio cada parte.
    if (n < doc.numPages) saida.push('---');
  }

  return saida.join('\n\n').replace(/\n{4,}/g, '\n\n\n');
}

/* ------------------------------------------------------------------ *
 * OCR
 * ------------------------------------------------------------------ */

let ocrPromise = null;
function ocrLib() {
  if (!ocrPromise) ocrPromise = import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm');
  return ocrPromise;
}

/**
 * Lê o texto de um PDF digitalizado e devolve um PDF PESQUISÁVEL.
 *
 * A página continua exatamente a mesma imagem de antes; o que entra é uma
 * camada de texto invisível por baixo, alinhada com o que está desenhado. É
 * assim que o documento passa a aceitar busca e cópia sem mudar de aparência.
 *
 * O modelo do idioma pesa uns 10 MB e é baixado na primeira vez — por isso
 * esta é a única ferramenta da página que avisa antes de começar.
 */
export async function ocr(arquivo, opcoes = {}, aoProgredir = () => {}) {
  const T = await ocrLib();
  const paginas = await paraImagens(
    arquivo,
    { escala: opcoes.escala || 2, tipo: 'png' },
    (f) => aoProgredir(f * 0.25, 'preparando'),
  );

  aoProgredir(0.25, 'baixando');
  const trabalhador = await T.createWorker(opcoes.idioma || 'por', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });

  try {
    const textos = [];
    const pdfs = [];

    for (let i = 0; i < paginas.length; i++) {
      const r = await trabalhador.recognize(paginas[i].blob, {}, { text: true, pdf: true });
      textos.push((r.data.text || '').trim());
      if (r.data.pdf) pdfs.push(new Uint8Array(r.data.pdf));
      aoProgredir(0.3 + ((i + 1) / paginas.length) * 0.7, 'lendo', i + 1, paginas.length);
    }

    // O tesseract devolve um PDF por página; juntar aqui evita entregar um zip
    // com dezenas de arquivos de uma página cada.
    const { PDFDocument } = await lib();
    const saida = await PDFDocument.create();
    for (const bytes of pdfs) {
      const parte = await PDFDocument.load(bytes);
      const copiadas = await saida.copyPages(parte, parte.getPageIndices());
      for (const p of copiadas) saida.addPage(p);
    }

    return {
      texto: textos.join('\n\n'),
      pdf: pdfs.length ? comoPdf(await saida.save()) : null,
    };
  } finally {
    await trabalhador.terminate();
  }
}

/* ------------------------------------------------------------------ *
 * Senha e reparo — MuPDF
 * ------------------------------------------------------------------ *
 * Estas três operações mexem no arquivo num nível que o pdf-lib não alcança:
 * criptografia de verdade e reconstrução de um arquivo quebrado. O MuPDF é uma
 * biblioteca de PDF completa compilada para WebAssembly, então tudo continua
 * acontecendo dentro do navegador.
 *
 * Ela é pesada — alguns megabytes — e por isso só é baixada quando uma destas
 * três ferramentas é usada de fato.
 */

let muPromise = null;
function mupdf() {
  if (!muPromise) muPromise = import('https://cdn.jsdelivr.net/npm/mupdf@1.28.1/dist/mupdf.js');
  return muPromise;
}

/** Abre pelo MuPDF, pedindo a senha quando o arquivo exigir. */
async function abrirMu(arquivo, senha) {
  const mu = await mupdf();
  const doc = mu.PDFDocument.openDocument(new Uint8Array(await bytesDe(arquivo)), 'application/pdf');

  if (doc.needsPassword()) {
    if (!senha) {
      const erro = new Error('Este PDF pede senha para abrir. Escreva a senha no campo acima.');
      erro.pedeSenha = true;
      throw erro;
    }
    if (!doc.authenticatePassword(senha)) {
      const erro = new Error('Senha incorreta.');
      erro.pedeSenha = true;
      throw erro;
    }
  }
  return { mu, doc };
}

/** O arquivo pede senha para ser aberto? A tela usa isso para mostrar o campo. */
export async function pedeSenha(arquivo) {
  try {
    const mu = await mupdf();
    const doc = mu.PDFDocument.openDocument(new Uint8Array(await bytesDe(arquivo)), 'application/pdf');
    return doc.needsPassword();
  } catch {
    return false;
  }
}

/**
 * Fecha o PDF com senha, em AES-256.
 *
 * AES-256 e não RC4: o RC4 de 40 bits que muitos programas antigos ainda usam
 * é quebrado em minutos por qualquer programa de recuperação. Uma senha que não
 * segura ninguém é pior do que nenhuma, porque passa uma sensação de proteção
 * que não existe.
 *
 * A mesma senha vai como "de usuário" e "de dono": senha de dono sozinha só
 * restringe permissões, e qualquer leitor decente ignora — o arquivo abre
 * normalmente. É a senha de usuário que realmente tranca.
 */
export async function proteger(arquivo, senha, senhaAtual) {
  const limpa = String(senha || '').trim();
  if (limpa.length < 4) throw new Error('A senha precisa de pelo menos 4 caracteres.');

  const { doc } = await abrirMu(arquivo, senhaAtual);
  const saida = doc.saveToBuffer(
    'encrypt=aes-256,user-password=' + limpa + ',owner-password=' + limpa,
  );
  return comoPdf(saida.asUint8Array());
}

/**
 * Tira a senha — de quem JÁ SABE a senha.
 *
 * Isto não quebra senha nenhuma: sem a senha certa o conteúdo é ilegível, e é
 * assim que tem que ser. Serve para quem recebe todo mês o mesmo extrato
 * trancado e quer guardar uma cópia aberta.
 */
export async function desbloquear(arquivo, senha) {
  const { doc } = await abrirMu(arquivo, senha);
  return comoPdf(doc.saveToBuffer('decrypt').asUint8Array());
}

/**
 * Reconstrói um PDF quebrado.
 *
 * O defeito mais comum é a tabela de referências cruzadas — o índice que diz
 * onde cada objeto começa — apontar para o lugar errado, o que acontece quando
 * um download é interrompido ou um pendrive é retirado no meio da gravação. O
 * MuPDF varre o arquivo inteiro atrás dos objetos e monta um índice novo.
 *
 * Não faz milagre: o que foi sobrescrito por zeros está perdido. Mas quase
 * sempre o conteúdo está lá e só o índice se perdeu.
 */
export async function reparar(arquivo, senha) {
  const { doc } = await abrirMu(arquivo, senha);
  const paginas = doc.countPages();
  if (!paginas) throw new Error('Não foi possível recuperar nenhuma página deste arquivo.');

  // garbage=compact joga fora objeto órfão e reescreve o índice do zero.
  const saida = doc.saveToBuffer('garbage=compact,compress').asUint8Array();
  return { blob: comoPdf(saida), paginas, bytes: saida.length };
}

/* ------------------------------------------------------------------ *
 * Estrutura do texto — base das conversões para Office
 * ------------------------------------------------------------------ */

/**
 * Lê o PDF e devolve as linhas com o nível de título já decidido.
 *
 * É a mesma leitura que o Markdown usa, separada aqui porque Word, Excel e
 * Markdown precisam exatamente do mesmo trabalho: o PDF guarda letras com
 * posição e corpo, e a estrutura tem que ser deduzida disso. Fazer essa dedução
 * três vezes daria três resultados diferentes para o mesmo arquivo.
 */
export async function estrutura(arquivo) {
  const J = await leitor();
  const doc = await J.getDocument({ data: await bytesDe(arquivo) }).promise;
  const paginas = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();

    const linhas = [];
    let atual = null;
    for (const item of conteudo.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const corpo = Math.abs(item.transform[3]) || item.height || 0;
      const negrito = /bold|black|heavy/i.test(item.fontName || '');

      if (!atual || Math.abs(y - atual.y) > 2) {
        if (atual) linhas.push(atual);
        atual = { y, x, texto: '', corpo, negrito, pedacos: [] };
      }
      atual.texto += item.str;
      atual.pedacos.push({ x, texto: item.str, largura: item.width || 0 });
      atual.corpo = Math.max(atual.corpo, corpo);
      atual.negrito = atual.negrito && negrito;
      if (item.hasEOL) { linhas.push(atual); atual = null; }
    }
    if (atual) linhas.push(atual);

    const uteis = linhas.filter((l) => l.texto.trim());
    if (!uteis.length) { paginas.push({ pagina: n, linhas: [] }); continue; }

    // A régua é o tamanho com mais CARACTERES, não a mediana das linhas: numa
    // página de poucas linhas a mediana cai em cima de um título, e aí o título
    // vira a própria régua e deixa de se destacar.
    const porTamanho = new Map();
    for (const l of uteis) {
      const chave = Math.round(l.corpo * 2) / 2;
      porTamanho.set(chave, (porTamanho.get(chave) || 0) + l.texto.trim().length);
    }
    let base = 1;
    let maior = -1;
    for (const [t, letras] of porTamanho) if (letras > maior) { maior = letras; base = t; }

    // O nível sai da ORDEM dos tamanhos: limiar fixo que separa 30 de 18 num
    // documento erra no próximo.
    const niveis = new Map();
    [...porTamanho.keys()].filter((t) => t > base * 1.08).sort((a, b) => b - a)
      .forEach((t, i) => niveis.set(t, Math.min(3, i + 1)));

    paginas.push({
      pagina: n,
      base,
      linhas: uteis.map((l) => ({
        texto: l.texto.trim(),
        corpo: l.corpo,
        negrito: l.negrito,
        x: l.x,
        y: l.y,
        pedacos: l.pedacos,
        nivel: niveis.get(Math.round(l.corpo * 2) / 2) || 0,
      })),
    });
  }
  return paginas;
}

/* ------------------------------------------------------------------ *
 * PDF para Word
 * ------------------------------------------------------------------ */

let docxPromise = null;
function libDocx() {
  if (!docxPromise) docxPromise = import('https://cdn.jsdelivr.net/npm/docx@9.0.2/+esm');
  return docxPromise;
}

/**
 * Gera um .docx editável a partir do texto do PDF.
 *
 * O que sai é um documento de VERDADE — com títulos, parágrafos e negrito — e
 * não uma foto da página dentro do Word. O que NÃO sai é o layout original:
 * colunas, tabelas desenhadas e posicionamento milimétrico se perdem, porque o
 * PDF não guarda essa informação, guarda só onde cada letra foi parar.
 *
 * Linhas seguidas do mesmo tamanho são juntadas num parágrafo só: no PDF cada
 * linha visual é um registro separado, e copiar isso para o Word produziria um
 * documento em que cada linha quebra sozinha e nada reflui ao editar.
 */
export async function paraWord(arquivo) {
  const D = await libDocx();
  const paginas = await estrutura(arquivo);
  const filhos = [];

  for (const p of paginas) {
    let acumulado = [];
    let negritoDoBloco = false;

    const fechar = () => {
      if (!acumulado.length) return;
      filhos.push(new D.Paragraph({
        children: [new D.TextRun({ text: acumulado.join(' '), bold: negritoDoBloco })],
        spacing: { after: 160 },
      }));
      acumulado = [];
      negritoDoBloco = false;
    };

    for (const l of p.linhas) {
      if (l.nivel) {
        fechar();
        filhos.push(new D.Paragraph({
          text: l.texto,
          heading: l.nivel === 1 ? D.HeadingLevel.HEADING_1
            : l.nivel === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
        }));
        continue;
      }
      if (/^[•·▪◦-]\s+/.test(l.texto)) {
        fechar();
        filhos.push(new D.Paragraph({
          text: l.texto.replace(/^[•·▪◦-]\s+/, ''),
          bullet: { level: 0 },
        }));
        continue;
      }
      if (!acumulado.length) negritoDoBloco = l.negrito;
      acumulado.push(l.texto);
    }
    fechar();

    if (p.pagina < paginas.length) {
      filhos.push(new D.Paragraph({ children: [new D.PageBreak()] }));
    }
  }

  if (!filhos.length) {
    throw new Error('Este PDF não tem texto — provavelmente é digitalizado. '
      + 'Passe pelo OCR primeiro e depois converta.');
  }

  const doc = new D.Document({ sections: [{ children: filhos }] });
  const bytes = await D.Packer.toBlob(doc);
  return bytes;
}

/* ------------------------------------------------------------------ *
 * PDF para Excel
 * ------------------------------------------------------------------ */

let xlsxPromise = null;
function libXlsx() {
  if (!xlsxPromise) xlsxPromise = import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  return xlsxPromise;
}

/**
 * Reconstrói as tabelas pela POSIÇÃO horizontal dos pedaços de texto.
 *
 * Um PDF não sabe o que é uma tabela: o que existe são textos em coordenadas.
 * Mas numa tabela as colunas se alinham, e é isso que dá para aproveitar —
 * agrupando os X que se repetem página abaixo, aparecem as colunas.
 *
 * A tolerância de 12 pontos existe porque texto centralizado ou alinhado à
 * direita numa célula não começa no mesmo X do cabeçalho, e exigir alinhamento
 * exato espalharia uma tabela de 4 colunas em 20.
 */
export async function paraExcel(arquivo) {
  const X = await libXlsx();
  const paginas = await estrutura(arquivo);
  const livro = X.utils.book_new();
  let alguma = false;

  for (const p of paginas) {
    if (!p.linhas.length) continue;

    // Onde as colunas começam: X que aparecem em muitas linhas diferentes.
    const contagem = new Map();
    for (const l of p.linhas) {
      for (const ped of l.pedacos) {
        if (!ped.texto.trim()) continue;
        const chave = Math.round(ped.x / 12) * 12;
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
      }
    }
    const colunas = [...contagem.entries()]
      .filter(([, quantas]) => quantas >= 2)
      .map(([x]) => x)
      .sort((a, b) => a - b);

    if (!colunas.length) continue;

    const linhas = p.linhas.map((l) => {
      const celulas = new Array(colunas.length).fill('');
      for (const ped of l.pedacos) {
        if (!ped.texto.trim()) continue;
        // A coluna mais próxima à esquerda do pedaço.
        let melhor = 0;
        for (let i = 0; i < colunas.length; i++) if (ped.x >= colunas[i] - 12) melhor = i;
        celulas[melhor] = (celulas[melhor] + ' ' + ped.texto).trim();
      }
      return celulas;
    }).filter((c) => c.some((v) => v));

    if (!linhas.length) continue;
    const aba = X.utils.aoa_to_sheet(linhas);
    X.utils.book_append_sheet(livro, aba, 'Página ' + p.pagina);
    alguma = true;
  }

  if (!alguma) {
    throw new Error('Não encontrei nada em formato de tabela neste PDF. '
      + 'Se ele for digitalizado, passe pelo OCR primeiro.');
  }

  const bytes = X.write(livro, { bookType: 'xlsx', type: 'array' });
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ------------------------------------------------------------------ *
 * PDF para PowerPoint
 * ------------------------------------------------------------------ */

let pptxPromise = null;
function libPptx() {
  if (!pptxPromise) pptxPromise = import('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/+esm');
  return pptxPromise;
}

const paraBase64 = (blob) => new Promise((res) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.readAsDataURL(blob);
});

/**
 * Cada página vira um slide, com a página desenhada por inteiro.
 *
 * Aqui a imagem é a resposta certa e não uma limitação: quem converte PDF para
 * apresentação quer projetar o que já está pronto, e reconstruir o slide em
 * caixas de texto editáveis erraria posição, fonte e cor em todas elas.
 */
export async function paraPowerPoint(arquivo, aoProgredir = () => {}) {
  const Pptx = await libPptx();
  const imagens = await paraImagens(arquivo, { escala: 2, tipo: 'png' }, aoProgredir);
  const info = await informacoes(arquivo);

  const pres = new (Pptx.default || Pptx)();
  // O slide fica com a proporção da página: forçar 16:9 numa página A4 em pé
  // deixaria duas tarjas enormes nas laterais.
  const proporcao = info.largura / info.altura;
  const largura = 10;
  const altura = Number((largura / proporcao).toFixed(2));
  pres.defineLayout({ name: 'PAGINA', width: largura, height: altura });
  pres.layout = 'PAGINA';

  for (const img of imagens) {
    const slide = pres.addSlide();
    slide.addImage({ data: await paraBase64(img.blob), x: 0, y: 0, w: largura, h: altura });
  }

  const saida = await pres.write({ outputType: 'blob' });
  return saida;
}

/* ------------------------------------------------------------------ *
 * Office para PDF
 * ------------------------------------------------------------------ */

/** Quebra o texto em linhas que cabem na largura, medindo na fonte de verdade. */
function quebrarLinhas(texto, fonte, tamanho, largura) {
  const linhas = [];
  for (const paragrafo of String(texto).split('\n')) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (!palavras.length) { linhas.push(''); continue; }
    let atual = '';
    for (const palavra of palavras) {
      const teste = atual ? atual + ' ' + palavra : palavra;
      if (fonte.widthOfTextAtSize(teste, tamanho) <= largura) { atual = teste; continue; }
      if (atual) linhas.push(atual);
      // Palavra sozinha maior que a linha (um link comprido, por exemplo):
      // corta no meio, senão ela vaza para fora da margem.
      atual = palavra;
      while (fonte.widthOfTextAtSize(atual, tamanho) > largura && atual.length > 1) {
        let corte = atual.length - 1;
        while (corte > 1 && fonte.widthOfTextAtSize(atual.slice(0, corte), tamanho) > largura) corte--;
        linhas.push(atual.slice(0, corte));
        atual = atual.slice(corte);
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

/**
 * As fontes padrão do PDF só conhecem o alfabeto ocidental. Um caractere fora
 * disso derruba a geração inteira com um erro incompreensível, então os poucos
 * que aparecem de verdade são traduzidos e o resto vira interrogação — um
 * documento com um símbolo errado é melhor do que nenhum documento.
 */
function limparTexto(t) {
  return String(t)
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    // Fora do Latin-1 ainda existem os extras do WinAnsi, que as fontes padrao
    // do PDF conhecem: marcador, travessao, moeda, marca registrada. Cortar
    // esses junto com o resto transformava o marcador de uma lista num ponto
    // de interrogacao — foi assim que este caso apareceu no teste.
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€‚ƒ„†‡ˆ‰Š‹ŒŽ•–—˜™š›œžŸ]/g, '?');
}

/**
 * Monta um PDF a partir de blocos { texto, tamanho, negrito, recuo }.
 * É o miolo comum de Word→PDF, Excel→PDF e PowerPoint→PDF.
 */
async function pdfDeBlocos(blocos, opcoes = {}) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const forte = await doc.embedFont(StandardFonts.HelveticaBold);

  const LARG = opcoes.largura || 595.28;    // A4 em pé
  const ALT = opcoes.altura || 841.89;
  const MARGEM = opcoes.margem ?? 56;
  const util = LARG - MARGEM * 2;

  let pagina = doc.addPage([LARG, ALT]);
  let y = ALT - MARGEM;

  const novaPagina = () => { pagina = doc.addPage([LARG, ALT]); y = ALT - MARGEM; };

  for (const bloco of blocos) {
    if (bloco.quebra) { novaPagina(); continue; }

    const tamanho = bloco.tamanho || 11;
    const fonte = bloco.negrito ? forte : normal;
    const recuo = bloco.recuo || 0;
    const alturaLinha = tamanho * 1.45;
    const linhas = quebrarLinhas(limparTexto(bloco.texto), fonte, tamanho, util - recuo);

    if (bloco.antes) y -= bloco.antes;

    for (const linha of linhas) {
      if (y - alturaLinha < MARGEM) novaPagina();
      if (linha) {
        pagina.drawText(linha, {
          x: MARGEM + recuo,
          y: y - tamanho,
          size: tamanho,
          font: fonte,
          color: rgb(0.08, 0.09, 0.13),
        });
      }
      y -= alturaLinha;
    }
    y -= bloco.depois ?? tamanho * 0.5;
  }

  return comoPdf(await doc.save());
}

let mammothPromise = null;
/** O mammoth só publica build de navegador em UMD; o ESM do CDN vem quebrado. */
function libMammoth() {
  if (!mammothPromise) {
    mammothPromise = new Promise((res, rej) => {
      if (self.mammoth) return res(self.mammoth);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
      s.onload = () => res(self.mammoth);
      s.onerror = () => rej(new Error('Não foi possível carregar o conversor de Word.'));
      document.head.append(s);
    });
  }
  return mammothPromise;
}

/**
 * Word para PDF, passando pelo HTML.
 *
 * O texto sai como TEXTO no PDF, não como imagem: continua dando para buscar,
 * copiar e selecionar. O preço é o layout — margens exatas, cabeçalho, rodapé e
 * posicionamento de imagem não sobrevivem, porque o que se lê do .docx é a
 * estrutura do conteúdo, não a página montada.
 */
export async function deWord(arquivo) {
  const mammoth = await libMammoth();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await bytesDe(arquivo) });
  const corpo = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html').body.firstChild;

  const blocos = [];
  for (const el of corpo.children) {
    const texto = (el.textContent || '').trim();
    if (!texto) continue;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1') blocos.push({ texto, tamanho: 21, negrito: true, antes: 14, depois: 8 });
    else if (tag === 'h2') blocos.push({ texto, tamanho: 16.5, negrito: true, antes: 12, depois: 6 });
    else if (tag === 'h3') blocos.push({ texto, tamanho: 13.5, negrito: true, antes: 10, depois: 5 });
    else if (tag === 'ul' || tag === 'ol') {
      [...el.querySelectorAll('li')].forEach((li, i) => {
        const marcador = tag === 'ol' ? (i + 1) + '. ' : '•  ';
        blocos.push({ texto: marcador + li.textContent.trim(), tamanho: 11, recuo: 16, depois: 3 });
      });
    } else if (tag === 'table') {
      for (const tr of el.querySelectorAll('tr')) {
        const celulas = [...tr.children].map((td) => td.textContent.trim()).filter(Boolean);
        if (celulas.length) blocos.push({ texto: celulas.join('   |   '), tamanho: 10, depois: 2 });
      }
      blocos.push({ texto: '', depois: 8 });
    } else blocos.push({ texto, tamanho: 11, depois: 6 });
  }

  if (!blocos.length) throw new Error('Este arquivo do Word não tem texto para converter.');
  return pdfDeBlocos(blocos);
}

/** Excel para PDF: cada aba vira uma sequência de linhas, em folha deitada. */
export async function deExcel(arquivo) {
  const X = await libXlsx();
  const livro = X.read(await bytesDe(arquivo), { type: 'array' });
  const blocos = [];

  livro.SheetNames.forEach((nome, i) => {
    const linhas = X.utils.sheet_to_json(livro.Sheets[nome], { header: 1, blankrows: false });
    if (!linhas.length) return;
    if (i > 0) blocos.push({ quebra: true });

    blocos.push({ texto: nome, tamanho: 16, negrito: true, depois: 10 });
    linhas.forEach((linha, n) => {
      const celulas = linha.map((c) => (c === null || c === undefined ? '' : String(c)));
      if (!celulas.some((c) => c.trim())) return;
      blocos.push({
        texto: celulas.join('   |   '),
        tamanho: 9.5,
        // A primeira linha costuma ser o cabeçalho, e destacá-la é o que torna
        // a folha legível sem as bordas que o PDF não tem.
        negrito: n === 0,
        depois: 2,
      });
    });
  });

  if (!blocos.length) throw new Error('Esta planilha está vazia.');
  // Deitada: planilha é larga, e em pé as colunas se atropelam.
  return pdfDeBlocos(blocos, { largura: 841.89, altura: 595.28, margem: 40 });
}

/**
 * PowerPoint para PDF.
 *
 * Um .pptx é um zip de XML. Dá para ler o texto de cada slide com segurança,
 * mas não para redesenhar o slide como ele aparece no PowerPoint: posição,
 * tema, fonte, animação e imagem de fundo estão espalhados por vários arquivos
 * e dependem do tema aplicado. O que sai é um PDF com o CONTEÚDO de cada
 * slide, um por página — e a tela diz isso antes de converter.
 */
export async function dePowerPoint(arquivo) {
  const { unzipSync, strFromU8 } = await zipador();
  const dentro = unzipSync(new Uint8Array(await bytesDe(arquivo)));

  const nomes = Object.keys(dentro)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  if (!nomes.length) throw new Error('Não encontrei slides neste arquivo. Ele é mesmo um .pptx?');

  const blocos = [];
  nomes.forEach((nome, i) => {
    if (i > 0) blocos.push({ quebra: true });
    const xml = strFromU8(dentro[nome]);

    // <a:p> é um parágrafo e <a:t> são os pedaços de texto dentro dele. Juntar
    // por parágrafo evita que uma frase quebrada em três trechos — o que
    // acontece a cada mudança de formatação — vire três linhas soltas.
    const paragrafos = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((m) =>
      [...m[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((t) => t[1])
        .join('')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim(),
    ).filter(Boolean);

    blocos.push({ texto: 'Slide ' + (i + 1), tamanho: 9, depois: 12 });
    if (!paragrafos.length) {
      blocos.push({ texto: '(slide sem texto)', tamanho: 11, depois: 6 });
      return;
    }
    // O primeiro parágrafo é quase sempre o título do slide.
    blocos.push({ texto: paragrafos[0], tamanho: 20, negrito: true, depois: 14 });
    for (const p of paragrafos.slice(1)) {
      blocos.push({ texto: '•  ' + p, tamanho: 12.5, recuo: 14, depois: 6 });
    }
  });

  return pdfDeBlocos(blocos, { largura: 841.89, altura: 595.28, margem: 56 });
}

/* ------------------------------------------------------------------ *
 * Resumir e traduzir — IA do próprio navegador
 * ------------------------------------------------------------------ *
 * O Chrome traz modelos de linguagem que rodam NO APARELHO, sem mandar nada
 * para lugar nenhum. É o único jeito de ter resumo e tradução aqui sem quebrar
 * a promessa do site: qualquer serviço de IA na nuvem receberia o documento
 * inteiro, e documento é justamente o que as pessoas menos querem entregar.
 *
 * O preço é que só funciona em navegador que tenha esses modelos. Quando não
 * tem, a tela diz exatamente isso em vez de falhar sem explicação.
 */

export function recursosDeIA() {
  return {
    resumir: typeof self !== 'undefined' && 'Summarizer' in self,
    traduzir: typeof self !== 'undefined' && 'Translator' in self,
  };
}

/**
 * Divide o texto em pedaços que cabem num pedido só.
 *
 * O modelo tem teto de entrada, e um contrato de trinta páginas passa dele com
 * folga. O corte é feito em parágrafo inteiro, nunca no meio de uma frase: um
 * pedaço que começa no meio de uma oração faz o modelo resumir errado.
 */
function emPedacos(texto, teto = 3500) {
  const paragrafos = String(texto).split(/\n{2,}/);
  const pedacos = [];
  let atual = '';

  for (const p of paragrafos) {
    if ((atual + '\n\n' + p).length > teto && atual) { pedacos.push(atual); atual = p; }
    else atual = atual ? atual + '\n\n' + p : p;
  }
  if (atual.trim()) pedacos.push(atual);
  return pedacos;
}


/** Idiomas oferecidos. A lista é curta de propósito: são os pares que o modelo local cobre bem. */
const NOMES_DE_IDIOMA = {
  pt: 'português', en: 'inglês', es: 'espanhol',
  fr: 'francês', de: 'alemão', it: 'italiano', ja: 'japonês',
};

export const IDIOMAS = [
  ['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol'],
  ['fr', 'Francês'], ['de', 'Alemão'], ['it', 'Italiano'], ['ja', 'Japonês'],
];


/** Texto solto vira PDF legível — usado pela tradução e pelo resumo. */
export async function textoParaPdf(texto, titulo) {
  const blocos = [];
  if (titulo) blocos.push({ texto: titulo, tamanho: 18, negrito: true, depois: 14 });
  for (const p of String(texto).split(/\n{2,}/)) {
    const limpo = p.trim();
    if (limpo) blocos.push({ texto: limpo, tamanho: 11, depois: 8 });
  }
  if (!blocos.length) throw new Error('Não há texto para gerar o PDF.');
  return pdfDeBlocos(blocos);
}

/* ------------------------------------------------------------------ *
 * PDF/A — o formato de arquivamento
 * ------------------------------------------------------------------ */

/**
 * Monta um perfil de cor sRGB no formato ICC, byte a byte.
 *
 * PDF/A exige que o arquivo carregue dentro de si o perfil de cor com que foi
 * feito — é o que garante que daqui a vinte anos as cores ainda signifiquem a
 * mesma coisa. Baixar um perfil pronto de terceiros a cada conversão seria uma
 * dependência de rede no meio de uma ferramenta que promete funcionar offline,
 * então ele é construído aqui: são valores fixos e conhecidos do sRGB.
 *
 * Os XYZ estão adaptados para o iluminante D50 porque é o que o ICC usa como
 * espaço de conexão — os números do sRGB que se vê em tabela costumam estar em
 * D65 e não servem direto.
 */
function perfilSRGB() {
  const enc = new TextEncoder();
  const s15 = (v) => Math.round(v * 65536);          // s15Fixed16

  const tagXYZ = (x, y, z) => {
    const b = new DataView(new ArrayBuffer(20));
    enc.encodeInto('XYZ ', new Uint8Array(b.buffer, 0, 4));
    b.setInt32(8, s15(x)); b.setInt32(12, s15(y)); b.setInt32(16, s15(z));
    return new Uint8Array(b.buffer);
  };

  // Curva com um único valor = gama. 2,2 em u8Fixed8 é 0x0233.
  const tagCurva = () => {
    const b = new DataView(new ArrayBuffer(14));
    enc.encodeInto('curv', new Uint8Array(b.buffer, 0, 4));
    b.setUint32(8, 1);
    b.setUint16(12, 0x0233);
    return new Uint8Array(b.buffer);
  };

  const tagTexto = (txt) => {
    const bytes = enc.encode(txt);
    const out = new Uint8Array(8 + bytes.length + 1);
    out.set(enc.encode('text'), 0);
    out.set(bytes, 8);
    return out;
  };

  // 'desc' do ICC v2 tem três cópias do nome (ascii, unicode e macintosh).
  const tagDesc = (txt) => {
    const a = enc.encode(txt + '\0');
    const total = 12 + a.length + 8 + 2 + 1 + 67;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    out.set(enc.encode('desc'), 0);
    dv.setUint32(8, a.length);
    out.set(a, 12);
    return out;
  };

  const tags = [
    ['desc', tagDesc('sRGB IEC61966-2.1')],
    ['wtpt', tagXYZ(0.9642, 1.0, 0.8249)],
    ['rXYZ', tagXYZ(0.4360, 0.2225, 0.0139)],
    ['gXYZ', tagXYZ(0.3851, 0.7169, 0.0971)],
    ['bXYZ', tagXYZ(0.1431, 0.0606, 0.7139)],
    ['rTRC', tagCurva()],
    ['gTRC', tagCurva()],
    ['bTRC', tagCurva()],
    ['cprt', tagTexto('Perfil sRGB de dominio publico')],
  ];

  const CABECALHO = 128;
  const tabela = 4 + tags.length * 12;
  let posicao = CABECALHO + tabela;

  const colocados = tags.map(([sig, dados]) => {
    const p = posicao;
    // Cada tag começa em múltiplo de 4: o ICC exige alinhamento.
    posicao += dados.length + ((4 - (dados.length % 4)) % 4);
    return { sig, dados, p };
  });

  const total = posicao;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);

  dv.setUint32(0, total);
  buf.set(enc.encode('mntr'), 12);        // classe: monitor
  buf.set(enc.encode('RGB '), 16);
  buf.set(enc.encode('XYZ '), 20);
  dv.setUint32(8, 0x02100000);            // versão 2.1
  buf.set(enc.encode('acsp'), 36);
  dv.setInt32(68, s15(0.9642));           // iluminante D50
  dv.setInt32(72, s15(1.0));
  dv.setInt32(76, s15(0.8249));

  dv.setUint32(CABECALHO, tags.length);
  colocados.forEach(({ sig, dados, p }, i) => {
    const base = CABECALHO + 4 + i * 12;
    buf.set(enc.encode(sig), base);
    dv.setUint32(base + 4, p);
    dv.setUint32(base + 8, dados.length);
    buf.set(dados, p);
  });

  return buf;
}

/** O XMP que declara, dentro do arquivo, que ele é um PDF/A. */
function xmpDePdfA(titulo, quando) {
  const data = quando.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const escapar = (t) => String(t).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>1</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapar(titulo)}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>EditorBG</xmp:CreatorTool>
   <xmp:CreateDate>${data}</xmp:CreateDate>
   <xmp:ModifyDate>${data}</xmp:ModifyDate>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Converte para PDF/A-1b, o formato de arquivamento de longo prazo.
 *
 * A conversão desenha cada página como imagem antes de remontar o arquivo. Isso
 * resolve de uma vez a exigência mais difícil do PDF/A — toda fonte usada tem
 * que estar embutida no arquivo — porque numa página desenhada não há fonte
 * nenhuma. O preço é o mesmo da compressão: o texto deixa de ser texto, e não
 * dá mais para buscar nem copiar.
 *
 * O arquivo também precisa: carregar o perfil de cor com que foi feito
 * (OutputIntent), declarar em XMP que é PDF/A, e ser gravado com tabela de
 * referências clássica — PDF/A-1 não aceita os fluxos de objeto que os PDFs
 * modernos usam para ficar menores.
 */
export async function paraPdfA(arquivo, opcoes = {}, aoProgredir = () => {}) {
  const { PDFDocument, PDFName, PDFString } = await lib();
  const paginas = await paraImagens(arquivo, { escala: opcoes.escala || 2, tipo: 'jpeg' }, aoProgredir);

  const doc = await PDFDocument.create();
  for (const { blob } of paginas) {
    const imagem = await doc.embedJpg(await blob.arrayBuffer());
    const p = doc.addPage([imagem.width, imagem.height]);
    p.drawImage(imagem, { x: 0, y: 0, width: imagem.width, height: imagem.height });
  }

  const titulo = semExtensao(arquivo.name);
  const agora = new Date();
  doc.setTitle(titulo);
  doc.setProducer('EditorBG');
  doc.setCreator('EditorBG');
  doc.setCreationDate(agora);
  doc.setModificationDate(agora);

  const icc = perfilSRGB();
  const fluxoIcc = doc.context.stream(icc, { N: 3 });
  const refIcc = doc.context.register(fluxoIcc);

  const intencao = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: refIcc,
  });
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([intencao]));

  const xmp = xmpDePdfA(titulo, agora);
  const fluxoXmp = doc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(fluxoXmp));

  // Sem fluxos de objeto: o PDF/A-1 exige a tabela de referências antiga.
  return comoPdf(await doc.save({ useObjectStreams: false }));
}

/* ------------------------------------------------------------------ *
 * HTML para PDF
 * ------------------------------------------------------------------ */

/** Lê HTML e devolve os blocos que o montador de PDF entende. */
function blocosDoHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Fora o conteúdo, o resto da página é ruído: script, estilo e menu virariam
  // parágrafos de lixo no PDF.
  for (const fora of doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,svg,iframe')) {
    fora.remove();
  }
  const raiz = doc.querySelector('article, main') || doc.body;
  const blocos = [];

  const titulos = { h1: 21, h2: 17, h3: 14.5, h4: 12.5, h5: 11.5, h6: 11 };

  const andar = (el) => {
    for (const filho of el.children) {
      const tag = filho.tagName.toLowerCase();
      const texto = (filho.textContent || '').replace(/\s+/g, ' ').trim();

      if (titulos[tag]) {
        if (texto) blocos.push({ texto, tamanho: titulos[tag], negrito: true, antes: 12, depois: 6 });
      } else if (tag === 'ul' || tag === 'ol') {
        [...filho.querySelectorAll(':scope > li')].forEach((li, i) => {
          const t = (li.textContent || '').replace(/\s+/g, ' ').trim();
          if (t) blocos.push({ texto: (tag === 'ol' ? (i + 1) + '. ' : '•  ') + t, tamanho: 11, recuo: 16, depois: 3 });
        });
      } else if (tag === 'table') {
        for (const tr of filho.querySelectorAll('tr')) {
          const celulas = [...tr.children].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
          if (celulas.some(Boolean)) blocos.push({ texto: celulas.join('   |   '), tamanho: 10, depois: 2 });
        }
        blocos.push({ texto: '', depois: 8 });
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'pre') {
        if (texto) blocos.push({ texto, tamanho: 11, recuo: tag === 'blockquote' ? 18 : 0, depois: 7 });
      } else if (filho.children.length) {
        andar(filho);   // div, section e afins: desce até achar o conteúdo
      } else if (texto) {
        blocos.push({ texto, tamanho: 11, depois: 6 });
      }
    }
  };
  andar(raiz);
  return blocos;
}

/**
 * Converte HTML em PDF.
 *
 * Aceita o CÓDIGO da página, colado, e não um endereço. A diferença não é
 * capricho: para ler um site de dentro do navegador, aquele site precisa
 * autorizar a leitura por outro domínio, e praticamente nenhum autoriza. Quem
 * faz isso por endereço tem um servidor buscando a página — que é justamente o
 * que este site não tem.
 *
 * No navegador, "salvar como PDF" pela impressão do próprio navegador continua
 * sendo o melhor caminho para uma página na internet. Isto aqui serve para
 * HTML que você já tem em mãos.
 */
export async function deHtml(html, titulo) {
  const limpo = String(html || '').trim();
  if (!limpo) throw new Error('Cole o código HTML no campo acima.');

  const blocos = blocosDoHtml(limpo);
  if (!blocos.length) throw new Error('Não encontrei texto neste HTML.');
  if (titulo) blocos.unshift({ texto: titulo, tamanho: 22, negrito: true, depois: 16 });
  return pdfDeBlocos(blocos);
}

/* ------------------------------------------------------------------ *
 * Ocultar (tarjar)
 * ------------------------------------------------------------------ */

/**
 * Tarja informação sensível de forma que ela deixe de existir.
 *
 * ISTO É O PONTO INTEIRO DA FERRAMENTA: desenhar um retângulo preto por cima
 * não esconde nada. O texto continua no arquivo, embaixo, e qualquer pessoa o
 * recupera selecionando e copiando — é assim que vazam documentos "tarjados"
 * de tribunal e de empresa.
 *
 * Aqui a página é redesenhada como imagem antes de a tarja ser pintada. Numa
 * imagem não existe texto por baixo: o que ficou embaixo da tarja foi embora
 * junto com a camada de texto, e não há o que recuperar.
 *
 * O preço, inevitável, é que o documento inteiro deixa de ser pesquisável.
 */
export async function ocultar(arquivo, tarjas, aoProgredir = () => {}) {
  if (!tarjas || !tarjas.length) throw new Error('Marque pelo menos uma área para ocultar.');

  const { PDFDocument } = await lib();
  const paginas = await paraImagens(arquivo, { escala: 2, tipo: 'png' }, aoProgredir);
  const doc = await PDFDocument.create();

  for (let i = 0; i < paginas.length; i++) {
    const bitmap = await createImageBitmap(paginas[i].blob);
    const cv = document.createElement('canvas');
    cv.width = bitmap.width;
    cv.height = bitmap.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    ctx.fillStyle = '#000000';
    for (const t of tarjas) {
      if (t.pagina !== i + 1) continue;
      ctx.fillRect(
        Math.round(t.x * cv.width), Math.round(t.y * cv.height),
        Math.round(t.w * cv.width), Math.round(t.h * cv.height),
      );
    }

    const jpg = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    const imagem = await doc.embedJpg(await jpg.arrayBuffer());
    const p = doc.addPage([imagem.width / 2, imagem.height / 2]);
    p.drawImage(imagem, { x: 0, y: 0, width: imagem.width / 2, height: imagem.height / 2 });
  }
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Editar: escrever sobre a página
 * ------------------------------------------------------------------ */

/**
 * Escreve textos novos sobre o PDF, sem tocar no que já estava lá.
 *
 * Posição e tamanho vêm em fração da página, como no recorte e na assinatura:
 * a tela trabalha em porcentagem, e a mesma anotação vale para páginas de
 * tamanhos diferentes no mesmo documento.
 */
export async function editar(arquivo, itens) {
  if (!itens || !itens.length) throw new Error('Clique na página para escrever alguma coisa.');

  const { StandardFonts, rgb } = await lib();
  const doc = await abrir(arquivo);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const forte = await doc.embedFont(StandardFonts.HelveticaBold);
  const total = doc.getPageCount();

  for (const item of itens) {
    const n = Math.min(Math.max(1, item.pagina || 1), total);
    const p = doc.getPage(n - 1);
    const { width, height } = p.getSize();
    const fonte = item.negrito ? forte : normal;
    const corpo = Math.max(6, (item.tamanho || 0.025) * height);
    const cor = item.cor || { r: 0.05, g: 0.06, b: 0.09 };

    p.drawText(limparTexto(item.texto), {
      x: width * item.x,
      // A fração vem do topo, como na tela; o PDF conta a partir do rodapé.
      y: height * (1 - item.y) - corpo,
      size: corpo,
      font: fonte,
      color: rgb(cor.r, cor.g, cor.b),
    });
  }
  return comoPdf(await doc.save());
}

/* ------------------------------------------------------------------ *
 * Formulários
 * ------------------------------------------------------------------ */

/** Lê os campos preenchíveis do PDF, para a tela montar um formulário igual. */
/**
 * Que tipo de campo é este.
 *
 * A checagem é pelos MÉTODOS que o campo tem, e não pelo nome da classe. O
 * pacote do pdf-lib vem minificado: lá dentro `PDFTextField` virou uma letra
 * solta, e `campo.constructor.name` devolve essa letra. Foi assim que todos os
 * campos apareceram como "outro" e o preenchimento não fez nada — sem erro
 * nenhum, porque tecnicamente rodou.
 */
function tipoDoCampo(campo) {
  if (typeof campo.setText === 'function') return 'texto';
  if (typeof campo.isChecked === 'function') return 'caixa';
  if (typeof campo.getOptions === 'function') {
    // Lista e escolha se distinguem pelo que getSelected devolve: a lista
    // devolve um array, o grupo de opções devolve um valor só.
    try {
      return Array.isArray(campo.getSelected()) ? 'lista' : 'escolha';
    } catch {
      return 'lista';
    }
  }
  return 'outro';
}

export async function camposDoFormulario(arquivo) {
  const doc = await abrir(arquivo);
  const form = doc.getForm();

  return form.getFields().map((campo) => {
    const nome = campo.getName();
    const tipo = tipoDoCampo(campo);

    try {
      if (tipo === 'texto') return { nome, tipo, valor: campo.getText() || '' };
      if (tipo === 'caixa') return { nome, tipo, valor: campo.isChecked() };
      if (tipo === 'lista') {
        return { nome, tipo, opcoes: campo.getOptions(), valor: (campo.getSelected() || [])[0] || '' };
      }
      if (tipo === 'escolha') {
        return { nome, tipo, opcoes: campo.getOptions(), valor: campo.getSelected() || '' };
      }
    } catch {
      // Campo declarado mas sem valor legível: entra como texto vazio em vez de
      // desaparecer do formulário.
      return { nome, tipo: tipo === 'outro' ? 'outro' : 'texto', valor: '' };
    }
    return { nome, tipo: 'outro' };
  });
}

/**
 * Preenche e, se pedirem, achata.
 *
 * Achatar transforma o preenchimento em parte do desenho da página: ninguém
 * consegue mais apagar nem alterar o que foi escrito. É o que se quer ao
 * devolver um formulário assinado; é o que NÃO se quer se o documento ainda vai
 * passar por outra pessoa para completar.
 */
export async function preencherFormulario(arquivo, valores, achatar) {
  const doc = await abrir(arquivo);
  const form = doc.getForm();
  let mexidos = 0;

  for (const campo of form.getFields()) {
    const nome = campo.getName();
    if (!(nome in valores)) continue;
    const valor = valores[nome];
    const tipo = tipoDoCampo(campo);

    try {
      if (tipo === 'texto') campo.setText(String(valor));
      else if (tipo === 'caixa') { if (valor) campo.check(); else campo.uncheck(); }
      else if (tipo === 'lista' || tipo === 'escolha') { if (valor) campo.select(String(valor)); }
      else continue;
      mexidos++;
    } catch {
      // Campo com restrição que o valor não atende. Segue para os outros em vez
      // de derrubar o preenchimento inteiro por causa de um.
    }
  }

  if (achatar) form.flatten();
  return { blob: comoPdf(await doc.save()), mexidos };
}

/* ------------------------------------------------------------------ *
 * Digitalizar
 * ------------------------------------------------------------------ */

/**
 * Fotos de documento viram um PDF, com o contraste corrigido.
 *
 * Foto de papel tirada à mão quase nunca sai legível de primeira: sombra da
 * própria mão, papel acinzentado, letra apagada. O ajuste de níveis e de
 * nitidez é o que separa um PDF que dá para ler de um borrão — e é o mesmo
 * motor da ferramenta de melhorar qualidade, então não há código novo para
 * manter aqui.
 */
export async function digitalizar(imagens, opcoes = {}, aoProgredir = () => {}) {
  if (!imagens || !imagens.length) throw new Error('Tire pelo menos uma foto.');

  const M = await import('./melhorar.js');
  const prontas = [];

  for (let i = 0; i < imagens.length; i++) {
    const bitmap = await createImageBitmap(imagens[i]);

    const canvas = opcoes.realcar === false
      ? bitmap
      : M.rapido(bitmap, {
        niveis: true,
        ruido: 0.35,
        nitidez: 55,
        vibracao: opcoes.cor === false ? -100 : 0,   // documento em preto e branco
      });

    const blob = await new Promise((r) => {
      const cv = canvas.getContext ? canvas : (() => {
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
      })();
      cv.toBlob(r, 'image/jpeg', 0.9);
    });

    prontas.push(new File([blob], 'pagina-' + (i + 1) + '.jpg', { type: 'image/jpeg' }));
    aoProgredir((i + 1) / imagens.length, i + 1, imagens.length);
  }

  return deImagens(prontas, { margem: 0 });
}

/* ------------------------------------------------------------------ *
 * Resumo sem depender de modelo nenhum
 * ------------------------------------------------------------------ *
 * POR QUE NÃO USA IA: um resumo que só funciona no Chrome novo, e só depois de
 * baixar centenas de megabytes, não é uma ferramenta — é uma promessa com
 * asterisco. O método abaixo é o clássico de extração: escolher as frases mais
 * representativas do próprio texto. Roda em qualquer navegador, em qualquer
 * idioma, na hora, sem baixar nada e sem inventar uma linha sequer.
 *
 * A diferença honesta para um modelo de linguagem: ele reescreveria o texto com
 * palavras próprias; este seleciona as frases que já estão lá. Em documento —
 * contrato, relatório, ata — selecionar costuma ser até melhor, porque nada é
 * parafraseado errado.
 */

/* Palavras que aparecem em tudo e não dizem nada sobre o assunto. Sem tirá-las,
   "de", "que" e "para" dominam a contagem e toda frase longa ganha. */
const VAZIAS = new Set((
  'a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre '
  + 'e ou mas que se como quando onde porque pois entao ja nao sim tambem muito mais menos '
  + 'ao aos à às pelo pela pelos pelas num numa dum duma este esta estes estas esse essa '
  + 'esses essas aquele aquela aqueles aquelas isto isso aquilo seu sua seus suas meu minha '
  + 'nosso nossa dele dela deles delas eu tu ele ela nos vos eles elas me te lhe lhes '
  + 'ser estar ter haver e foi sao era eram sera serao tem tinha havia ha entre ate apos '
  + 'the of to and in is are was were be been for on with as by at from this that these '
  + 'those it its an or but not have has had will would can could should'
).split(/\s+/));

/** Tira acento para comparar palavras: "após" e "apos" são a mesma coisa aqui. */
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Corta o texto em frases.
 *
 * O ponto final não basta como separador: "art. 5º", "R$ 1.500,00" e "Sr. Silva"
 * quebrariam no meio. Só vale como fim de frase o ponto seguido de espaço e
 * maiúscula, e não precedido de abreviação conhecida.
 */
function emFrases(texto) {
  const bruto = String(texto).replace(/\s+/g, ' ').trim();
  const frases = [];
  let atual = '';

  const partes = bruto.split(/(?<=[.!?])\s+/);
  for (const parte of partes) {
    atual = atual ? atual + ' ' + parte : parte;
    const termina = /[.!?]$/.test(parte);
    const abreviacao = /\b(art|arts|sr|sra|dr|dra|prof|inc|ltda|etc|no|n|pag|fls|cf|obs|ex|p)\.$/i.test(parte);
    const numero = /\d\.$/.test(parte);
    if (termina && !abreviacao && !numero && atual.length > 25) {
      frases.push(atual.trim());
      atual = '';
    }
  }
  if (atual.trim()) frases.push(atual.trim());
  return frases.filter((f) => f.length > 25);
}

/**
 * Resumo por extração das frases mais representativas.
 *
 * A nota de cada frase é a soma da importância das palavras que ela usa,
 * dividida pela RAIZ do tamanho — não pelo tamanho. Dividir pelo tamanho puro
 * premiaria frases de três palavras; não dividir premiaria só as gigantes. A
 * raiz é o meio-termo que a área usa há décadas.
 *
 * As primeiras frases ganham um empurrão porque documento quase sempre começa
 * dizendo do que trata, e o resultado sai na ORDEM ORIGINAL: um resumo com as
 * frases fora de ordem obriga a pessoa a remontar o raciocínio sozinha.
 */
export function resumirTexto(texto, opcoes = {}) {
  const frases = emFrases(texto);
  if (frases.length <= 3) return String(texto).trim();

  const peso = new Map();
  for (const frase of frases) {
    for (const p of semAcento(frase.toLowerCase()).match(/[a-z0-9]{3,}/g) || []) {
      if (VAZIAS.has(p)) continue;
      peso.set(p, (peso.get(p) || 0) + 1);
    }
  }

  const notas = frases.map((frase, i) => {
    const palavras = semAcento(frase.toLowerCase()).match(/[a-z0-9]{3,}/g) || [];
    let soma = 0;
    for (const p of palavras) if (!VAZIAS.has(p)) soma += peso.get(p) || 0;

    const inicio = i < Math.max(2, frases.length * 0.15) ? 1.35 : 1;
    return { i, frase, nota: (soma / Math.sqrt(palavras.length || 1)) * inicio };
  });

  const quantas = opcoes.tamanho === 'curto'
    ? Math.max(2, Math.round(frases.length * 0.12))
    : opcoes.tamanho === 'longo'
      ? Math.max(6, Math.round(frases.length * 0.4))
      : Math.max(4, Math.round(frases.length * 0.22));

  const escolhidas = notas
    .sort((a, b) => b.nota - a.nota)
    .slice(0, Math.min(quantas, frases.length))
    .sort((a, b) => a.i - b.i);

  // Frases quase idênticas — cabeçalho repetido em toda página, por exemplo —
  // entrariam várias vezes e ocupariam o resumo inteiro.
  const vistas = new Set();
  const finais = [];
  for (const { frase } of escolhidas) {
    const chave = semAcento(frase.toLowerCase()).replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    finais.push(frase);
  }

  return opcoes.formato === 'pontos'
    ? finais.map((f) => '• ' + f).join('\n')
    : finais.join(' ');
}

/* ------------------------------------------------------------------ *
 * Tradução
 * ------------------------------------------------------------------ */


/**
 * O modelo de tradução já está guardado neste navegador?
 *
 * O transformers.js guarda os arquivos no cache do navegador. Perguntar antes
 * evita ameaçar com um download de 600 MB quem já baixou — e, principalmente,
 * evita NÃO avisar quem ainda não baixou.
 */
export async function tradutorJaBaixado() {
  try {
    if (typeof caches === 'undefined') return false;
    const c = await caches.open('transformers-cache');
    const chaves = await c.keys();
    return chaves.some((r) => r.url.includes('opus-mt-mul-en') && r.url.includes('.onnx'));
  } catch {
    return false;
  }
}

/** Quanto o modelo pesa, em MB. Medido nos arquivos que o dtype q8 baixa. */
export const PESO_DO_TRADUTOR = 110;

let tradutorPromise = null;
let tradutorCarregado = null;

/**
 * Carrega o modelo de tradução que roda no navegador.
 *
 * É o `opus-mt-mul-en`, e a escolha dele veio de medição, não de gosto: o
 * modelo que traduz para QUALQUER idioma pesa 603 MB, e eu vi esse arquivo não
 * ser gravado no cache do navegador — ou seja, seriam 603 MB a cada uso, não
 * uma vez. Prometer "baixa uma vez e fica guardado" sobre um arquivo que não
 * fica guardado seria mentira.
 *
 * Este pesa 107 MB, cabe no cache com folga e traduz de muitos idiomas PARA O
 * INGLÊS. É menos do que se queria, mas é o que funciona de verdade — e a tela
 * diz exatamente isso em vez de oferecer destinos que não vai entregar.
 */
async function modeloDeTraducao(aoProgredir) {
  if (tradutorCarregado) return tradutorCarregado;
  if (!tradutorPromise) {
    tradutorPromise = (async () => {
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      env.allowLocalModels = false;

      // Processador e não placa de vídeo: o caminho da GPU não terminou de
      // carregar em nenhum teste daqui. Entre um caminho medido e funcionando e
      // outro que talvez seja mais rápido mas trava, vale o que funciona.
      const p = await pipeline('translation', 'Xenova/opus-mt-mul-en', {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (e) => {
          if (e.status === 'progress' && e.total) aoProgredir(e.loaded / e.total, 'baixando');
        },
      });
      tradutorCarregado = p;
      return p;
    })();
    tradutorPromise.catch(() => { tradutorPromise = null; });
  }
  return tradutorPromise;
}

/** O tradutor embutido do navegador, quando existe: instantâneo e sem download. */
async function tradutorDoNavegador(de, para) {
  if (!('Translator' in self)) return null;
  try {
    const modelo = await comPrazo(
      Translator.create({ sourceLanguage: de, targetLanguage: para }), 20, 'tradutor',
    );
    // Uma frase curta de teste: é o que revela a versão que responde sem o
    // modelo instalado, devolvendo a entrada de volta.
    const prova = await comPrazo(modelo.translate('Good morning, my friend.'), 20, 'tradutor');
    if (/model not available/i.test(prova) || prova.includes('Good morning, my friend')) {
      if (modelo.destroy) modelo.destroy();
      return null;
    }
    return modelo;
  } catch {
    return null;
  }
}

/**
 * Traduz, pelo caminho que estiver disponível.
 *
 * Primeiro tenta o tradutor do próprio navegador, que é instantâneo e não baixa
 * nada. Se ele não existir ou não estiver funcionando de verdade, cai no modelo
 * em WebAssembly, que funciona em qualquer navegador. Em nenhum dos dois o
 * documento sai do aparelho.
 */
export async function traduzir(texto, de, para, aoProgredir = () => {}) {
  if (de === para) throw new Error('Escolha idiomas diferentes.');

  const pedacos = emPedacos(texto, 1200);
  const saida = [];

  const nativo = await tradutorDoNavegador(de, para);
  if (nativo) {
    try {
      for (let i = 0; i < pedacos.length; i++) {
        const parte = await nativo.translate(pedacos[i]);
        conferirResposta(parte, pedacos[i], 'tradutor');
        saida.push(parte);
        aoProgredir((i + 1) / pedacos.length, 'traduzindo', i + 1, pedacos.length);
      }
      return saida.join('\n\n');
    } finally {
      if (nativo.destroy) nativo.destroy();
    }
  }

  // Sem tradutor embutido sobra o modelo local, e ele só traduz PARA o inglês.
  // Esta recusa não é burocracia: pedindo outro destino ele NÃO falha — ele
  // inventa. "Hello world, this is a test of the system" pedido para português
  // voltou como "Helgore, this is a tip of the system and it is also a hat".
  // Um resultado errado com cara de certo é pior do que recusa nenhuma.
  if (para !== 'en') {
    throw new Error('Este navegador não tem tradutor embutido, e o modelo que roda aqui '
      + 'dentro só traduz PARA o inglês. Traduzir para ' + (NOMES_DE_IDIOMA[para] || para)
      + ' exigiria baixar mais de 600 MB a cada uso, porque um arquivo desse tamanho não '
      + 'fica guardado no navegador. Escolha inglês como destino, ou use um navegador com '
      + 'tradutor próprio.');
  }

  aoProgredir(0, 'baixando');
  const modelo = await modeloDeTraducao((f) => aoProgredir(f, 'baixando'));

  // Frase a frase, e não parágrafo inteiro: o modelo tem teto de entrada curto,
  // e um parágrafo grande sai truncado no meio sem aviso nenhum.
  for (let i = 0; i < pedacos.length; i++) {
    const frases = emFrases(pedacos[i]);
    const traduzidas = [];
    for (const frase of (frases.length ? frases : [pedacos[i]])) {
      const r = await modelo(frase);
      traduzidas.push((r[0] && r[0].translation_text) || '');
    }
    saida.push(traduzidas.join(' '));
    aoProgredir((i + 1) / pedacos.length, 'traduzindo', i + 1, pedacos.length);
  }
  return saida.join('\n\n');
}

/**
 * Resume.
 *
 * O método por extração é o padrão porque sempre funciona. Quando o navegador
 * tem um modelo de linguagem de verdade instalado, ele escreve um resumo com
 * palavras próprias, que lê melhor — mas isso é um bônus, não um requisito.
 */
export async function resumir(texto, opcoes = {}, aoProgredir = () => {}) {
  if (opcoes.metodo === 'extrair' || !('Summarizer' in self)) {
    aoProgredir(1, 'pronto');
    return resumirTexto(texto, opcoes);
  }

  try {
    const modelo = await comPrazo(Summarizer.create({
      type: opcoes.tipo || 'key-points',
      format: 'plain-text',
      length: opcoes.tamanho === 'curto' ? 'short' : opcoes.tamanho === 'longo' ? 'long' : 'medium',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => aoProgredir(e.loaded || 0, 'baixando'));
      },
    }), 90, 'resumidor');

    try {
      const pedacos = emPedacos(texto);
      const parciais = [];
      for (let i = 0; i < pedacos.length; i++) {
        const parcial = await modelo.summarize(pedacos[i], {
          context: 'Trecho de um documento em PDF. Responda em português do Brasil.',
        });
        conferirResposta(parcial, pedacos[i], 'resumidor');
        parciais.push(parcial);
        aoProgredir((i + 1) / (pedacos.length + 1), 'resumindo', i + 1, pedacos.length);
      }
      if (parciais.length === 1) return parciais[0].trim();
      const junto = await modelo.summarize(parciais.join('\n\n'), {
        context: 'Resumos parciais de um mesmo documento. Junte num resumo só, em português.',
      });
      return junto.trim();
    } finally {
      if (modelo.destroy) modelo.destroy();
    }
  } catch {
    // Sem modelo, com modelo pela metade ou fora do prazo: o método por
    // extração entrega um resumo de qualquer jeito, que é o que importa.
    aoProgredir(1, 'pronto');
    return resumirTexto(texto, opcoes);
  }
}
