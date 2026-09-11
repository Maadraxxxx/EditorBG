/**
 * Página de ferramentas de PDF.
 *
 * Uma página só, com uma grade de cartões: clicar num cartão troca a grade pela
 * ferramenta. Trinta páginas HTML separadas dariam o mesmo resultado com trinta
 * vezes mais código para manter, e obrigariam a recarregar tudo — inclusive as
 * bibliotecas — a cada troca de ferramenta.
 *
 * Cada ferramenta se descreve na tabela FERRAMENTAS: quais arquivos aceita,
 * que controles mostra e o que fazer ao executar. Assim acrescentar a próxima
 * é escrever uma entrada, não mexer no fluxo.
 */
import * as PDF from './pdf.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ *
 * Ícones
 * ------------------------------------------------------------------ */
const svg = (corpo) =>
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" '
  + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + corpo + '</svg>';

const ICONES = {
  juntar: svg('<rect x="2.5" y="6" width="9" height="12" rx="1.5"/><rect x="12.5" y="6" width="9" height="12" rx="1.5"/><path d="M9 12h6"/>'),
  dividir: svg('<rect x="3" y="4" width="18" height="16" rx="1.8"/><path d="M12 3v18" stroke-dasharray="3 2.5"/>'),
  organizar: svg('<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><path d="M17.5 14v7M14 17.5h7"/>'),
  rodar: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3"/><path d="M20.5 3.5v5h-5"/>'),
  imagem: svg('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m3 17 5.2-5.2a1.6 1.6 0 0 1 2.3 0L15 16"/>'),
  pdf: svg('<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z"/><path d="M14 2.5V7.5h5"/>'),
  numeros: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16.5h8"/><path d="M9.5 12.5v-4l-1.5 1"/><path d="M13 8.5h2.5v2H13v2h2.5"/>'),
  marca: svg('<path d="M12 2.5 4 6v6c0 4.5 3.4 8.2 8 9.5 4.6-1.3 8-5 8-9.5V6Z"/><path d="M8.5 12.5h7"/>'),
  comprimir: svg('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>'),
  editar: svg('<path d="M17.5 3.5 20.5 6.5 9 18l-4 1 1-4Z"/><path d="M3.5 20.5h17"/>'),
  html: svg('<path d="m8.5 9-3.5 3 3.5 3"/><path d="m15.5 9 3.5 3-3.5 3"/><path d="m13.5 6.5-3 11"/>'),
  ocultar: svg('<rect x="3" y="8.5" width="18" height="7" rx="1.2" fill="currentColor" stroke="none"/><path d="M4 4.5h16M4 19.5h16"/>'),
  formulario: svg('<rect x="3.5" y="3" width="17" height="18" rx="2"/><path d="M7.5 8h9M7.5 12h9M7.5 16h5"/>'),
  camera: svg('<path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18v-8a1.5 1.5 0 0 1 1.5-1.5Z"/><circle cx="12" cy="13.5" r="3.4"/>'),
  arquivo: svg('<path d="M3 7h18v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19Z"/><path d="M2 3.5h20V7H2Z"/><path d="M9.5 11h5"/>'),
  word: svg('<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z"/><path d="M14 2.5V7.5h5"/><path d="m8 12 1.6 5 1.9-5 1.9 5L15 12"/>'),
  excel: svg('<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z"/><path d="M14 2.5V7.5h5"/><path d="m8.5 12 5 5m0-5-5 5"/>'),
  ppt: svg('<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z"/><path d="M14 2.5V7.5h5"/><path d="M8.5 17v-5h2.6a1.7 1.7 0 0 1 0 3.4H8.5"/>'),
  ia: svg('<path d="M9.5 3.5 11 7.5l4 1.5-4 1.5-1.5 4-1.5-4L4 9l4-1.5Z"/><path d="M17 14l.8 2.2 2.2.8-2.2.8L17 20l-.8-2.2-2.2-.8 2.2-.8Z"/>'),
  traduzir: svg('<path d="M3.5 6h8M7.5 4v2c0 4-1.7 7-4 9"/><path d="M5 11c1.5 2.5 3.5 4 6.5 5"/><path d="m12.5 20 4-9 4 9"/><path d="M14 17h5"/>'),
  cadeado: svg('<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><circle cx="12" cy="15.5" r="1.4"/>'),
  cadeadoAberto: svg('<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.7"/><circle cx="12" cy="15.5" r="1.4"/>'),
  reparar: svg('<path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6l-8 8a2.3 2.3 0 0 1-3.2-3.2l8-8a3.5 3.5 0 0 0-1.4-1.4Z"/><path d="m5 5 3 3"/>'),
  recortar: svg('<path d="M6 3v13a2 2 0 0 0 2 2h13"/><path d="M3 6h13a2 2 0 0 1 2 2v13"/>'),
  assinar: svg('<path d="M3 19.5c2.5 0 3-2 3-4.5S5.5 7 8 7s2.5 3.5 2.5 6-1 5-1 5"/><path d="M9.5 14.5c3 0 5-1 7-3l4-4"/><path d="M17.5 4.5 20 7"/>'),
  comparar: svg('<rect x="2.5" y="4" width="8" height="16" rx="1.4"/><rect x="13.5" y="4" width="8" height="16" rx="1.4"/><path d="M15.5 9.5h4M15.5 13h2.5"/>'),
  markdown: svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 15.5v-7l3 3.5 3-3.5v7"/><path d="M15.5 8.5v5m0 0 2-2m-2 2-2-2"/>'),
  ocr: svg('<path d="M3.5 8V5.5A2 2 0 0 1 5.5 3.5H8"/><path d="M16 3.5h2.5a2 2 0 0 1 2 2V8"/><path d="M20.5 16v2.5a2 2 0 0 1-2 2H16"/><path d="M8 20.5H5.5a2 2 0 0 1-2-2V16"/><path d="M7.5 12h9"/><path d="M9 9h6M9 15h4"/>'),
  texto: svg('<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z"/><path d="M14 2.5V7.5h5"/><path d="M8.5 12.5h7M8.5 16h4"/>'),
};

/* ------------------------------------------------------------------ *
 * Controles reaproveitados pelas ferramentas
 * ------------------------------------------------------------------ */
const campoPaginas = (id, dica, valor = '') => `
  <label class="ed-field">${dica}
    <input type="text" id="${id}" value="${valor}" placeholder="ex.: 1-3, 7, 10" />
  </label>`;

const seletor = (id, rotulo, opcoes) => `
  <label class="ed-field">${rotulo}
    <select id="${id}">${opcoes.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
  </label>`;

/* ------------------------------------------------------------------ *
 * As ferramentas
 * ------------------------------------------------------------------ */
