/**
 * A etiqueta do Google Ads.
 *
 * Script CLÁSSICO de propósito, e não módulo: as oito páginas de busca
 * (/juntar-pdf, /pdf-para-word e as outras) não carregam JavaScript nenhum, e
 * são justamente as páginas onde o anúncio deixa a visita. Se a etiqueta
 * dependesse de um módulo importado pelas páginas de ferramenta, ela faltaria
 * exatamente onde mais importa.
 *
 * O que isto NÃO muda: nenhum arquivo de quem usa o site passa por aqui. As
 * imagens e os PDFs continuam sendo processados dentro do navegador. O que o
 * Google passa a receber é a visita — qual página foi aberta e se veio de um
 * anúncio —, como em qualquer site que anuncia.
 */
(function () {
  var TAG = 'AW-11458898012';

  /*
   * O RÓTULO DA CONVERSÃO — ISTO PRECISA SER PREENCHIDO.
   *
   * A etiqueta acima sozinha só conta visitas. Para o Google saber que uma
   * visita virou assinante, o evento de compra tem que ser enviado para uma
   * "ação de conversão", e cada ação tem um rótulo próprio.
   *
   * Onde pegar: Google Ads → Metas → Conversões → Criar ação de conversão →
   * escolher "Site". No fim ele mostra um trecho com
   * send_to: 'AW-11458898012/AbCdEfGhIj'. O que vem DEPOIS da barra é o rótulo.
   *
   * Enquanto estiver vazio, a compra não é registrada como conversão — e
   * registrar em silêncio num rótulo inventado seria pior, porque os números
   * apareceriam errados no painel sem ninguém desconfiar.
   */
  var ROTULO_COMPRA = '';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', TAG);

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + TAG;
  document.head.appendChild(s);

  /**
   * Avisa o Google que uma assinatura foi paga.
   *
   * É isto que responde a única pergunta que decide se vale continuar
   * anunciando: o anúncio traz assinante, ou só traz visita? Sem o evento, o
   * painel mostra cliques e nada mais.
   */
  window.registrarCompra = function (valor, plano) {
    if (!ROTULO_COMPRA) {
      console.warn('[ads] Compra de R$ ' + valor + ' (' + plano + ') não foi '
        + 'registrada: falta o rótulo da conversão em js/ads.js.');
      return;
    }
    gtag('event', 'conversion', {
      send_to: TAG + '/' + ROTULO_COMPRA,
      value: valor,
      currency: 'BRL',
      transaction_id: plano + '-' + Date.now(),
    });
  };
})();
