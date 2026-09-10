/**
 * Tela de upgrade para HD e o caminho de download de cada plano.
 * Compartilhada pelas duas páginas — o markup vem de partials/editor.html.
 */
import {
  REDUCAO_GRATIS, ENDPOINT_PAGAR, ENDPOINT_VALIDACAO, MP_PUBLIC_KEY,
  aplicarLimite,
} from './licenca.js';
import { PLANOS, ORDEM, PLANO_PADRAO, plano, precoEscrito } from './planos.js';
import * as Conta from './conta.js';

// A tela vem junto com o módulo. Antes o markup morava no partial do editor, e
// o resultado era que "Conhecer o VIP" não fazia nada na home: a página não
// carrega o editor, então o modal simplesmente não existia ali.
if (!document.getElementById('modalHD')) {
  const url = new URL('../partials/paywall', import.meta.url);
  document.body.insertAdjacentHTML('beforeend', await fetch(url).then((r) => r.text()));
}

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
 * Escolha do plano
 * ------------------------------------------------------------------ */
let planoEscolhido = PLANO_PADRAO;

/** Desenha os cartões a partir da tabela — nunca a partir de HTML escrito à mão. */
function desenharPlanos() {
  const caixa = $('hdPlanos');
  caixa.textContent = '';

  for (const id of ORDEM) {
    const p = PLANOS[id];

    const cartao = document.createElement('button');
    cartao.type = 'button';
    cartao.className = 'hd-plano' + (p.destaque ? ' hd-plano-destaque' : '');
    cartao.dataset.plano = id;
    cartao.setAttribute('role', 'radio');

    if (p.destaque) {
      const fita = document.createElement('span');
      fita.className = 'hd-fita';
      fita.textContent = 'melhor valor';
      cartao.append(fita);
    }

    const nome = document.createElement('span');
    nome.className = 'hd-plano-nome';
    nome.textContent = p.nome;

    const valor = document.createElement('strong');
    valor.className = 'hd-plano-valor';
    valor.textContent = precoEscrito(id);

    const nota = document.createElement('small');
    nota.className = 'hd-plano-nota';
    nota.textContent = p.descricao;

    cartao.append(nome, valor, nota);
    cartao.addEventListener('click', () => escolher(id));
    caixa.append(cartao);
  }

  marcarEscolhido();
}

function escolher(id) {
  if (!plano(id) || id === planoEscolhido) return;
  planoEscolhido = id;
  marcarEscolhido();

  // O Brick nasce com o valor dentro dele. Trocar de plano com o formulário
  // aberto exige montar de novo, senão a pessoa pagaria o preço antigo.
  if (brick) abrirFormularioDePagamento();
}

function marcarEscolhido() {
  for (const cartao of $('hdPlanos').children) {
    const marcado = cartao.dataset.plano === planoEscolhido;
    cartao.classList.toggle('is-escolhido', marcado);
    cartao.setAttribute('aria-checked', marcado ? 'true' : 'false');
  }
  $('hdPagar').textContent = 'Assinar por ' + precoEscrito(planoEscolhido);
}

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
  desenharPlanos();
  mostrarRenovacao();
  aviso.textContent = '';
  aviso.className = 'hd-aviso';

  // Sem conta não há a quem entregar o VIP: o login vem antes do pagamento.
  const logado = !Conta.CONFIGURADO || Conta.estaLogado();
  $('hdEntrar').hidden = logado;
  $('hdPagar').hidden = !logado;
  $('hdBrick').hidden = true;
  $('hdPix').hidden = true;
  $('hdCodigo').closest('.hd-codigo').hidden = !logado;

  modal.hidden = false;
}

/**
 * Quem já tem VIP com prazo está renovando, não comprando de novo. Vale dizer
 * até quando vale hoje e que o tempo novo entra em cima, não no lugar.
 */
function mostrarRenovacao() {
  const ate = Conta.ehVip ? Conta.vipAte() : undefined;
  const linha = $('hdRenova');

  if (ate === undefined) { linha.hidden = true; return; }

  if (ate === null) {
    linha.textContent = 'Você já tem o vitalício — não precisa comprar de novo.';
    linha.hidden = false;
    return;
  }

  const dia = new Date(ate).toLocaleDateString('pt-BR');
  linha.textContent = 'Seu VIP vale até ' + dia + '. O tempo comprado agora entra em cima do que falta.';
  linha.hidden = false;
}

function fechar() {
  modal.hidden = true;
  canvasPendente = null;
  if (brick) { try { brick.unmount(); } catch { /* ja foi */ } brick = null; }
  $('hdBrick').hidden = true;
  $('hdBrick').innerHTML = '';
  $('hdPix').hidden = true;
  $('hdPagar').hidden = false;
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
  // Import sob demanda, não estático: conta-ui.js também chama daqui, e um
  // ciclo entre os dois com await no topo travaria os dois módulos.
  import('./conta-ui.js').then((m) => m.abrir(true));
});

/* ------------------------------------------------------------------ *
 * Checkout Bricks
 * ------------------------------------------------------------------ */

/** Carrega o SDK do Mercado Pago uma vez, so quando alguem vai pagar. */
let sdkCarregando = null;

function carregarSdk() {
  if (window.MercadoPago) return Promise.resolve();
  if (sdkCarregando) return sdkCarregando;

  sdkCarregando = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://sdk.mercadopago.com/js/v2';
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('N\u00e3o foi poss\u00edvel carregar o Mercado Pago.'));
    document.head.appendChild(tag);
  });
  return sdkCarregando;
}

