/**
 * Guarda o código de quem indicou.
 *
 * Script CLÁSSICO, como o js/ads.js e pelo mesmo motivo: as oito páginas de
 * busca não carregam módulo nenhum, e um link de indicação pode cair em
 * qualquer página do site — normalmente na da ferramenta que a pessoa estava
 * divulgando, não na inicial.
 *
 * O código fica no navegador de quem clicou, e só é enviado ao servidor na
 * hora de assinar. Ele não identifica ninguém: é o apelido público de quem
 * divulgou.
 */
(function () {
  var CHAVE = 'editorbg.indicacao';

  /*
   * Noventa dias.
   *
   * Quase ninguém clica num link e assina no mesmo minuto — a pessoa conhece a
   * ferramenta, usa de graça, volta outro dia e só então decide. Uma janela
   * curta faria o trabalho de quem divulgou sumir justamente nos casos em que
   * a indicação funcionou.
   */
  var DIAS = 90;

  function limpar(bruto) {
    return String(bruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  }

  try {
    var url = new URL(window.location.href);
    var veio = limpar(url.searchParams.get('ref') || url.searchParams.get('indicacao'));

    if (veio) {
      localStorage.setItem(CHAVE, JSON.stringify({ codigo: veio, em: Date.now() }));

      // Tira o parâmetro da barra de endereço sem recarregar: o link fica
      // limpo se a pessoa copiar para mandar a alguém, e não some do histórico.
      url.searchParams.delete('ref');
      url.searchParams.delete('indicacao');
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
    }
  } catch (e) { /* navegador sem localStorage: segue sem indicação */ }

  /** O código guardado, ou string vazia se não houver ou já ter vencido. */
  window.codigoIndicacao = function () {
    try {
      var guardado = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (!guardado || !guardado.codigo) return '';
      if (Date.now() - guardado.em > DIAS * 86400000) {
        localStorage.removeItem(CHAVE);
        return '';
      }
      return guardado.codigo;
    } catch (e) {
      return '';
    }
  };

  /** Usado quando a pessoa digita o código à mão na tela de assinatura. */
  window.guardarIndicacao = function (codigo) {
    var limpo = limpar(codigo);
    try {
      if (limpo) localStorage.setItem(CHAVE, JSON.stringify({ codigo: limpo, em: Date.now() }));
      else localStorage.removeItem(CHAVE);
    } catch (e) { /* sem localStorage, vale só nesta tela */ }
    return limpo;
  };
})();
