/**
 * Operações de PDF, todas dentro do navegador.
 *
 * Vale aqui a mesma promessa do resto do site: o arquivo não sai do aparelho.
 * Isso é o que decide quais ferramentas existem. Juntar, dividir, girar,
 * numerar e converter para imagem são manipulação de estrutura e desenho —
 * o pdf-lib e o pdf.js fazem tudo isso no navegador.
 *
 * Converter para Word ou Excel é outra coisa: exige reconstruir um documento
 * editável a partir de glifos soltos posicionados na página, que é trabalho de
 * servidor com software pesado. Por isso não está aqui, e não vai estar
 * enquanto a promessa de não enviar arquivo continuar de pé.
 *
 * As duas bibliotecas são carregadas sob demanda, não no topo: quem entra na
 * página só para ver as opções não deve baixar megabytes à toa.
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
