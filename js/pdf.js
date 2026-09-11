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
    const texto = opcoes.formato === 'de'
      ? (i + comeco) + ' de ' + (total + comeco - 1)
      : String(i + comeco);
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
