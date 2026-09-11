/**
 * Tetos que dependem do aparelho.
 *
 * POR QUE ISTO EXISTE: no iPhone, o Safari mata a aba sem aviso quando a
 * memória passa de um teto rígido. Não aparece erro, não cai num catch — a
 * página simplesmente recarrega e volta vazia, como se nada tivesse
 * acontecido. Do lado do código não há nada para capturar; só dá para não
 * chegar lá. Os números abaixo são o "não chegar lá".
 *
 * O mesmo vale para o tamanho do canvas: acima de um certo número de pixels o
 * Safari do iOS não devolve erro, devolve a tela em branco. Um limite que
 * falha em silêncio é pior do que um que grita, então quem usa estes valores
 * precisa avisar a pessoa em vez de deixar o resultado sair vazio.
 */

const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
const toques = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;

/** iPad moderno se declara "Macintosh"; o toque é o que o denuncia. */
export const ehIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && toques > 1);

export const ehCelular = ehIOS
  || /Android/.test(ua)
  || (toques > 1 && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820);

/**
 * Maior lado aceito ao abrir uma foto.
 *
 * 1600 no celular e não 3000: cada canvas RGBA de 3000×3000 ocupa 36 MB, e as
 * páginas guardam vários ao mesmo tempo (original, máscara, resultado). Some
 * o modelo de 44 MB e o iPhone chega no teto antes de terminar. Com 1600 sobra
 * folga, e ainda é resolução suficiente para o que sai daqui.
 *
 * Também é o que faz a ampliação por IA caber: 1600 dobrado dá 3200×3200, ou
 * 10,2 milhões de pixels, abaixo do limite de canvas do iOS.
 */
export const MAX_DIM = ehCelular ? 1600 : 3000;

/**
 * Área máxima de um canvas, em pixels. O valor do iOS é conservador de
 * propósito: aparelhos antigos recusam bem antes dos 16,7 milhões dos novos.
 */
export const AREA_MAX_CANVAS = ehIOS ? 16.0e6 : 64e6;

/**
 * Precisão do modelo. No computador a versão cheia é mais fiel; no celular ela
 * é justamente o que estoura a memória, então lá vale a quantizada — pior de
 * perto, mas é a diferença entre funcionar e a aba morrer.
 */
export const PRECISAO_GPU = ehCelular ? 'q8' : 'fp32';
