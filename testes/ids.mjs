/**
 * Confere se todo id que o JavaScript procura existe no HTML.
 *
 * POR QUE ISTO EXISTE: `document.getElementById('naoExiste')` devolve null sem
 * reclamar, e `null.addEventListener` só quebra quando alguém clica. Foi assim
 * que o painel de melhorar qualidade nasceu com classes que não existiam no CSS
 * e que um filtro de cor mexia num campo inexistente sem fazer nada. Nenhum dos
 * dois apareceu em teste de tela — apareceram em uso.
 *
 * Roda com: node testes/ids.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ler = (p) => readFileSync(join(RAIZ, p), 'utf8');

/** Que arquivos de HTML cada página carrega, incluindo os partials injetados. */
const PAGINAS = {
  'index.html': [],
  'remover-fundo.html': ['js/app.js', 'js/editor.js', 'js/segment.js'],
  'editar.html': ['js/editar.js', 'js/editor.js'],
  'melhorar.html': ['js/pagina-melhorar.js'],
  'pdf.html': ['js/pagina-pdf.js'],
  'admin.html': ['js/admin.js'],
};

/** Partials que entram em toda página por injeção. */
const PARTIALS = readdirSync(join(RAIZ, 'partials')).map((n) => 'partials/' + n);

/** Módulos compartilhados que também mexem no DOM. */
const COMUNS = ['js/conta-ui.js', 'js/paywall.js', 'js/sliders.js'];

/**
 * Os ids que existem, venham do HTML ou de markup montado em JavaScript.
 *
 * A pagina de PDF monta os controles de cada ferramenta na hora, dentro de
 * modelos de string — os ids estao la, so nao no arquivo .html. Ignorar isso
 * encheria o relatorio de alarme falso e ninguem mais olharia para ele.
 */
function idsDisponiveis(fontes) {
  const ids = new Set();
  for (const f of fontes) {
    const texto = ler(f);
    for (const m of texto.matchAll(/ id="([^"]+)"/g)) ids.add(m[1]);
    // Os ajudantes seletor() e campoPaginas() montam o id a partir do primeiro
    // argumento, dentro de um modelo de string. Sem ler isso aqui, os controles
    // da pagina de PDF apareceriam todos como ausentes.
    for (const m of texto.matchAll(/(?:seletor|campoPaginas)\(\s*'([^']+)'/g)) ids.add(m[1]);
  }
  return ids;
}

function idsPedidosPeloJs(arquivos) {
  const pedidos = new Map();
  for (const a of arquivos) {
    const texto = ler(a);
    for (const m of texto.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
      if (!pedidos.has(m[1])) pedidos.set(m[1], a);
    }
    // O atalho $('x') é a forma usada em quase todo o projeto.
    for (const m of texto.matchAll(/\$\(\s*'([^']+)'\s*\)/g)) {
      if (!pedidos.has(m[1])) pedidos.set(m[1], a);
    }
  }
  return pedidos;
}

let problemas = 0;

for (const [pagina, scripts] of Object.entries(PAGINAS)) {
  // Toda página pode receber qualquer partial: o paywall se injeta sozinho, e o
  // editor é injetado nas duas páginas que editam.
  const usados = [...scripts, ...COMUNS].filter((f) => {
    try { ler(f); return true; } catch { return false; }
  });
  const existentes = idsDisponiveis([pagina, ...PARTIALS, ...usados]);
  const pedidos = idsPedidosPeloJs(usados);

  const faltando = [...pedidos.entries()].filter(([id]) => !existentes.has(id));

  if (faltando.length) {
    console.log('\n  ' + pagina);
    for (const [id, onde] of faltando) {
      console.log('    FALTA  #' + id + '   pedido em ' + onde);
      problemas++;
    }
  } else {
    console.log('  ok    ' + pagina);
  }
}

console.log(problemas ? '\n' + problemas + ' id(s) sem par no HTML' : '\ntodos os ids batem');
process.exit(problemas ? 1 : 0);