let brick = null;

/**
 * Monta o formulario de pagamento dentro do modal. O cartao e tokenizado pelo
 * proprio SDK e nunca passa pelo nosso servidor; o que sai daqui e um token.
 */
async function abrirFormularioDePagamento() {
  if (!Conta.estaLogado()) {
    mostrarAviso('Entre na sua conta antes de pagar.', 'erro');
    return;
  }
  if (!MP_PUBLIC_KEY) {
    mostrarAviso('O pagamento ainda n\u00e3o foi configurado neste site.', 'erro');
    return;
  }

  $('hdPagar').disabled = true;
  mostrarAviso('Carregando o pagamento\u2026');

  try {
    await carregarSdk();

    // Remonta do zero: reabrir o modal com um Brick velho deixa a tela morta.
    if (brick) { try { brick.unmount(); } catch { /* ja foi */ } brick = null; }
    $('hdBrick').innerHTML = '';
    $('hdBrick').hidden = false;
    $('hdPagar').hidden = true;

    const mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
    brick = await mp.bricks().create('payment', 'hdBrick', {
      initialization: {
        amount: plano(planoEscolhido).valor,
        payer: { email: Conta.usuario().email },
      },
      customization: {
        paymentMethods: {
          creditCard: 'all',
          debitCard: 'all',
          bankTransfer: 'all',    // Pix
        },
        visual: { style: { theme: 'default' } },
      },
      callbacks: {
        onReady: () => mostrarAviso(''),
        onError: (erro) => {
          console.error('Brick:', erro);
          mostrarAviso('Erro no formul\u00e1rio de pagamento. Tente de novo.', 'erro');
        },
        onSubmit: ({ formData }) => enviarPagamento(formData),
      },
    });
  } catch (err) {
    console.error(err);
    mostrarAviso(err.message, 'erro');
    $('hdBrick').hidden = true;
    $('hdPagar').hidden = false;
  } finally {
    $('hdPagar').disabled = false;
  }
}

/** Manda o que o Brick coletou para o servidor, que cria o pagamento. */
async function enviarPagamento(formData) {
  mostrarAviso('Processando o pagamento\u2026');

  const r = await fetch(ENDPOINT_PAGAR, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + Conta.tokenAcesso(),
    },
    // O plano vai como id, nunca como preço: quem converte id em valor é o
    // servidor. Mandar o valor daqui seria deixar o navegador escolher quanto
    // pagar.
    body: JSON.stringify({ formData, plano: planoEscolhido }),
  });
  const dados = await r.json().catch(() => ({}));

  if (!r.ok || !dados.ok) {
    mostrarAviso(dados.motivo || 'N\u00e3o foi poss\u00edvel processar o pagamento.', 'erro');
    throw new Error(dados.motivo || 'falha');   // mantem o Brick aberto para tentar de novo
  }

  tratarResultado(dados);
}

function tratarResultado(dados) {
  if (dados.status === 'approved') {
    mostrarAviso('Pagamento aprovado. Liberando o VIP\u2026', 'ok');
    esperarLiberacao();
    return;
  }

  if (dados.pix && dados.pix.qrBase64) {
    $('hdBrick').hidden = true;
    $('hdPix').hidden = false;
    $('hdPixQr').src = 'data:image/png;base64,' + dados.pix.qrBase64;
    $('hdPixCopiar').dataset.codigo = dados.pix.copiaECola || '';
    mostrarAviso('');
    esperarLiberacao();
    return;
  }

  if (dados.status === 'rejected') {
    mostrarAviso('Pagamento recusado' + (dados.detalhe ? ' (' + dados.detalhe + ')' : '') +
      '. Tente outro meio de pagamento.', 'erro');
    return;
  }

  mostrarAviso('Pagamento em an\u00e1lise. O VIP libera assim que for aprovado.');
  esperarLiberacao();
}

$('hdPixCopiar').addEventListener('click', async (e) => {
  const codigo = e.currentTarget.dataset.codigo;
  if (!codigo) return;
  try {
    await navigator.clipboard.writeText(codigo);
    e.currentTarget.textContent = 'C\u00f3digo copiado';
    setTimeout(() => { e.currentTarget.textContent = 'Copiar c\u00f3digo Pix'; }, 2000);
  } catch {
    mostrarAviso('Copie o c\u00f3digo pelo aplicativo do banco lendo o QR.', 'erro');
  }
});

$('hdPagar').addEventListener('click', abrirFormularioDePagamento);

function mostrarAviso(texto, tipo) {
  aviso.textContent = texto;
  aviso.className = 'hd-aviso' + (tipo ? ' ' + tipo : '');
}

/**
 * Depois de pagar, fica reperguntando o plano ao banco. Quem escreve la e o
 * webhook, entao isso funciona mesmo com Pix que so compensa depois.
 */
let esperando = null;

function esperarLiberacao() {
  if (esperando) return;
  let tentativas = 0;
  esperando = setInterval(async () => {
    tentativas++;
    if (await Conta.atualizarPlano()) {
      clearInterval(esperando);
      esperando = null;
      liberado();
      return;
    }
    if (tentativas >= 120) {            // ~10 minutos
      clearInterval(esperando);
      esperando = null;
      mostrarAviso('Ainda n\u00e3o recebemos a confirma\u00e7\u00e3o. Assim que cair, o VIP libera sozinho.');
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