const FERRAMENTAS = [
  {
    id: 'juntar',
    nome: 'Juntar PDF',
    sobre: 'Une vários PDFs num só, na ordem em que você escolher.',
    icone: 'juntar',
    aceita: 'application/pdf',
    varios: true,
    dica: 'Arraste os PDFs aqui',
    tipos: 'PDF · segure Ctrl para escolher vários de uma vez',
    controles: () => '<p class="ed-hint">Os PDFs entram na ordem da lista — arraste os nomes para mudar.</p>',
    async rodar(arquivos) {
      if (arquivos.length < 2) throw new Error('Escolha pelo menos dois PDFs para juntar.');
      return { unico: { nome: 'juntado.pdf', blob: await PDF.juntar(arquivos) } };
    },
  },
  {
    id: 'dividir',
    nome: 'Dividir PDF',
    sobre: 'Separa as páginas em arquivos, ou extrai só o intervalo que você quiser.',
    icone: 'dividir',
    aceita: 'application/pdf',
    controles: () => seletor('modo', 'Como dividir', [
      ['cada', 'Uma página por arquivo'],
      ['intervalos', 'Só as páginas que eu escolher'],
    ]) + campoPaginas('paginas', 'Páginas'),
    async rodar(arquivos) {
      const partes = await PDF.dividir(arquivos[0], $('modo').value, $('paginas').value);
      return { varios: partes, zip: PDF.semExtensao(arquivos[0].name) + '-dividido.zip' };
    },
  },
  {
    id: 'organizar',
    nome: 'Organizar PDF',
    sobre: 'Reordena as páginas e descarta as que você não quer. O que ficar de fora é removido.',
    icone: 'organizar',
    aceita: 'application/pdf',
    controles: () => campoPaginas('ordem', 'Páginas que ficam, na ordem que você quiser')
      + '<p class="ed-hint small">Escreva 3, 1, 2 e o documento sai nessa ordem. O que não estiver na lista é descartado.</p>',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-organizado.pdf',
        blob: await PDF.organizar(arquivos[0], $('ordem').value),
      } };
    },
  },
  {
    id: 'rodar',
    nome: 'Rodar PDF',
    sobre: 'Gira as páginas. O giro soma ao que a página já tinha.',
    icone: 'rodar',
    aceita: 'application/pdf',
    controles: () => seletor('graus', 'Girar', [
      ['90', '90° para a direita'],
      ['-90', '90° para a esquerda'],
      ['180', '180° (de cabeça para baixo)'],
    ]) + campoPaginas('paginas', 'Quais páginas (deixe vazio para todas)'),
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-girado.pdf',
        blob: await PDF.rodar(arquivos[0], Number($('graus').value), $('paginas').value),
      } };
    },
  },
  {
    id: 'para-jpg',
    nome: 'PDF para JPG',
    sobre: 'Cada página vira uma imagem. Mais de uma página sai em .zip.',
    icone: 'imagem',
    aceita: 'application/pdf',
    controles: () => seletor('tipo', 'Formato', [['jpeg', 'JPG'], ['png', 'PNG']])
      + seletor('escala', 'Qualidade', [
        ['1.5', 'Tela · rápido'],
        ['2', 'Boa · recomendado'],
        ['3', 'Alta · arquivos maiores'],
        ['4', 'Impressão · bem pesado'],
      ]),
    async rodar(arquivos, aoProgredir) {
      const imagens = await PDF.paraImagens(arquivos[0], {
        escala: Number($('escala').value),
        tipo: $('tipo').value,
      }, aoProgredir);
      return { varios: imagens, zip: PDF.semExtensao(arquivos[0].name) + '-imagens.zip' };
    },
  },
  {
    id: 'de-jpg',
    nome: 'JPG para PDF',
    sobre: 'Junta suas imagens num PDF, uma por página.',
    icone: 'pdf',
    aceita: 'image/*',
    varios: true,
    dica: 'Arraste as imagens aqui',
    tipos: 'JPG, PNG, WEBP · segure Ctrl para escolher várias de uma vez',
    controles: () => seletor('margem', 'Margem em volta', [
      ['0', 'Sem margem'],
      ['20', 'Pequena'],
      ['48', 'Grande'],
    ]) + '<p class="ed-hint">Arraste os nomes abaixo para mudar a ordem.</p>',
    async rodar(arquivos) {
      return { unico: {
        nome: 'imagens.pdf',
        blob: await PDF.deImagens(arquivos, { margem: Number($('margem').value) }),
      } };
    },
  },
  {
    id: 'numeros',
    nome: 'Números de página',
    sobre: 'Escreve o número em toda página, na posição que você escolher.',
    icone: 'numeros',
    aceita: 'application/pdf',
    controles: () => seletor('posicao', 'Posição', [
      ['centro', 'Centro'], ['direita', 'Direita'], ['esquerda', 'Esquerda'],
    ]) + seletor('formato', 'Formato', [
        ['so', '1, 2, 3…'],
        ['de', '1 de 10'],
        ['romano', 'I, II, III (romanos)'],
        ['romano-minusculo', 'i, ii, iii (romanos minúsculos)'],
      ])
      + '<label class="ed-field">Começar em <input type="number" id="comeco" value="1" min="1" max="9999" /></label>',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-numerado.pdf',
        blob: await PDF.numerarPaginas(arquivos[0], {
          posicao: $('posicao').value,
          formato: $('formato').value,
          comeco: Number($('comeco').value) || 1,
        }),
      } };
    },
  },
  {
    id: 'marca',
    nome: "Marca d'água",
    sobre: 'Escreve um texto por cima de todas as páginas.',
    icone: 'marca',
    aceita: 'application/pdf',
    controles: () => `
      <label class="ed-field">Texto
        <input type="text" id="texto" maxlength="40" placeholder="CONFIDENCIAL" />
      </label>`
      + seletor('opacidade', 'Força', [
        ['0.1', 'Discreta'], ['0.18', 'Média'], ['0.3', 'Forte'],
      ])
      + seletor('diagonal', 'Inclinação', [['sim', 'Na diagonal'], ['nao', 'Reta']]),
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-marcado.pdf',
        blob: await PDF.marcaDagua(arquivos[0], $('texto').value, {
          opacidade: Number($('opacidade').value),
          diagonal: $('diagonal').value === 'sim',
        }),
      } };
    },
  },
  {
    id: 'comprimir',
    nome: 'Comprimir PDF',
    sobre: 'Reduz o tamanho do arquivo redesenhando as páginas como imagem.',
    icone: 'comprimir',
    aceita: 'application/pdf',
    aviso: 'O texto deixa de ser texto e vira desenho: o arquivo encolhe, mas não dá '
      + 'mais para pesquisar nem copiar. Bom para documento digitalizado, ruim para contrato.',
    controles: () => seletor('escala', 'Quanto reduzir', [
      ['1', 'Bastante · qualidade de tela'],
      ['1.5', 'Equilibrado · recomendado'],
      ['2', 'Pouco · mantém mais nitidez'],
    ]),
    async rodar(arquivos, aoProgredir) {
      const blob = await PDF.comprimir(arquivos[0], { escala: Number($('escala').value) }, aoProgredir);
      const antes = arquivos[0].size;

      // Nem todo PDF encolhe. Um arquivo que já é só texto vira imagem e
      // CRESCE. Entregar o arquivo pior junto com um aviso dizendo para não
      // usá-lo é pedir para a pessoa se confundir — melhor não entregar.
      if (blob.size >= antes) {
        return {
          semArquivo: true,
          recado: 'Não compensa comprimir este arquivo: ele já está enxuto, e a '
            + 'versão comprimida ficaria maior (' + tamanho(blob.size) + ' contra '
            + tamanho(antes) + '). Nada foi baixado — continue com o original.',
        };
      }

      return {
        unico: { nome: PDF.semExtensao(arquivos[0].name) + '-comprimido.pdf', blob },
        recado: 'De ' + tamanho(antes) + ' para ' + tamanho(blob.size)
          + ' — ' + Math.round((1 - blob.size / antes) * 100) + '% menor.',
      };
    },
  },
  {
    id: 'texto',
    nome: 'PDF para texto',
    sobre: 'Extrai o texto que existe no PDF para um arquivo .txt.',
    icone: 'texto',
    aceita: 'application/pdf',
    controles: () => '<p class="ed-hint">Só funciona em PDF com texto de verdade. '
      + 'Documento digitalizado é imagem, e daí não sai texto.</p>',
    async rodar(arquivos) {
      const texto = await PDF.paraTexto(arquivos[0]);
      if (!texto.trim()) {
        throw new Error('Este PDF não tem texto — provavelmente é um documento '
          + 'digitalizado, onde as páginas são imagens.');
      }
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.txt',
        blob: new Blob([texto], { type: 'text/plain;charset=utf-8' }),
      } };
    },
  },
  {
    id: 'recortar',
    nome: 'Recortar PDF',
    sobre: 'Corta as margens. Arraste as bordas na própria página para escolher.',
    icone: 'recortar',
    aceita: 'application/pdf',
    controles: () => campoPaginas('paginas', 'Quais páginas (deixe vazio para todas)')
      + '<p class="ed-hint small">O conteúdo cortado não é apagado, só fica fora da área visível — dá para voltar atrás depois.</p>',
    preparar: montarRecorte,
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-recortado.pdf',
        blob: await PDF.recortar(arquivos[0], corte, $('paginas').value),
      } };
    },
  },
  {
    id: 'assinar',
    nome: 'Assinar PDF',
    sobre: 'Desenhe sua assinatura e coloque onde quiser na página.',
    icone: 'assinar',
    aceita: 'application/pdf',
    aviso: 'Isto é o mesmo que assinar à caneta e digitalizar: NÃO é assinatura '
      + 'digital com certificado ICP-Brasil, e não tem a validade jurídica de uma.',
    controles: () => `
      <label class="ed-field">Tamanho <span class="val" id="asTamanhoVal">28%</span>
        <input type="range" id="asTamanho" min="8" max="60" step="1" value="28" />
      </label>
      <label class="switch small">
        <input type="checkbox" id="asTodas" />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">Repetir em todas as páginas</span>
      </label>`,
    preparar: montarAssinatura,
    async rodar(arquivos) {
      const png = await pngDaAssinatura();
      if (!png) throw new Error('Desenhe a assinatura no quadro branco, ou escolha uma imagem dela.');
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-assinado.pdf',
        blob: await PDF.assinar(arquivos[0], png, {
          pagina: paginaDaPrevia,
          x: assinatura.x,
          y: assinatura.y,
          largura: Number($('asTamanho').value) / 100,
          todas: $('asTodas').checked,
        }),
      } };
    },
  },
  {
    id: 'comparar',
    nome: 'Comparar PDF',
    sobre: 'Mostra o que mudou entre duas versões, marcado em vermelho.',
    icone: 'comparar',
    aceita: 'application/pdf',
    varios: true,
    dica: 'Arraste os dois PDFs aqui',
    tipos: 'PDF · exatamente dois: a versão antiga e a nova',
    controles: () => '<p class="ed-hint">O primeiro da lista é a versão antiga; o segundo, a nova. '
      + 'A comparação é visual, então carimbo movido e assinatura acrescentada também aparecem.</p>',
    async rodar(arquivos, aoProgredir) {
      if (arquivos.length !== 2) throw new Error('Escolha exatamente dois PDFs: o antigo e o novo.');
      const paginas = await PDF.comparar(arquivos[0], arquivos[1], aoProgredir);
      mostrarComparacao(paginas);

      const mudaram = paginas.filter((p) => p.diferenca > 0.0005);
      return {
        semArquivo: true,
        recado: mudaram.length
          ? mudaram.length + (mudaram.length === 1 ? ' página mudou' : ' páginas mudaram')
            + ': ' + mudaram.map((p) => p.pagina).join(', ') + '. O que mudou está em vermelho abaixo.'
          : 'Os dois arquivos estão iguais — nenhuma diferença visível em '
            + paginas.length + (paginas.length === 1 ? ' página.' : ' páginas.'),
      };
    },
  },
  {
    id: 'markdown',
    nome: 'PDF para Markdown',
    sobre: 'Extrai o texto já com títulos, listas e negrito marcados.',
    icone: 'markdown',
    aceita: 'application/pdf',
    controles: () => '<p class="ed-hint">Os títulos são descobertos pelo tamanho da letra: '
      + 'o PDF não guarda essa informação, mas título quase sempre é escrito maior que o texto.</p>',
    async rodar(arquivos) {
      const md = await PDF.paraMarkdown(arquivos[0]);
      if (!md.trim()) {
        throw new Error('Este PDF não tem texto — provavelmente é digitalizado. '
          + 'Use a ferramenta de OCR primeiro.');
      }
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.md',
        blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
      } };
    },
  },
  {
    id: 'ocr',
    nome: 'OCR — PDF pesquisável',
    sobre: 'Lê o texto de um documento digitalizado e devolve o PDF com busca.',
    icone: 'ocr',
    aceita: 'application/pdf',
    aviso: 'Baixa um modelo de leitura de cerca de 10 MB na primeira vez, e demora '
      + 'alguns segundos por página. A aparência do documento não muda: o texto entra '
      + 'numa camada invisível por baixo, que é o que permite buscar e copiar.',
    controles: () => seletor('idioma', 'Idioma do documento', [
      ['por', 'Português'], ['eng', 'Inglês'], ['spa', 'Espanhol'],
    ]) + seletor('saida', 'O que baixar', [
      ['pdf', 'PDF pesquisável'], ['txt', 'Só o texto (.txt)'],
    ]),
    async rodar(arquivos, aoProgredir) {
      const r = await PDF.ocr(arquivos[0], { idioma: $('idioma').value }, (f, fase, feito, total) => {
        aoProgredir(f, feito || 0, total || 0);
        if (fase === 'baixando') dizer('Baixando o modelo de leitura…');
        else if (fase === 'lendo') dizer('Lendo a página ' + feito + ' de ' + total + '…');
      });

      if (!r.texto.trim()) {
        throw new Error('Não foi possível ler texto nenhum. A digitalização pode estar '
          + 'torta, muito clara ou de baixa resolução.');
      }

      const base = PDF.semExtensao(arquivos[0].name);
      const palavras = r.texto.split(/\s+/).filter(Boolean).length;

      if ($('saida').value === 'txt' || !r.pdf) {
        return {
          unico: { nome: base + '.txt', blob: new Blob([r.texto], { type: 'text/plain;charset=utf-8' }) },
          recado: palavras + ' palavras reconhecidas.',
        };
      }
      return {
        unico: { nome: base + '-pesquisavel.pdf', blob: r.pdf },
        recado: palavras + ' palavras reconhecidas. O PDF agora aceita busca e cópia.',
      };
    },
  },
  {
    id: 'proteger',
    nome: 'Proteger PDF',
    sobre: 'Tranca o arquivo com senha. Sem ela, ninguém abre.',
    icone: 'cadeado',
    aceita: 'application/pdf',
    aviso: 'A senha fica só com você. Não temos como recuperá-la nem guardá-la — '
      + 'se você esquecer, o arquivo não abre mais.',
    controles: () => `
      <label class="ed-field">Senha nova
        <input type="password" id="senha1" autocomplete="new-password" placeholder="pelo menos 4 caracteres" />
      </label>
      <label class="ed-field">Repita a senha
        <input type="password" id="senha2" autocomplete="new-password" />
      </label>
      <label class="ed-field" id="campoAtual" hidden>Senha atual do arquivo
        <input type="password" id="senhaAtual" autocomplete="current-password" />
      </label>`,
    preparar: mostrarCampoDeSenha,
    async rodar(arquivos) {
      const a = $('senha1').value;
      const b = $('senha2').value;
      if (a !== b) throw new Error('As duas senhas não são iguais.');
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-protegido.pdf',
        blob: await PDF.proteger(arquivos[0], a, $('senhaAtual').value),
      }, recado: 'Pronto. Guarde a senha: sem ela o arquivo não abre mais.' };
    },
  },
  {
    id: 'desbloquear',
    nome: 'Desbloquear PDF',
    sobre: 'Tira a senha de um PDF, para quem já sabe a senha.',
    icone: 'cadeadoAberto',
    aceita: 'application/pdf',
    aviso: 'Isto não quebra senha: sem a senha certa o conteúdo é ilegível, e é assim '
      + 'que deve ser. Serve para guardar aberta uma cópia de algo que chega trancado.',
    controles: () => `
      <label class="ed-field">Senha do arquivo
        <input type="password" id="senhaAtual" autocomplete="current-password" />
      </label>`,
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-aberto.pdf',
        blob: await PDF.desbloquear(arquivos[0], $('senhaAtual').value),
      } };
    },
  },
  {
    id: 'reparar',
    nome: 'Reparar PDF',
    sobre: 'Recupera um arquivo que não abre mais, reconstruindo o índice interno.',
    icone: 'reparar',
    aceita: 'application/pdf',
    controles: () => `
      <p class="ed-hint">O defeito mais comum é o índice interno apontar para o lugar
      errado — o que acontece quando um download é interrompido ou o pendrive sai no
      meio da gravação. O conteúdo quase sempre continua lá.</p>
      <label class="ed-field" id="campoAtual" hidden>Senha do arquivo
        <input type="password" id="senhaAtual" autocomplete="current-password" />
      </label>`,
    preparar: mostrarCampoDeSenha,
    async rodar(arquivos) {
      const r = await PDF.reparar(arquivos[0], $('senhaAtual') ? $('senhaAtual').value : '');
      return {
        unico: { nome: PDF.semExtensao(arquivos[0].name) + '-reparado.pdf', blob: r.blob },
        recado: r.paginas + (r.paginas === 1 ? ' página recuperada' : ' páginas recuperadas')
          + ' · ' + tamanho(r.bytes) + '.',
      };
    },
  },
  {
    id: 'para-word',
    nome: 'PDF para Word',
    sobre: 'Gera um .docx editável, com títulos, parágrafos e listas.',
    icone: 'word',
    aceita: 'application/pdf',
    aviso: 'Sai um documento editável de verdade, não uma foto da página. O que não '
      + 'sobrevive é o layout milimétrico — colunas e posicionamento exato — porque o '
      + 'PDF não guarda isso, guarda só onde cada letra foi parar.',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.docx',
        blob: await PDF.paraWord(arquivos[0]),
      } };
    },
  },
  {
    id: 'para-excel',
    nome: 'PDF para Excel',
    sobre: 'Reconstrói as tabelas do PDF numa planilha, uma aba por página.',
    icone: 'excel',
    aceita: 'application/pdf',
    aviso: 'As colunas são descobertas pelo alinhamento do texto, porque o PDF não '
      + 'sabe o que é uma tabela. Funciona bem em tabela alinhada; em texto corrido, '
      + 'o resultado é só o texto em linhas.',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.xlsx',
        blob: await PDF.paraExcel(arquivos[0]),
      } };
    },
  },
  {
    id: 'para-ppt',
    nome: 'PDF para PowerPoint',
    sobre: 'Cada página vira um slide, com a página inteira desenhada nele.',
    icone: 'ppt',
    aceita: 'application/pdf',
    async rodar(arquivos, aoProgredir) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.pptx',
        blob: await PDF.paraPowerPoint(arquivos[0], aoProgredir),
      } };
    },
  },
  {
    id: 'de-word',
    nome: 'Word para PDF',
    sobre: 'Converte .docx em PDF, mantendo o texto selecionável.',
    icone: 'word',
    aceita: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dica: 'Arraste o arquivo do Word aqui',
    tipos: 'DOCX · o formato do Word moderno',
    aviso: 'O texto sai como texto, dá para buscar e copiar. Margens exatas, cabeçalho '
      + 'e rodapé não sobrevivem: o que se lê do .docx é o conteúdo, não a página montada.',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.pdf',
        blob: await PDF.deWord(arquivos[0]),
      } };
    },
  },
  {
    id: 'de-excel',
    nome: 'Excel para PDF',
    sobre: 'Converte planilha em PDF, em folha deitada, uma aba por vez.',
    icone: 'excel',
    aceita: '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dica: 'Arraste a planilha aqui',
    tipos: 'XLSX, XLS, CSV',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.pdf',
        blob: await PDF.deExcel(arquivos[0]),
      } };
    },
  },
  {
    id: 'de-ppt',
    nome: 'PowerPoint para PDF',
    sobre: 'Passa o conteúdo dos slides para PDF, um slide por página.',
    icone: 'ppt',
    aceita: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    dica: 'Arraste a apresentação aqui',
    tipos: 'PPTX · o formato do PowerPoint moderno',
    aviso: 'Sai o CONTEÚDO de cada slide, não o slide desenhado. Tema, posição, cor e '
      + 'imagem de fundo dependem de arquivos espalhados dentro do .pptx e não são '
      + 'reproduzidos aqui.',
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '.pdf',
        blob: await PDF.dePowerPoint(arquivos[0]),
      } };
    },
  },
  {
    id: 'resumir',
    nome: 'Resumir PDF',
    sobre: 'Escolhe as frases mais representativas do documento e monta um resumo.',
    icone: 'ia',
    aceita: 'application/pdf',
    aviso: 'Funciona em qualquer navegador, na hora, sem baixar nada e sem enviar o '
      + 'documento para lugar nenhum. O resumo é feito selecionando as frases que já '
      + 'estão no texto — nada é reescrito, então nada é parafraseado errado. Se o seu '
      + 'navegador tiver um modelo de linguagem instalado, ele escreve o resumo com '
      + 'palavras próprias; mas isso é um bônus, não uma exigência.',
    controles: () => seletor('tamanho', 'Tamanho', [
      ['curto', 'Curto'], ['medio', 'Médio'], ['longo', 'Longo'],
    ]) + seletor('formato', 'Formato', [
      ['pontos', 'Em tópicos'], ['corrido', 'Texto corrido'],
    ]) + seletor('metodo', 'Método', [
      ['auto', 'Automático · usa a IA do navegador se houver'],
      ['extrair', 'Só selecionar frases · sempre igual'],
    ]) + seletor('saida', 'O que baixar', [['txt', 'Texto (.txt)'], ['pdf', 'PDF']]),
    async rodar(arquivos, aoProgredir) {
      const texto = await PDF.paraTexto(arquivos[0]);
      if (!texto.trim()) throw new Error('Este PDF não tem texto — passe pelo OCR primeiro.');

      const resumo = await PDF.resumir(texto, {
        tamanho: $('tamanho').value,
        formato: $('formato').value,
        metodo: $('metodo').value,
      }, (f, fase, feito, total) => {
        aoProgredir(typeof f === 'number' && f <= 1 ? f : 0, feito || 0, total || 0);
        if (fase === 'baixando') dizer('Preparando o modelo do navegador…');
        else if (fase === 'resumindo') dizer('Trecho ' + feito + ' de ' + total + '…');
      });

      const base = PDF.semExtensao(arquivos[0].name);
      const corte = Math.round((1 - resumo.length / texto.length) * 100);
      mostrarTexto('Resumo', resumo);

      if ($('saida').value === 'pdf') {
        return { unico: { nome: base + '-resumo.pdf', blob: await PDF.textoParaPdf(resumo, 'Resumo') },
          recado: 'Resumo pronto — ' + corte + '% menor que o documento.' };
      }
      return { unico: { nome: base + '-resumo.txt', blob: new Blob([resumo], { type: 'text/plain;charset=utf-8' }) },
        recado: 'Resumo pronto — ' + corte + '% menor que o documento.' };
    },
  },
  {
    id: 'traduzir',
    nome: 'Traduzir PDF',
    sobre: 'Traduz o texto do documento. A tradução roda no seu aparelho.',
    icone: 'traduzir',
    aceita: 'application/pdf',
    aviso: 'Funciona em qualquer navegador, mas de dois jeitos diferentes. Se o seu tiver '
      + 'tradutor embutido (Chrome novo), traduz para qualquer idioma, na hora, sem baixar '
      + 'nada. Se não tiver, o site baixa um modelo de cerca de ' + PDF.PESO_DO_TRADUTOR
      + ' MB na primeira vez, que traduz de vários idiomas PARA O INGLÊS — e só. Um modelo '
      + 'que traduza para qualquer idioma pesaria mais de 600 MB a cada uso, grande demais '
      + 'para valer a pena. Nos dois casos o documento não sai do seu aparelho: sai o texto '
      + 'traduzido, não o PDF original com as palavras trocadas de lugar.',
    preparar: avisarPesoDoTradutor,
    controles: () => seletor('de', 'Idioma do documento', PDF.IDIOMAS)
      + seletor('para', 'Traduzir para', PDF.IDIOMAS.slice().reverse())
      + seletor('saida', 'O que baixar', [['pdf', 'PDF'], ['txt', 'Texto (.txt)']]),
    async rodar(arquivos, aoProgredir) {
      const texto = await PDF.paraTexto(arquivos[0]);
      if (!texto.trim()) throw new Error('Este PDF não tem texto — passe pelo OCR primeiro.');

      const traduzido = await PDF.traduzir(texto, $('de').value, $('para').value,
        (f, fase, feito, total) => {
          aoProgredir(typeof f === 'number' && f <= 1 ? f : 0, feito || 0, total || 0);
          if (fase === 'baixando') {
          dizer('Baixando o modelo de tradução — só desta vez, cerca de '
            + PDF.PESO_DO_TRADUTOR + ' MB. Depois ele fica guardado no navegador.');
        }
          else if (fase === 'traduzindo') dizer('Traduzindo o trecho ' + feito + ' de ' + total + '…');
        });

      const base = PDF.semExtensao(arquivos[0].name) + '-' + $('para').value;
      mostrarTexto('Tradução', traduzido);
      if ($('saida').value === 'txt') {
        return { unico: { nome: base + '.txt', blob: new Blob([traduzido], { type: 'text/plain;charset=utf-8' }) } };
      }
      return { unico: { nome: base + '.pdf', blob: await PDF.textoParaPdf(traduzido, null) } };
    },
  },
  {
    id: 'pdfa',
    nome: 'PDF para PDF/A',
    sobre: 'Converte para o formato de arquivamento de longo prazo.',
    icone: 'arquivo',
    aceita: 'application/pdf',
    aviso: 'A conversão desenha cada página como imagem. É o que resolve a exigência '
      + 'mais difícil do PDF/A — toda fonte tem que estar embutida — mas o texto deixa '
      + 'de ser texto: não dá mais para buscar nem copiar.',
    controles: () => seletor('escala', 'Qualidade das páginas', [
      ['1.5', 'Menor arquivo'],
      ['2', 'Equilibrado · recomendado'],
      ['3', 'Alta · para impressão'],
    ]) + '<p class="ed-hint small">PDF/A é o formato que órgãos públicos e cartórios '
      + 'costumam exigir para guardar documento por décadas. Vale conferir o arquivo '
      + 'num validador antes de entregar onde for obrigatório.</p>',
    async rodar(arquivos, aoProgredir) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-pdfa.pdf',
        blob: await PDF.paraPdfA(arquivos[0], { escala: Number($('escala').value) }, aoProgredir),
      }, recado: 'Convertido para PDF/A-1b, com o perfil de cor embutido.' };
    },
  },
  {
    id: 'editar',
    nome: 'Editar PDF',
    sobre: 'Escreve textos sobre a página, sem mexer no que já estava lá.',
    icone: 'editar',
    aceita: 'application/pdf',
    controles: () => `
      <label class="ed-field">Texto a acrescentar
        <input type="text" id="edTexto" maxlength="120" placeholder="clique na página depois de escrever" />
      </label>
      <label class="ed-field">Tamanho <span class="val" id="edTamanhoVal">2.5%</span>
        <input type="range" id="edTamanho" min="10" max="60" step="1" value="25" />
      </label>
      <label class="cor-campo">Cor <input type="color" id="edCor" value="#111827" /></label>
      <label class="switch small">
        <input type="checkbox" id="edNegrito" />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">Negrito</span>
      </label>`,
    preparar: montarEdicao,
    async rodar(arquivos) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-editado.pdf',
        blob: await PDF.editar(arquivos[0], anotacoes),
      }, recado: anotacoes.length + (anotacoes.length === 1 ? ' texto escrito.' : ' textos escritos.') };
    },
  },
  {
    id: 'html',
    nome: 'HTML para PDF',
    sobre: 'Transforma código HTML colado num PDF com texto de verdade.',
    icone: 'html',
    aceita: null,
    semArquivo: true,
    aviso: 'Aceita o CÓDIGO da página, não um endereço. Para ler um site de dentro do '
      + 'navegador, aquele site precisa autorizar a leitura por outro domínio — e quase '
      + 'nenhum autoriza. Para uma página na internet, o "salvar como PDF" da impressão '
      + 'do próprio navegador continua sendo o melhor caminho.',
    controles: () => `
      <label class="ed-field">Título (opcional)
        <input type="text" id="htmlTitulo" maxlength="80" />
      </label>
      <label class="ed-field">Código HTML
        <textarea id="htmlCodigo" rows="10" placeholder="&lt;h1&gt;Meu título&lt;/h1&gt;&#10;&lt;p&gt;Um parágrafo.&lt;/p&gt;"></textarea>
      </label>`,
    async rodar() {
      return { unico: {
        nome: (($('htmlTitulo').value || 'pagina').trim() || 'pagina') + '.pdf',
        blob: await PDF.deHtml($('htmlCodigo').value, $('htmlTitulo').value.trim()),
      } };
    },
  },
  {
    id: 'ocultar',
    nome: 'Ocultar PDF',
    sobre: 'Tarja informação sensível de forma que ela deixe de existir no arquivo.',
    icone: 'ocultar',
    aceita: 'application/pdf',
    aviso: 'Desenhar um retângulo preto por cima NÃO esconde nada: o texto continua no '
      + 'arquivo, embaixo, e qualquer um o copia — é assim que vazam documentos '
      + '"tarjados". Aqui a página é redesenhada como imagem antes da tarja, então o que '
      + 'ficou embaixo foi embora de verdade. Em troca, o documento deixa de ser pesquisável.',
    controles: () => '<p class="ed-hint">Arraste sobre a página para marcar cada área. '
      + 'Clique numa tarja para tirá-la.</p>',
    preparar: montarOcultar,
    async rodar(arquivos, aoProgredir) {
      return { unico: {
        nome: PDF.semExtensao(arquivos[0].name) + '-tarjado.pdf',
        blob: await PDF.ocultar(arquivos[0], tarjas, aoProgredir),
      }, recado: tarjas.length + (tarjas.length === 1 ? ' área ocultada' : ' áreas ocultadas')
        + ' — o conteúdo por baixo não existe mais no arquivo.' };
    },
  },
  {
    id: 'formularios',
    nome: 'Formulários PDF',
    sobre: 'Preenche os campos de um PDF que já tem formulário.',
    icone: 'formulario',
    aceita: 'application/pdf',
    controles: () => `
      <label class="switch small">
        <input type="checkbox" id="fmAchatar" checked />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">Travar o preenchimento (ninguém mais altera)</span>
      </label>
      <p class="ed-hint small">Travado é o que se quer ao devolver um formulário pronto.
      Desligue se o documento ainda vai passar por outra pessoa para completar.</p>`,
    preparar: montarFormulario,
    async rodar(arquivos) {
      const valores = {};
      for (const el of $('extra').querySelectorAll('[data-campo]')) {
        valores[el.dataset.campo] = el.type === 'checkbox' ? el.checked : el.value;
      }
      const r = await PDF.preencherFormulario(arquivos[0], valores, $('fmAchatar').checked);
      if (!r.mexidos) throw new Error('Nenhum campo foi preenchido.');
      return {
        unico: { nome: PDF.semExtensao(arquivos[0].name) + '-preenchido.pdf', blob: r.blob },
        recado: r.mexidos + (r.mexidos === 1 ? ' campo preenchido' : ' campos preenchidos')
          + ($('fmAchatar').checked ? ', e travado.' : '.'),
      };
    },
  },
  {
    id: 'digitalizar',
    nome: 'Digitalizar',
    sobre: 'Usa a câmera como scanner e junta as fotos num PDF já corrigido.',
    icone: 'camera',
    aceita: 'image/*',
    semArquivo: true,
    controles: () => `
      <label class="switch small">
        <input type="checkbox" id="dgRealce" checked />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">Corrigir contraste e nitidez</span>
      </label>
      <label class="switch small">
        <input type="checkbox" id="dgCor" checked />
        <span class="track"><span class="knob"></span></span>
        <span class="switch-text">Manter as cores</span>
      </label>
      <p class="ed-hint small">Foto de papel tirada à mão quase nunca sai legível de
      primeira — sombra, papel acinzentado, letra apagada. A correção é o que separa
      um PDF que dá para ler de um borrão.</p>`,
    preparar: montarCamera,
    async rodar(_arquivos, aoProgredir) {
      return { unico: {
        nome: 'digitalizado.pdf',
        blob: await PDF.digitalizar(capturas, {
          realcar: $('dgRealce').checked,
          cor: $('dgCor').checked,
        }, aoProgredir),
      }, recado: capturas.length + (capturas.length === 1 ? ' página' : ' páginas') + ' no PDF.' };
    },
  },
];

