/**
 * Gera as páginas de busca a partir de conteudo-buscas.mjs.
 *
 * POR QUE UM GERADOR: são oito páginas que compartilham cabeçalho, rodapé,
 * estilos e dados estruturados. Escritas à mão, a nona já sairia diferente das
 * outras e uma correção no cabeçalho teria que ser repetida oito vezes. O que
 * NÃO é gerado é o texto: ele vem escrito à mão, um por tarefa, porque página
 * de busca sem conteúdo próprio é exatamente o que o Google penaliza.
 *
 * Roda com: node gerar-buscas.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { BUSCAS } from './conteudo-buscas.mjs';

const SITE = 'https://editorbg.com.br';

const escapar = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O mesmo cabeçalho das outras páginas, com a marca de quatro plaquetas. */
const CABECALHO = `
<header class="topbar">
  <a class="brand" href="/" title="Voltar para o início">
    <div class="logo-marca" aria-hidden="true">
      <span class="logo-tile logo-recorte">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2.5v15h15"/><path d="M2.5 6.5h15v15"/></svg>
      </span>
      <span class="logo-tile logo-brilho">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 3.5 11.6 8 16 9.6 11.6 11.2 10 15.7 8.4 11.2 4 9.6 8.4 8Z"/>
          <path d="M17 15.2 17.8 17.4 20 18.2 17.8 19 17 21.2 16.2 19 14 18.2 16.2 17.4Z"/>
        </svg>
      </span>
      <span class="logo-tile logo-tesoura">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/>
          <path d="M20 4 8.7 16.2"/><path d="M20 20 8.7 7.8"/>
        </svg>
      </span>
      <span class="logo-tile logo-pdf">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M13.5 3H7a1.4 1.4 0 0 0-1.4 1.4v15.2A1.4 1.4 0 0 0 7 21h10a1.4 1.4 0 0 0 1.4-1.4V8Z"/>
          <path d="M13.5 3v5h4.9"/>
        </svg>
      </span>
    </div>
    <div>
      <h1>EditorBG</h1>
      <p>Ferramentas de PDF e imagem — direto no seu navegador</p>
    </div>
  </a>
</header>`;

function pagina(b, outras) {
  const url = SITE + '/' + b.arquivo;

  // O FAQ em formato de máquina TEM que bater com o que está escrito na página:
  // o Google penaliza dados estruturados que não existem no texto visível.
  const faqJson = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: b.faq.map(([p, r]) => ({
      '@type': 'Question',
      name: p,
      acceptedAnswer: { '@type': 'Answer', text: r },
    })),
  };

  const comoJson = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: b.h1,
    description: b.descricao,
    step: b.passos.map((p, i) => ({ '@type': 'HowToStep', position: i + 1, text: p })),
  };

  const relacionadas = outras
    .filter((o) => o.arquivo !== b.arquivo)
    .slice(0, 5)
    .map((o) => `<li><a href="/${o.arquivo}">${escapar(o.h1)}</a></li>`)
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapar(b.titulo)}</title>
  <meta name="description" content="${escapar(b.descricao)}" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128196;</text></svg>" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="EditorBG" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escapar(b.titulo)}" />
  <meta property="og:description" content="${escapar(b.descricao)}" />
  <meta property="og:image" content="${SITE}/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />

  <link rel="stylesheet" href="css/style.css" />

  <script type="application/ld+json">
${JSON.stringify(comoJson, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqJson, null, 2)}
  </script>
</head>
<body data-mode="busca">
${CABECALHO}

<main>
  <section class="busca-topo">
    <h2>${escapar(b.h1)}</h2>
    <p class="busca-resumo">${escapar(b.resumo)}</p>
    <a class="btn primary busca-cta" href="${b.ferramenta}">Abrir a ferramenta →</a>
    <p class="busca-selo">Grátis · sem cadastro · o arquivo não sai do seu computador</p>
  </section>

  <section class="conteudo">
    <h2>Como fazer</h2>
    <ol class="busca-passos">
      ${b.passos.map((p) => `<li>${escapar(p)}</li>`).join('\n      ')}
    </ol>

    ${b.corpo.map(([t, p]) => `<h3>${escapar(t)}</h3>\n    <p>${escapar(p)}</p>`).join('\n\n    ')}

    <h3>Por que aqui o arquivo não sobe para um servidor</h3>
    <p>
      As outras ferramentas de PDF da internet recebem o seu arquivo num
      servidor, fazem o trabalho lá e devolvem. Significa que um contrato, um
      holerite ou um exame passou pela máquina de outra pessoa. Aqui quem faz a
      conta é o seu navegador: o arquivo nunca sai do aparelho, e depois que a
      página carregou você pode até desligar a internet.
    </p>

    <h2>Perguntas frequentes</h2>
    ${b.faq.map(([p, r]) => `<details class="faq">
      <summary>${escapar(p)}</summary>
      <p>${escapar(r)}</p>
    </details>`).join('\n    ')}

    <h2>Outras ferramentas</h2>
    <ul class="busca-relacionadas">
        ${relacionadas}
        <li><a href="/pdf">Ver todas as 32 ferramentas de PDF</a></li>
    </ul>
  </section>
</main>

</body>
</html>
`;
}

let feitas = 0;
for (const b of BUSCAS) {
  writeFileSync(b.arquivo + '.html', pagina(b, BUSCAS), 'utf8');
  console.log('  ' + b.arquivo + '.html');
  feitas++;
}

/* O sitemap precisa listar as novas, senão elas existem e ninguém as encontra. */
const fixas = ['/', '/remover-fundo', '/editar', '/melhorar', '/pdf'];
const linhas = [
  ...fixas.map((u) => ({ loc: SITE + (u === '/' ? '/' : u), pri: u === '/' ? '1.0' : '0.9' })),
  ...BUSCAS.map((b) => ({ loc: SITE + '/' + b.arquivo, pri: '0.8' })),
];

writeFileSync('sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + linhas.map((l) => `  <url>\n    <loc>${l.loc}</loc>\n`
    + `    <changefreq>monthly</changefreq>\n    <priority>${l.pri}</priority>\n  </url>`).join('\n')
  + '\n</urlset>\n', 'utf8');

console.log('\n' + feitas + ' páginas e o sitemap com ' + linhas.length + ' endereços.');
