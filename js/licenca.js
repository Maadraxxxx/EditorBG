/**
 * Configuração dos planos e a redução aplicada ao arquivo grátis.
 * Quem sabe se a pessoa é VIP é o conta.js — aqui só ficam os números.
 *
 * AVISO HONESTO: como todo o processamento acontece no navegador, a imagem em
 * alta resolução já existe na máquina de quem usa. Este bloqueio é atrito, não
 * segurança — segura a grande maioria, mas quem abrir o DevTools contorna. O
 * único jeito de travar de verdade seria gerar a alta resolução num servidor, o
 * que custaria dinheiro e acabaria com a promessa de que a imagem nunca sai do
 * computador. A escolha aqui foi manter a privacidade.
 */

/* ------------------------------------------------------------------ *
 * Configuração — ajuste estes valores
 * ------------------------------------------------------------------ */
/** Quanto o arquivo grátis perde de resolução. 0.30 = sai com 70% do tamanho original. */
export const REDUCAO_GRATIS = 0.30;

// Preços e durações moram em js/planos.js, que o servidor também importa —
// assim o valor mostrado na tela e o cobrado no cartão não têm como divergir.

/**
 * Chave pública do Mercado Pago, usada pelo Payment Brick no navegador.
 * É pública por design (Painel > sua aplicação > Credenciais). O Access Token,
 * esse sim secreto, vive só nas variáveis de ambiente do servidor.
 */
export const MP_PUBLIC_KEY = 'APP_USR-5d8feedf-bdee-4c6c-a151-1d157ae775a4';

/**
 * Funções serverless. O pagamento nasce amarrado à conta de quem compra — é
 * isso que permite o webhook liberar o VIP sozinho depois.
 */
export const ENDPOINT_PAGAR = '/api/pagar';
export const ENDPOINT_VALIDACAO = '/api/validar';   // conferência manual, só como plano B

/* ------------------------------------------------------------------ *
 * Saída dos arquivos
 * ------------------------------------------------------------------ */

/** Reduz o canvas na proporção do plano grátis; no HD devolve como está. */
export function aplicarLimite(canvas, hd) {
  if (hd || REDUCAO_GRATIS <= 0) return canvas;

  const k = 1 - REDUCAO_GRATIS;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * k));
  out.height = Math.max(1, Math.round(canvas.height * k));
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/** Tamanho que o arquivo teria em cada plano — usado nos rótulos dos botões. */
export function tamanhoDeSaida(canvas, hd) {
  const c = aplicarLimite(canvas, hd);
  return { w: c.width, h: c.height };
}