/**
 * A cor do ícone diz a que família a ferramenta pertence.
 *
 * Com 32 cartões na tela, cor é o que o olho lê antes do texto: quem procura
 * "aquela de Excel" acha as três verdes sem ler nenhum nome. As cores do Word,
 * Excel e PowerPoint são de propósito as dos próprios programas — é a
 * associação que as pessoas já trazem pronta.
 */
const CORES = {
  juntar: 'estrutura', dividir: 'estrutura', organizar: 'estrutura',
  rodar: 'estrutura', recortar: 'estrutura', numeros: 'estrutura',

  comprimir: 'otimizar', reparar: 'otimizar', pdfa: 'otimizar',

  'para-word': 'word', 'de-word': 'word',
  'para-excel': 'excel', 'de-excel': 'excel',
  'para-ppt': 'ppt', 'de-ppt': 'ppt',

  'para-jpg': 'imagem', 'de-jpg': 'imagem', digitalizar: 'imagem',

  proteger: 'seguranca', desbloquear: 'seguranca', assinar: 'seguranca', ocultar: 'seguranca',

  ocr: 'ia', resumir: 'ia', traduzir: 'ia',

  markdown: 'texto', texto: 'texto', html: 'texto',

  editar: 'edicao', marca: 'edicao', formularios: 'edicao',

  comparar: 'comparar',
};

