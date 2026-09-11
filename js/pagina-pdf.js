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
    nome: 'Resumir com IA',
    sobre: 'Lê o documento e escreve os pontos principais. A IA roda no seu aparelho.',
    icone: 'ia',
    aceita: 'application/pdf',
    aviso: 'A IA é a do próprio navegador e roda no seu computador: o documento não é '
      + 'enviado para lugar nenhum. Por isso depende do Chrome 138 ou mais novo, no '
      + 'computador — em outro navegador a ferramenta avisa que não dá.',
    controles: () => seletor('tipo', 'Formato do resumo', [
      ['key-points', 'Pontos principais'],
      ['tldr', 'Um parágrafo'],
      ['teaser', 'Chamada curta'],
    ]) + seletor('tamanho', 'Tamanho', [
      ['short', 'Curto'], ['medium', 'Médio'], ['long', 'Longo'],
    ]) + seletor('saida', 'O que baixar', [['txt', 'Texto (.txt)'], ['pdf', 'PDF']]),
    async rodar(arquivos, aoProgredir) {
      const texto = await PDF.paraTexto(arquivos[0]);
      if (!texto.trim()) {
        throw new Error('Este PDF não tem texto — passe pelo OCR primeiro.');
      }
      const resumo = await PDF.resumir(texto, {
        tipo: $('tipo').value, tamanho: $('tamanho').value,
      }, (f, fase, feito, total) => {
        aoProgredir(typeof f === 'number' && f <= 1 ? f : 0, feito || 0, total || 0);
        if (fase === 'baixando') dizer('Baixando o modelo de IA do navegador…');
        else if (fase === 'resumindo') dizer('Resumindo o trecho ' + feito + ' de ' + total + '…');
      });

      const base = PDF.semExtensao(arquivos[0].name);
      mostrarTexto('Resumo', resumo);
      if ($('saida').value === 'pdf') {
        return { unico: { nome: base + '-resumo.pdf', blob: await PDF.textoParaPdf(resumo, 'Resumo') },
          recado: 'Resumo pronto, abaixo e no arquivo baixado.' };
      }
      return { unico: { nome: base + '-resumo.txt', blob: new Blob([resumo], { type: 'text/plain;charset=utf-8' }) },
        recado: 'Resumo pronto, abaixo e no arquivo baixado.' };
    },
  },
  {
    id: 'traduzir',
    nome: 'Traduzir PDF',
    sobre: 'Traduz o texto do documento. A tradução roda no seu aparelho.',
    icone: 'traduzir',
    aceita: 'application/pdf',
    aviso: 'A tradução é a do próprio navegador e roda no seu computador: o documento '
      + 'não é enviado para lugar nenhum. Por isso depende do Chrome 138 ou mais novo. '
      + 'Sai o texto traduzido, não o PDF original com as palavras trocadas no lugar.',
    controles: () => seletor('de', 'Idioma do documento', PDF.IDIOMAS)
      + seletor('para', 'Traduzir para', PDF.IDIOMAS.slice().reverse())
      + seletor('saida', 'O que baixar', [['pdf', 'PDF'], ['txt', 'Texto (.txt)']]),
    async rodar(arquivos, aoProgredir) {
      const texto = await PDF.paraTexto(arquivos[0]);
      if (!texto.trim()) throw new Error('Este PDF não tem texto — passe pelo OCR primeiro.');

      const traduzido = await PDF.traduzir(texto, $('de').value, $('para').value,
        (f, fase, feito, total) => {
          aoProgredir(typeof f === 'number' && f <= 1 ? f : 0, feito || 0, total || 0);
          if (fase === 'baixando') dizer('Baixando o modelo de tradução do navegador…');
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
];

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
      <span class="pdf-icone">${ICONES[f.icone]}</span>
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
  atual = f;
  escolhidos = [];

  $('telaNome').textContent = f.nome;
  $('telaSobre').textContent = f.sobre;
  $('telaIcone').innerHTML = ICONES[f.icone];
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
  $('trabalho').hidden = true;
  $('maisArquivos').hidden = true;
  $('drop').hidden = false;
  $('estado').hidden = true;
  $('barra').hidden = true;
  $('executar').disabled = false;

  // O endereço guarda a ferramenta aberta: voltar pelo botão do navegador
  // volta para a grade, e um link para uma ferramenta específica funciona.
  history.pushState({ id: f.id }, '', '#' + f.id);
  window.scrollTo(0, 0);
}

function fechar() {
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
  if (!atual || !escolhidos.length) return;

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
