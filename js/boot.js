/**
 * Carrega o markup do editor (compartilhado entre as páginas) e só então importa
 * o app. O editor.js procura seus elementos por id assim que é avaliado, então a
 * importação precisa vir depois da injeção — por isso é dinâmica.
 */
export async function boot() {
  const html = await fetch('partials/editor.html').then((r) => {
    if (!r.ok) throw new Error('não foi possível carregar partials/editor.html');
    return r.text();
  });
  document.body.insertAdjacentHTML('beforeend', html);
  await import('./app.js');
}