/**
 * A ordem dos cartões na grade.
 *
 * É a mesma sequência das ferramentas de PDF mais conhecidas, e isso não é
 * imitação à toa: quem já usou uma delas procura cada coisa onde estava lá, e
 * uma ordem inventada obrigaria a pessoa a ler os 27 cartões para achar o que
 * já sabia fazer.
 *
 * A ordem fica AQUI, numa lista de nomes, e não na ordem em que as ferramentas
 * foram escritas: assim dá para mudar a grade sem mexer no código de nenhuma
 * delas, e uma ferramenta nova não some por ter sido escrita no lugar errado —
 * o que não estiver nesta lista vai para o fim, visível.
 */
const ORDEM = [
  'juntar', 'dividir', 'comprimir',
  'para-word', 'para-ppt', 'para-excel',
  'de-word', 'de-ppt', 'de-excel',
  'editar', 'para-jpg', 'de-jpg',
  'assinar', 'marca', 'rodar', 'html',
  'desbloquear', 'proteger',
  'organizar', 'pdfa', 'reparar', 'numeros', 'digitalizar', 'ocr',
  'comparar', 'ocultar', 'recortar', 'formularios',
  'resumir', 'traduzir',
  'markdown', 'texto',
];

FERRAMENTAS.sort((a, b) => {
  const ia = ORDEM.indexOf(a.id);
  const ib = ORDEM.indexOf(b.id);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});

