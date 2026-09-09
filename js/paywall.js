/**
 * Tela de upgrade para HD e o caminho de download de cada plano.
 * Compartilhada pelas duas páginas — o markup vem de partials/editor.html.
 */
import {
  REDUCAO_GRATIS, PRECO, TEXTO_PLANO, ENDPOINT_PAGAMENTO, ENDPOINT_VALIDACAO,
  aplicarLimite,
} from './licenca.js';
import * as Conta from './conta.js';

export { aplicarLimite };

/** VIP libera resolução original e o recorte em duas passadas. */
export function temHD() {
  return Conta.ehVip();
}
export const ehVip = temHD;

const $ = (id) => document.getElementById(id);

const modal = $('modalHD');
const aviso = $('hdAviso');
let canvasPendente = null;
let nomePendente = null;

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */
function nomeDeSaida(nome, hd) {
  const base = nome.replace(/\.[^./\\]+$/, '');
  return base + (hd ? '-HD' : '') + '.png';
}

function salvar(canvas, nome, hd) {
  const saida = aplicarLimite(canvas, hd);
  saida.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeDeSaida(nome, hd);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

/**
 * Baixa respeitando o plano. Sem licença, o pedido de HD abre a tela de compra
 * em vez de baixar.
 */
export function baixar(canvas, nome, { hd = false } = {}) {
  if (hd && !temHD()) {
    abrirPaywall(canvas, nome);
    return false;
  }
  salvar(canvas, nome, hd);
  return true;
}

/* ------------------------------------------------------------------ *
 * Tela de compra
 * ------------------------------------------------------------------ */
export function abrirPaywall(canvas, nome) {
  canvasPendente = canvas;
  nomePendente = nome;

  // Sem canvas a tela abre como convite ao plano, sem a comparação de medidas.
  const comparar = !!canvas;
  document.querySelector('.hd-comparacao').hidden = !comparar;
  if (comparar) {
    const menor = aplicarLimite(canvas, false);
    $('hdTamGratis').textContent = menor.width + ' × ' + menor.height;
    $('hdTamHD').textContent = canvas.width + ' × ' + canvas.height;
  }
  $('hdLimite').textContent = Math.round(REDUCAO_GRATIS * 100) + '%';
  $('hdPreco').textContent = PRECO;
  $('hdPlano').textContent = TEXTO_PLANO;
  aviso.textContent = '';
  aviso.className = 'hd-aviso';

  // Sem conta não há a quem entregar o VIP: o login vem antes do pagamento.
  const logado = !Conta.CONFIGURADO || Conta.estaLogado();
  $('hdEntrar').hidden = logado;
  $('hdPagar').hidden = !logado;
  $('hdCodigo').closest('.hd-codigo').hidden = !logado;

  modal.hidden = false;
}

function fechar() {
  modal.hidden = true;
  canvasPendente = null;
}

$('hdFechar').addEventListener('click', fechar);
modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) { e.stopPropagation(); fechar(); }
});

$('hdValidar').addEventListener('click', () => confirmarPagamento($('hdCodigo').value.trim()));

/**
 * Manda o código do pagamento junto com o token da conta. Quem cruza as duas
 * coisas — pagamento aprovado + qual conta liberar — é a função serverless.
 */
async function confirmarPagamento(codigo) {
  if (!codigo) {
    aviso.textContent = 'Cole o código que apareceu depois do pagamento.';
    aviso.className = 'hd-aviso erro';
    return false;
  }
  if (!Conta.estaLogado()) {
    aviso.textContent = 'Entre na sua conta antes de confirmar o pagamento.';
    aviso.className = 'hd-aviso erro';
    return false;
  }

  aviso.textContent = 'Conferindo\u2026';
  aviso.className = 'hd-aviso';
  try {
    const r = await fetch(ENDPOINT_VALIDACAO, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + Conta.tokenAcesso(),
      },
      body: JSON.stringify({ payment_id: codigo }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || !dados.ok) throw new Error(dados.motivo || 'N\u00e3o foi poss\u00edvel confirmar o pagamento agora.');
    await Conta.atualizarPlano();
    if (esperando) { clearInterval(esperando); esperando = null; }
    liberado();
    return true;
  } catch (err) {
    aviso.textContent = err.message;
    aviso.className = 'hd-aviso erro';
    return false;
  }
}

