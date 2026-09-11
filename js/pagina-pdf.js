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
    ]) + seletor('formato', 'Formato', [['so', '1, 2, 3…'], ['de', '1 de 10']])
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