function tamanho(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/* ------------------------------------------------------------------ *
 * A grade
 * ------------------------------------------------------------------ */
(function montarGrade() {
  $('pdfGrade').innerHTML = FERRAMENTAS.map((f) => `
    <button class="pdf-card" data-id="${f.id}" type="button">
      <span class="pdf-icone cor-${CORES[f.id] || 'estrutura'}">${ICONES[f.icone]}</span>
      <strong>${f.nome}</strong>
      <span>${f.sobre}</span>
    </button>`).join('');

  $('pdfRodape').textContent = FERRAMENTAS.length + ' ferramentas, todas rodando no seu navegador.';

  $('pdfGrade').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrir(FERRAMENTAS.find((f) => f.id === b.dataset.id));
  });
})();

/* ------------------------------------------------------------------ *
 * Abrir e fechar uma ferramenta
 * ------------------------------------------------------------------ */
let atual = null;
let escolhidos = [];

function abrir(f) {
  desligarCamera();
  atual = f;
  escolhidos = [];

  $('telaNome').textContent = f.nome;
  $('telaSobre').textContent = f.sobre;
  $('telaIcone').innerHTML = ICONES[f.icone];
  $('telaIcone').className = 'pdf-icone cor-' + (CORES[f.id] || 'estrutura');
  $('dropTitulo').textContent = f.dica || 'Arraste o arquivo aqui';
  $('dropTipos').textContent = f.tipos || 'PDF · nada é enviado para servidores';

  $('file').accept = f.aceita;
  $('file').multiple = !!f.varios;

  $('opcoes').innerHTML = f.controles ? f.controles() : '';
  $('extra').innerHTML = '';
  $('extra').hidden = true;
  $('aviso').hidden = !f.aviso;
  $('aviso').textContent = f.aviso || '';

  $('limpar').textContent = f.varios ? 'Limpar a lista' : 'Trocar arquivo';

  $('grade').hidden = true;
  $('tela').hidden = false;
  $('maisArquivos').hidden = true;

  // Algumas ferramentas não recebem arquivo: HTML colado e a câmera começam com
  // a tela de trabalho aberta, senão pediriam um arquivo que não existe.
  $('trabalho').hidden = !f.semArquivo;
  $('drop').hidden = !!f.semArquivo;
  $('estado').hidden = true;
  $('barra').hidden = true;
  $('executar').disabled = false;
  // A tradução troca o rótulo para avisar do download; sem zerar aqui o aviso
  // ficaria colado na próxima ferramenta aberta.
  $('executar').textContent = 'Fazer agora';

  // Depois de zerar o botão, nunca antes: a montagem da câmera o desabilita até
  // existir a primeira foto, e o reset acima desfaria isso.
  if (f.semArquivo && f.preparar) f.preparar([]);

  // O endereço guarda a ferramenta aberta: voltar pelo botão do navegador
  // volta para a grade, e um link para uma ferramenta específica funciona.
  history.pushState({ id: f.id }, '', '#' + f.id);
  window.scrollTo(0, 0);
}

function fechar() {
  desligarCamera();
  atual = null;
  escolhidos = [];
  $('tela').hidden = true;
  $('grade').hidden = false;
  window.scrollTo(0, 0);
}

$('voltar').addEventListener('click', () => {
  if (location.hash) history.pushState(null, '', location.pathname);
  fechar();
});

window.addEventListener('popstate', () => {
  const f = FERRAMENTAS.find((x) => '#' + x.id === location.hash);
  if (f) abrir(f); else fechar();
});

// Link direto para uma ferramenta.
(function aoEntrar() {
  const f = FERRAMENTAS.find((x) => '#' + x.id === location.hash);
  if (f) abrir(f);
})();

/* ------------------------------------------------------------------ *
 * Escolha dos arquivos
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
  if (e.dataTransfer.files.length) receber([...e.dataTransfer.files]);
});

function serve(arquivo) {
  if (!atual) return false;
  if (atual.aceita === 'image/*') return arquivo.type.startsWith('image/');
  return arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name);
}

function receber(arquivos) {
  const bons = arquivos.filter(serve);
  if (!bons.length) {
    return dizer(atual.aceita === 'image/*'
      ? 'Escolha arquivos de imagem.'
      : 'Escolha arquivos PDF.', true);
  }

  escolhidos = atual.varios ? escolhidos.concat(bons) : [bons[0]];
  $('drop').hidden = true;
  $('trabalho').hidden = false;
  $('maisArquivos').hidden = !atual.varios;
  $('estado').hidden = true;
  listar();

  // Ferramentas que escolhem POSIÇÃO montam a prévia da página aqui. É depois
  // do arquivo chegar porque a prévia é desenhada a partir dele.
  if (atual.preparar) {
    dizer('Abrindo a página…');
    atual.preparar(escolhidos)
      .then(() => { $('estado').hidden = true; })
      .catch((e) => dizer(e.message || 'Não deu para abrir este PDF.', true));
  }
}

// Escolher mais arquivos depois do primeiro. A área de soltar some quando o
// trabalho começa, e sem este botão não sobrava nenhum caminho para o segundo
// arquivo — que em "Juntar PDF" é o ponto inteiro da ferramenta.
$('maisArquivos').addEventListener('click', () => $('file').click());

// Soltar arquivos também funciona sobre a lista já montada, que é o gesto
// natural de quem quer acrescentar mais um.
['dragenter', 'dragover'].forEach((ev) =>
  $('trabalho').addEventListener(ev, (e) => {
    if (!atual || !atual.varios) return;
    e.preventDefault();
    $('trabalho').classList.add('recebendo');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  $('trabalho').addEventListener(ev, (e) => {
    if (ev === 'dragleave' && $('trabalho').contains(e.relatedTarget)) return;
    $('trabalho').classList.remove('recebendo');
  })
);
$('trabalho').addEventListener('drop', (e) => {
  if (!atual || !atual.varios || !e.dataTransfer.files.length) return;
  e.preventDefault();
  receber([...e.dataTransfer.files]);
});

/**
 * A lista dos arquivos escolhidos, arrastável quando a ordem importa —
 * em "juntar" e "JPG para PDF" a ordem é o resultado.
 */
function listar() {
  $('arquivos').innerHTML = escolhidos.map((a, i) => `
    <div class="pdf-arquivo" draggable="${!!atual.varios}" data-i="${i}">
      <span class="pdf-arquivo-nome">${a.name}</span>
      <span class="pdf-arquivo-peso">${tamanho(a.size)}</span>
      <button class="pdf-tirar" data-tirar="${i}" type="button" title="Tirar da lista">✕</button>
    </div>`).join('');

  // Contagem de páginas só do primeiro: abrir dez PDFs grandes só para
  // escrever um número faria a tela travar antes de a pessoa fazer nada.
  if (escolhidos.length && atual.aceita !== 'image/*') {
    PDF.informacoes(escolhidos[0])
      .then((i) => {
        const alvo = $('arquivos').firstElementChild;
        if (alvo) alvo.querySelector('.pdf-arquivo-peso').textContent =
          i.paginas + (i.paginas === 1 ? ' página · ' : ' páginas · ') + tamanho(i.bytes);
      })
      .catch(() => { /* arquivo ilegível: o erro aparece ao executar */ });
  }
}

$('arquivos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tirar]');
  if (!b) return;
  escolhidos.splice(Number(b.dataset.tirar), 1);
  if (!escolhidos.length) {
    $('trabalho').hidden = true;
    $('maisArquivos').hidden = true;
    $('drop').hidden = false;
    return;
  }
  listar();
});