function liberado() {
  aviso.textContent = 'VIP liberado. Baixando…';
  aviso.className = 'hd-aviso ok';
  const canvas = canvasPendente;
  const nome = nomePendente;
  setTimeout(() => {
    fechar();
    if (canvas) salvar(canvas, nome, true);
    document.dispatchEvent(new CustomEvent('vip-mudou'));
  }, 700);
}

$('hdEntrar').addEventListener('click', () => {
  fechar();
  document.dispatchEvent(new CustomEvent('abrir-conta'));
});

/**
 * Abre o checkout com a cobranca ja amarrada a esta conta. E essa amarracao que
 * permite o webhook liberar o VIP sozinho depois, sem ninguem digitar codigo.
 */
$('hdPagar').addEventListener('click', async (e) => {
  e.preventDefault();
  if (!Conta.estaLogado()) {
    aviso.textContent = 'Entre na sua conta antes de pagar.';
    aviso.className = 'hd-aviso erro';
    return;
  }

  const rotulo = $('hdPagar').textContent;
  $('hdPagar').textContent = 'Abrindo o pagamento\u2026';
  aviso.textContent = '';
  aviso.className = 'hd-aviso';

  try {
    const r = await fetch(ENDPOINT_PAGAMENTO, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + Conta.tokenAcesso() },
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || !dados.url) throw new Error(dados.motivo || 'N\u00e3o deu para abrir o pagamento agora.');

    window.open(dados.url, '_blank', 'noopener');
    esperarLiberacao();
  } catch (err) {
    aviso.textContent = err.message;
    aviso.className = 'hd-aviso erro';
  } finally {
    $('hdPagar').textContent = rotulo;
  }
});

/**
 * Depois de mandar a pessoa para o checkout, fica reperguntando o plano ao
 * banco. Quem escreve la e o webhook, entao isso funciona mesmo se ela pagar
 * pelo celular ou fechar a aba do checkout.
 */
let esperando = null;

function esperarLiberacao() {
  if (esperando) return;
  aviso.textContent = 'Esperando a confirma\u00e7\u00e3o do pagamento\u2026';
  aviso.className = 'hd-aviso';

  let tentativas = 0;
  esperando = setInterval(async () => {
    tentativas++;
    if (await Conta.atualizarPlano()) {
      clearInterval(esperando);
      esperando = null;
      liberado();
      return;
    }
    if (tentativas >= 60) {           // ~5 minutos
      clearInterval(esperando);
      esperando = null;
      aviso.textContent = 'Ainda n\u00e3o recebemos a confirma\u00e7\u00e3o. Pix costuma levar alguns segundos \u2014 ' +
        'assim que cair, o VIP libera sozinho. Se demorar, cole o c\u00f3digo do pagamento abaixo.';
      aviso.className = 'hd-aviso';
    }
  }, 5000);
}

// Voltar para a aba tambem e um bom momento para reconferir o plano.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !Conta.estaLogado() || temHD()) return;
  if (await Conta.atualizarPlano()) document.dispatchEvent(new CustomEvent('vip-mudou'));
});

// Quem volta do checkout traz o pagamento na URL.
(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('payment_id') || params.get('collection_id');
  if (!id) return;

  ['payment_id', 'collection_id', 'collection_status', 'status', 'preference_id',
   'external_reference', 'merchant_order_id', 'payment_type', 'site_id',
   'processing_mode', 'merchant_account_id'].forEach((k) => params.delete(k));
  history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));

  await Conta.iniciar();
  modal.hidden = false;
  $('hdCodigo').value = id;
  if (await confirmarPagamento(id)) document.dispatchEvent(new CustomEvent('vip-mudou'));
})();