// Arrastar para reordenar.
let arrastando = null;
$('arquivos').addEventListener('dragstart', (e) => {
  const item = e.target.closest('[data-i]');
  if (!item) return;
  arrastando = Number(item.dataset.i);
  item.classList.add('arrastando');
});
$('arquivos').addEventListener('dragover', (e) => e.preventDefault());
$('arquivos').addEventListener('drop', (e) => {
  const item = e.target.closest('[data-i]');
  if (!item || arrastando === null) return;
  e.preventDefault();
  const [movido] = escolhidos.splice(arrastando, 1);
  escolhidos.splice(Number(item.dataset.i), 0, movido);
  arrastando = null;
  listar();
});
$('arquivos').addEventListener('dragend', () => {
  arrastando = null;
  for (const el of $('arquivos').children) el.classList.remove('arrastando');
});

$('limpar').addEventListener('click', () => {
  escolhidos = [];
  $('extra').innerHTML = '';
  $('extra').hidden = true;
  $('trabalho').hidden = true;
  $('maisArquivos').hidden = true;
  $('drop').hidden = false;
  $('estado').hidden = true;
});

/* ------------------------------------------------------------------ *
 * Executar
 * ------------------------------------------------------------------ */
function dizer(texto, erro = false) {
  $('estado').hidden = false;
  $('estado').textContent = texto;
  $('estado').className = erro ? 'mq-nota pdf-erro' : 'mq-nota';
}

$('executar').addEventListener('click', async () => {
  if (!atual) return;
  // HTML colado e câmera trabalham sem arquivo escolhido; as outras precisam de
  // pelo menos um. Sem esta distinção o botão não fazia nada nessas duas, sem
  // mensagem nenhuma — o pior tipo de defeito.
  if (!atual.semArquivo && !escolhidos.length) return;

  $('executar').disabled = true;
  $('barra').hidden = false;
  $('barraPreenche').style.width = '0%';
  dizer('Trabalhando…');

  try {
    const r = await atual.rodar(escolhidos, (fracao, feito, total) => {
      $('barraPreenche').style.width = Math.round(fracao * 100) + '%';
      dizer('Página ' + feito + ' de ' + total + '…');
    });

    if (!r.semArquivo) {
      if (r.unico) PDF.baixar(r.unico.blob, r.unico.nome);
      else await PDF.baixarVarios(r.varios, r.zip);
    }

    $('barraPreenche').style.width = '100%';
    const quantos = r.unico ? 1 : r.varios ? r.varios.length : 0;
    dizer(r.recado || (quantos === 1
      ? 'Pronto. O arquivo foi baixado.'
      : 'Pronto. ' + quantos + ' arquivos baixados num .zip.'));
  } catch (err) {
    dizer(err.message || 'Não deu certo com este arquivo.', true);
  } finally {
    $('executar').disabled = false;
    $('barra').hidden = true;
  }
});

/* ------------------------------------------------------------------ *
 * Recortar: moldura arrastável sobre a página
 * ------------------------------------------------------------------ */

/** Sobras de cada lado, em fração. É o que a ferramenta manda para o motor. */
let corte = { esq: 0, dir: 0, topo: 0, base: 0 };
let paginaDaPrevia = 1;

async function montarRecorte(arquivos) {
  corte = { esq: 0, dir: 0, topo: 0, base: 0 };
  paginaDaPrevia = 1;

  $('extra').hidden = false;
  $('extra').innerHTML = `
    <div class="pdf-previa">
      <div class="pdf-folha" id="folha">
        <div class="pdf-corte" id="caixaCorte">
          <span class="pdf-alca" data-lado="topo"></span>
          <span class="pdf-alca" data-lado="base"></span>
          <span class="pdf-alca" data-lado="esq"></span>
          <span class="pdf-alca" data-lado="dir"></span>
        </div>
      </div>
      <div class="pdf-previa-pe">
        <button class="btn ghost" data-ir="-1" type="button">‹</button>
        <span id="previaConta">—</span>
        <button class="btn ghost" data-ir="1" type="button">›</button>
        <button class="btn ghost" id="corteZerar" type="button">Sem corte</button>
      </div>
    </div>`;

  await trocarPagina(arquivos[0], 1);
  aplicarCaixa();

  $('extra').addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) await trocarPagina(arquivos[0], paginaDaPrevia + Number(ir.dataset.ir));
    if (e.target.id === 'corteZerar') {
      corte = { esq: 0, dir: 0, topo: 0, base: 0 };
      aplicarCaixa();
    }
  });

  arrastarMolduras();
}

let totalDaPrevia = 1;

async function trocarPagina(arquivo, n) {
  const { canvas, paginas } = await PDF.renderizarPagina(arquivo, n, 440);
  totalDaPrevia = paginas;
  paginaDaPrevia = Math.min(Math.max(1, n), paginas);

  const folha = $('folha');
  const antiga = folha.querySelector('canvas');
  if (antiga) antiga.remove();
  folha.prepend(canvas);
  folha.style.width = canvas.width + 'px';
  folha.style.height = canvas.height + 'px';

  const conta = $('previaConta');
  if (conta) conta.textContent = 'Página ' + paginaDaPrevia + ' de ' + paginas;
}

/** Desenha a moldura a partir das frações. */
function aplicarCaixa() {
  const c = $('caixaCorte');
  if (!c) return;
  c.style.left = (corte.esq * 100) + '%';
  c.style.right = (corte.dir * 100) + '%';
  c.style.top = (corte.topo * 100) + '%';
  c.style.bottom = (corte.base * 100) + '%';
}

/**
 * Arrastar as quatro bordas.
 *
 * Cada lado é limitado a deixar pelo menos 10% de página: sem esse piso dá para
 * arrastar uma borda por cima da outra, e o resultado é uma página de tamanho
 * negativo que o leitor de PDF recusa abrir.
 */
function arrastarMolduras() {
  const folha = $('folha');
  if (!folha) return;
  let lado = null;

  folha.addEventListener('pointerdown', (e) => {
    const alca = e.target.closest('[data-lado]');
    if (!alca) return;
    e.preventDefault();
    lado = alca.dataset.lado;
    try { folha.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
  });

  folha.addEventListener('pointermove', (e) => {
    if (!lado) return;
    const r = folha.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));

    if (lado === 'esq') corte.esq = Math.min(fx, 1 - corte.dir - 0.1);
    if (lado === 'dir') corte.dir = Math.min(1 - fx, 1 - corte.esq - 0.1);
    if (lado === 'topo') corte.topo = Math.min(fy, 1 - corte.base - 0.1);
    if (lado === 'base') corte.base = Math.min(1 - fy, 1 - corte.topo - 0.1);

    for (const k of Object.keys(corte)) corte[k] = Math.max(0, corte[k]);
    aplicarCaixa();
  });

  ['pointerup', 'pointercancel'].forEach((ev) =>
    folha.addEventListener(ev, () => { lado = null; })
  );
}

/* ------------------------------------------------------------------ *
 * Assinar: quadro de desenho e posicionamento
 * ------------------------------------------------------------------ */

/** Canto superior esquerdo da assinatura, em fração da página. */
let assinatura = { x: 0.55, y: 0.72 };
let imagemDaAssinatura = null;   // quando a pessoa manda uma foto em vez de desenhar
let riscou = false;

async function montarAssinatura(arquivos) {
  assinatura = { x: 0.55, y: 0.72 };
  imagemDaAssinatura = null;
  riscou = false;
  paginaDaPrevia = 1;

  $('extra').hidden = false;
  $('extra').innerHTML = `
    <div class="pdf-assinar">
      <span class="aj-titulo">1 · Desenhe a sua assinatura</span>
      <canvas class="pdf-prancheta" id="prancheta" width="640" height="200"></canvas>
      <div class="pdf-previa-pe">
        <button class="btn ghost" id="asLimpar" type="button">Apagar e refazer</button>
        <button class="btn ghost" id="asImagem" type="button">Usar uma foto</button>
        <input type="file" id="asArquivo" accept="image/*" hidden />
      </div>
    </div>

    <div class="pdf-assinar">
      <span class="aj-titulo">2 · Arraste para o lugar certo</span>
      <div class="pdf-previa">
        <div class="pdf-folha" id="folha">
          <img class="pdf-carimbo" id="carimbo" alt="" hidden />
        </div>
        <div class="pdf-previa-pe">
          <button class="btn ghost" data-ir="-1" type="button">‹</button>
          <span id="previaConta">—</span>
          <button class="btn ghost" data-ir="1" type="button">›</button>
        </div>
      </div>
    </div>`;

  await trocarPagina(arquivos[0], 1);
  prepararPrancheta();
  posicionarCarimbo();

  $('extra').addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) {
      await trocarPagina(arquivos[0], paginaDaPrevia + Number(ir.dataset.ir));
      posicionarCarimbo();
    }
    if (e.target.id === 'asLimpar') limparPrancheta();
    if (e.target.id === 'asImagem') $('asArquivo').click();
  });

  $('asArquivo').addEventListener('change', async () => {
    const f = $('asArquivo').files[0];
    if (!f) return;
    imagemDaAssinatura = await recortarTinta(await createImageBitmap(f));
    riscou = true;
    desenharNaPrancheta();
    atualizarCarimbo();
  });

  $('asTamanho').addEventListener('input', () => {
    $('asTamanhoVal').textContent = $('asTamanho').value + '%';
    posicionarCarimbo();
  });

  arrastarCarimbo();
}

/**
 * A prancheta guarda tinta com FUNDO TRANSPARENTE, e o branco que se vê vem do
 * CSS. Se o fundo fosse pintado, a assinatura chegaria no documento dentro de
 * um retângulo branco, tapando o que estivesse embaixo — que é exatamente o
 * problema com assinatura escaneada de celular.
 */
function prepararPrancheta() {
  const cv = $('prancheta');
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b1020';

  let riscando = false;
  let ultimo = null;

  const ponto = (e) => {
    const r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (cv.width / r.width),
      y: (e.clientY - r.top) * (cv.height / r.height),
    };
  };

  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    imagemDaAssinatura = null;   // desenhar à mão descarta a foto escolhida antes
    riscando = true;
    riscou = true;
    ultimo = ponto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.x, ultimo.y);
    ctx.lineTo(ultimo.x + 0.01, ultimo.y);
    ctx.stroke();
  });

  cv.addEventListener('pointermove', (e) => {
    if (!riscando) return;
    const p = ponto(e);
    ctx.beginPath();
    ctx.moveTo(ultimo.x, ultimo.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo = p;
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
    cv.addEventListener(ev, () => {
      if (!riscando) return;
      riscando = false;
      atualizarCarimbo();
    })
  );
}

function limparPrancheta() {
  const cv = $('prancheta');
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  imagemDaAssinatura = null;
  riscou = false;
  $('carimbo').hidden = true;
}

function desenharNaPrancheta() {
  const cv = $('prancheta');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!imagemDaAssinatura) return;
  const k = Math.min(cv.width / imagemDaAssinatura.width, cv.height / imagemDaAssinatura.height);
  const w = imagemDaAssinatura.width * k;
  const h = imagemDaAssinatura.height * k;
  ctx.drawImage(imagemDaAssinatura, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
}

/**
 * Tira o fundo claro de uma assinatura fotografada e corta a folga em volta.
 *
 * Sem isto, a foto entra no documento como um retângulo de papel por cima do
 * texto. O limiar é alto de propósito: papel branco fotografado quase nunca é
 * branco puro, e cortar só em 255 não removeria nada.
 */
async function recortarTinta(bitmap) {
  const cv = document.createElement('canvas');
  cv.width = bitmap.width;
  cv.height = bitmap.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const d = ctx.getImageData(0, 0, cv.width, cv.height);
  let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0, tinta = 0;

  for (let i = 0; i < d.data.length; i += 4) {
    const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    if (lum > 190) {
      d.data[i + 3] = 0;            // fundo vira transparente
    } else {
      tinta++;
      const p = i / 4;
      const x = p % cv.width;
      const y = Math.floor(p / cv.width);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  ctx.putImageData(d, 0, 0);
  if (!tinta) return await createImageBitmap(cv);

  const folga = 6;
  x0 = Math.max(0, x0 - folga); y0 = Math.max(0, y0 - folga);
  x1 = Math.min(cv.width - 1, x1 + folga); y1 = Math.min(cv.height - 1, y1 + folga);

  const corte2 = document.createElement('canvas');
  corte2.width = x1 - x0 + 1;
  corte2.height = y1 - y0 + 1;
  corte2.getContext('2d').drawImage(cv, x0, y0, corte2.width, corte2.height, 0, 0, corte2.width, corte2.height);
  return await createImageBitmap(corte2);
}

/** O PNG que vai para o documento, já sem a folga em volta da tinta. */
async function pngDaAssinatura() {
  if (!riscou) return null;
  const cv = $('prancheta');
  const bitmap = await createImageBitmap(cv);
  const limpo = await recortarTinta(bitmap);

  const saida = document.createElement('canvas');
  saida.width = limpo.width;
  saida.height = limpo.height;
  saida.getContext('2d').drawImage(limpo, 0, 0);
  const blob = await new Promise((r) => saida.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

async function atualizarCarimbo() {
  const png = await pngDaAssinatura();
  const img = $('carimbo');
  if (!png || !img) return;
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  img.dataset.url = url;
  img.src = url;
  img.hidden = false;
  posicionarCarimbo();
}

function posicionarCarimbo() {
  const img = $('carimbo');
  if (!img) return;
  img.style.left = (assinatura.x * 100) + '%';
  img.style.top = (assinatura.y * 100) + '%';
  img.style.width = ($('asTamanho') ? Number($('asTamanho').value) : 28) + '%';
}

function arrastarCarimbo() {
  const folha = $('folha');
  const img = $('carimbo');
  if (!folha || !img) return;
  let pegou = null;

  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { img.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    const r = folha.getBoundingClientRect();
    const c = img.getBoundingClientRect();
    // Guarda onde DENTRO da assinatura a pessoa pegou, senão ela pula para
    // debaixo do cursor no primeiro movimento.
    pegou = { dx: (e.clientX - c.left) / r.width, dy: (e.clientY - c.top) / r.height };
  });

  img.addEventListener('pointermove', (e) => {
    if (!pegou) return;
    const r = folha.getBoundingClientRect();
    assinatura.x = Math.min(0.99, Math.max(0, (e.clientX - r.left) / r.width - pegou.dx));
    assinatura.y = Math.min(0.99, Math.max(0, (e.clientY - r.top) / r.height - pegou.dy));
    posicionarCarimbo();
  });

  ['pointerup', 'pointercancel'].forEach((ev) =>
    img.addEventListener(ev, () => { pegou = null; })
  );
}

/* ------------------------------------------------------------------ *
 * Comparar: a lista do que mudou
 * ------------------------------------------------------------------ */
function mostrarComparacao(paginas) {
  $('extra').hidden = false;
  $('extra').innerHTML = '<span class="aj-titulo">O que mudou</span>'
    + '<div class="pdf-diferencas">'
    + paginas.map((p) => {
      if (p.so) {
        return '<div class="pdf-diferenca"><strong>Página ' + p.pagina + '</strong>'
          + '<span>existe só no ' + (p.so === 'primeiro' ? 'arquivo antigo' : 'arquivo novo') + '</span></div>';
      }
      const pct = p.diferenca * 100;
      if (pct < 0.05) {
        return '<div class="pdf-diferenca igual"><strong>Página ' + p.pagina + '</strong><span>igual</span></div>';
      }
      const url = URL.createObjectURL(p.imagem);
      return '<div class="pdf-diferenca"><strong>Página ' + p.pagina + '</strong>'
        + '<span>' + pct.toFixed(pct < 1 ? 2 : 1) + '% da página mudou</span>'
        + '<img src="' + url + '" alt="Página ' + p.pagina + ' com as mudanças em vermelho" /></div>';
    }).join('')
    + '</div>';
}

/**
 * Mostra o campo de senha atual só quando o arquivo realmente pede uma.
 *
 * Deixar o campo sempre visível faria a maioria das pessoas achar que precisa
 * inventar uma senha para um arquivo que nunca teve senha nenhuma.
 */
async function mostrarCampoDeSenha(arquivos) {
  const campo = $('campoAtual');
  if (!campo) return;
  const pede = await PDF.pedeSenha(arquivos[0]);
  campo.hidden = !pede;
  if (pede) dizer('Este arquivo pede senha para abrir. Escreva-a no campo acima.');
}


/** Mostra na tela o texto gerado — resumo e tradução, que valem mais lidos do que baixados. */
function mostrarTexto(titulo, texto) {
  $('extra').hidden = false;
  $('extra').innerHTML = '<span class="aj-titulo"></span><pre class="pdf-saida"></pre>';
  $('extra').querySelector('.aj-titulo').textContent = titulo;
  $('extra').querySelector('.pdf-saida').textContent = texto;
}

/* ------------------------------------------------------------------ *
 * Editar: escrever clicando na página
 * ------------------------------------------------------------------ */
let anotacoes = [];

function corDoCampo(hex) {
  const n = parseInt(String(hex || '#111827').slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

async function montarEdicao(arquivos) {
  anotacoes = [];
  paginaDaPrevia = 1;

  $('extra').hidden = false;
  $('extra').innerHTML = `
    <div class="pdf-previa">
      <div class="pdf-folha pdf-folha-clicavel" id="folha"></div>
      <div class="pdf-previa-pe">
        <button class="btn ghost" data-ir="-1" type="button">‹</button>
        <span id="previaConta">—</span>
        <button class="btn ghost" data-ir="1" type="button">›</button>
      </div>
      <p class="ed-hint">Escreva no campo acima e clique na página para colocar o texto.
      Clique num texto já colocado para tirá-lo.</p>
    </div>`;

  await trocarPagina(arquivos[0], 1);

  $('extra').addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) { await trocarPagina(arquivos[0], paginaDaPrevia + Number(ir.dataset.ir)); desenharAnotacoes(); }
  });

  $('edTamanho').addEventListener('input', () => {
    $('edTamanhoVal').textContent = (Number($('edTamanho').value) / 10).toFixed(1) + '%';
  });

  $('folha').addEventListener('click', (e) => {
    // Clicar num texto já colocado tira aquele texto, em vez de empilhar outro
    // por cima — que é o que acontece quando alguém erra o lugar.
    const jaTem = e.target.closest('[data-anotacao]');
    if (jaTem) {
      anotacoes.splice(Number(jaTem.dataset.anotacao), 1);
      desenharAnotacoes();
      return;
    }
    const texto = $('edTexto').value.trim();
    if (!texto) { dizer('Escreva o texto no campo acima antes de clicar na página.', true); return; }

    const r = $('folha').getBoundingClientRect();
    anotacoes.push({
      pagina: paginaDaPrevia,
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      texto,
      tamanho: Number($('edTamanho').value) / 1000,
      negrito: $('edNegrito').checked,
      cor: corDoCampo($('edCor').value),
      corHex: $('edCor').value,
    });
    $('estado').hidden = true;
    desenharAnotacoes();
  });
}

function desenharAnotacoes() {
  const folha = $('folha');
  if (!folha) return;
  for (const velho of folha.querySelectorAll('[data-anotacao]')) velho.remove();

  anotacoes.forEach((a, i) => {
    if (a.pagina !== paginaDaPrevia) return;
    const el = document.createElement('span');
    el.className = 'pdf-anotacao';
    el.dataset.anotacao = i;
    el.textContent = a.texto;
    el.style.left = (a.x * 100) + '%';
    el.style.top = (a.y * 100) + '%';
    el.style.color = a.corHex;
    el.style.fontWeight = a.negrito ? '700' : '400';
    // O tamanho é fração da ALTURA da página, igual ao que o motor usa: assim o
    // que se vê na prévia é do mesmo tamanho que vai sair no arquivo.
    el.style.fontSize = (a.tamanho * folha.clientHeight) + 'px';
    folha.append(el);
  });
}

/* ------------------------------------------------------------------ *
 * Ocultar: arrastar tarjas sobre a página
 * ------------------------------------------------------------------ */
let tarjas = [];

async function montarOcultar(arquivos) {
  tarjas = [];
  paginaDaPrevia = 1;

  $('extra').hidden = false;
  $('extra').innerHTML = `
    <div class="pdf-previa">
      <div class="pdf-folha pdf-folha-tarja" id="folha"></div>
      <div class="pdf-previa-pe">
        <button class="btn ghost" data-ir="-1" type="button">‹</button>
        <span id="previaConta">—</span>
        <button class="btn ghost" data-ir="1" type="button">›</button>
        <button class="btn ghost" id="tarjaLimpar" type="button">Tirar todas</button>
      </div>
    </div>`;

  await trocarPagina(arquivos[0], 1);

  $('extra').addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) { await trocarPagina(arquivos[0], paginaDaPrevia + Number(ir.dataset.ir)); desenharTarjas(); }
    if (e.target.id === 'tarjaLimpar') { tarjas = []; desenharTarjas(); }
  });

  arrastarTarja();
}

function arrastarTarja() {
  const folha = $('folha');
  if (!folha) return;
  let inicio = null;
  let provisoria = null;

  const ponto = (e) => {
    const r = folha.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  folha.addEventListener('pointerdown', (e) => {
    const existente = e.target.closest('[data-tarja]');
    if (existente) { tarjas.splice(Number(existente.dataset.tarja), 1); desenharTarjas(); return; }
    e.preventDefault();
    try { folha.setPointerCapture(e.pointerId); } catch { /* ponteiro já solto */ }
    inicio = ponto(e);
    provisoria = document.createElement('div');
    provisoria.className = 'pdf-tarja provisoria';
    folha.append(provisoria);
  });

  folha.addEventListener('pointermove', (e) => {
    if (!inicio || !provisoria) return;
    const p = ponto(e);
    provisoria.style.left = (Math.min(inicio.x, p.x) * 100) + '%';
    provisoria.style.top = (Math.min(inicio.y, p.y) * 100) + '%';
    provisoria.style.width = (Math.abs(p.x - inicio.x) * 100) + '%';
    provisoria.style.height = (Math.abs(p.y - inicio.y) * 100) + '%';
  });

  ['pointerup', 'pointercancel'].forEach((ev) =>
    folha.addEventListener(ev, (e) => {
      if (!inicio) return;
      const p = ponto(e);
      const larg = Math.abs(p.x - inicio.x);
      const alt = Math.abs(p.y - inicio.y);
      // Um clique sem arrastar não pode virar uma tarja de tamanho zero
      // invisível que a pessoa nunca conseguiria tirar.
      if (larg > 0.01 && alt > 0.005) {
        tarjas.push({
          pagina: paginaDaPrevia,
          x: Math.min(inicio.x, p.x), y: Math.min(inicio.y, p.y),
          w: larg, h: alt,
        });
      }
      inicio = null;
      if (provisoria) { provisoria.remove(); provisoria = null; }
      desenharTarjas();
    })
  );
}

function desenharTarjas() {
  const folha = $('folha');
  if (!folha) return;
  for (const velha of folha.querySelectorAll('[data-tarja]')) velha.remove();

  tarjas.forEach((t, i) => {
    if (t.pagina !== paginaDaPrevia) return;
    const el = document.createElement('div');
    el.className = 'pdf-tarja';
    el.dataset.tarja = i;
    el.title = 'Clique para tirar';
    el.style.left = (t.x * 100) + '%';
    el.style.top = (t.y * 100) + '%';
    el.style.width = (t.w * 100) + '%';
    el.style.height = (t.h * 100) + '%';
    folha.append(el);
  });
}

/* ------------------------------------------------------------------ *
 * Formulários
 * ------------------------------------------------------------------ */
async function montarFormulario(arquivos) {
  const campos = await PDF.camposDoFormulario(arquivos[0]);
  const uteis = campos.filter((c) => c.tipo !== 'outro');

  $('extra').hidden = false;
  if (!uteis.length) {
    $('extra').innerHTML = '<p class="pdf-aviso">Este PDF não tem campos preenchíveis. '
      + 'Ele provavelmente é um formulário só desenhado — nesse caso use "Editar PDF", '
      + 'que escreve por cima da página.</p>';
    $('executar').disabled = true;
    return;
  }

  $('executar').disabled = false;
  $('extra').innerHTML = '<span class="aj-titulo">' + uteis.length
    + (uteis.length === 1 ? ' campo encontrado' : ' campos encontrados') + '</span>'
    + '<div class="pdf-campos">' + uteis.map((c) => {
      const rotulo = c.nome.replace(/[_.]/g, ' ');
      if (c.tipo === 'caixa') {
        return `<label class="switch small">
          <input type="checkbox" data-campo="${c.nome}" ${c.valor ? 'checked' : ''} />
          <span class="track"><span class="knob"></span></span>
          <span class="switch-text">${rotulo}</span>
        </label>`;
      }
      if (c.tipo === 'lista' || c.tipo === 'escolha') {
        return `<label class="ed-field">${rotulo}
          <select data-campo="${c.nome}">
            <option value="">—</option>
            ${(c.opcoes || []).map((o) => `<option ${o === c.valor ? 'selected' : ''}>${o}</option>`).join('')}
          </select></label>`;
      }
      return `<label class="ed-field">${rotulo}
        <input type="text" data-campo="${c.nome}" value="${String(c.valor || '').replace(/"/g, '&quot;')}" />
      </label>`;
    }).join('') + '</div>';
}

/* ------------------------------------------------------------------ *
 * Digitalizar com a câmera
 * ------------------------------------------------------------------ */
let capturas = [];
let camera = null;

async function montarCamera() {
  capturas = [];

  $('extra').hidden = false;
  $('extra').innerHTML = `
    <div class="pdf-camera">
      <video id="dgVideo" playsinline muted></video>
      <p class="ed-hint" id="dgAviso">Ligue a câmera, enquadre a folha e fotografe cada página.</p>
      <div class="pdf-previa-pe">
        <button class="btn primary" id="dgLigar" type="button">Ligar a câmera</button>
        <button class="btn ghost" id="dgTirar" type="button" hidden>Fotografar página</button>
        <button class="btn ghost" id="dgEscolher" type="button">Escolher fotos do aparelho</button>
        <input type="file" id="dgArquivos" accept="image/*" multiple hidden />
      </div>
      <div class="pdf-capturas" id="dgCapturas"></div>
    </div>`;

  $('executar').disabled = true;

  $('dgLigar').addEventListener('click', ligarCamera);
  $('dgTirar').addEventListener('click', fotografar);
  $('dgEscolher').addEventListener('click', () => $('dgArquivos').click());
  $('dgArquivos').addEventListener('change', () => {
    for (const f of $('dgArquivos').files) capturas.push(f);
    $('dgArquivos').value = '';
    listarCapturas();
  });

  $('dgCapturas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-captura]');
    if (!b) return;
    capturas.splice(Number(b.dataset.captura), 1);
    listarCapturas();
  });
}

async function ligarCamera() {
  try {
    // facingMode 'environment' pede a câmera de trás no celular, que é a que
    // enxerga o papel na mesa; no computador o navegador ignora e usa a única.
    camera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      audio: false,
    });
    $('dgVideo').srcObject = camera;
    await $('dgVideo').play();
    $('dgVideo').classList.add('ligada');
    $('dgLigar').hidden = true;
    $('dgTirar').hidden = false;
    $('dgAviso').textContent = 'Encoste a folha numa superfície plana, com luz, e fotografe.';
  } catch (e) {
    $('dgAviso').textContent = e.name === 'NotAllowedError'
      ? 'Você precisa permitir o acesso à câmera. Se recusou sem querer, permita nas '
        + 'configurações do site e tente de novo.'
      : 'Não consegui abrir a câmera neste aparelho (' + e.message + '). '
        + 'Dá para escolher fotos já tiradas no botão ao lado.';
  }
}

async function fotografar() {
  const video = $('dgVideo');
  const cv = document.createElement('canvas');
  cv.width = video.videoWidth;
  cv.height = video.videoHeight;
  cv.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.94));
  capturas.push(new File([blob], 'foto-' + (capturas.length + 1) + '.jpg', { type: 'image/jpeg' }));
  listarCapturas();
}

function listarCapturas() {
  const caixa = $('dgCapturas');
  if (!caixa) return;

  // Os endereços antigos são devolvidos antes de montar a lista nova, senão
  // cada foto tirada deixaria uma cópia presa na memória até fechar a aba.
  for (const img of caixa.querySelectorAll('img')) URL.revokeObjectURL(img.src);

  caixa.innerHTML = capturas.map((f, i) =>
    '<div class="pdf-captura"><img src="' + URL.createObjectURL(f) + '" alt="Página ' + (i + 1) + '" />'
    + '<button data-captura="' + i + '" type="button" title="Tirar">✕</button>'
    + '<span>' + (i + 1) + '</span></div>').join('');

  $('executar').disabled = !capturas.length;
  if (capturas.length) dizer(capturas.length + (capturas.length === 1 ? ' página capturada.' : ' páginas capturadas.'));
}

/** A câmera precisa ser desligada ao sair, senão a luz fica acesa. */
function desligarCamera() {
  if (!camera) return;
  for (const faixa of camera.getTracks()) faixa.stop();
  camera = null;
}


/**
 * Escreve no próprio botão quanto vai ser baixado, quando for o caso.
 *
 * O aviso em texto some no meio dos outros; o rótulo do botão é a última coisa
 * que a pessoa lê antes de clicar. E some sozinho depois da primeira vez,
 * porque aí não há mais download nenhum para avisar.
 */
async function avisarPesoDoTradutor() {
  const botao = $('executar');
  if (!botao) return;
  botao.textContent = 'Fazer agora';

  if ('Translator' in self) return;              // o navegador traduz sozinho
  if (await PDF.tradutorJaBaixado()) return;     // já está guardado aqui

  botao.textContent = 'Baixar o modelo (' + PDF.PESO_DO_TRADUTOR + ' MB) e traduzir';
}
