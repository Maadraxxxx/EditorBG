/**
 * Gerador de QR Code.
 *
 * O desenho sai do navegador e nunca de um servidor — e aqui isso não é só
 * coerência com o resto do site: gerador de QR online recebe a sua chave PIX, a
 * senha do seu WiFi e o seu telefone. São exatamente as informações que não
 * deveriam passar pela máquina de terceiros.
 */
import * as Q from './qrcode.js';
import './conta-ui.js';
import { refreshSliders } from './sliders.js';

const $ = (id) => document.getElementById(id);

let lib = null;
const carregarLib = () => (lib
  ? Promise.resolve(lib)
  : import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm').then((m) => { lib = m.default || m; return lib; }));

/** Que campos cada tipo mostra, e como ele monta o conteúdo. */
const TIPOS = {
  link: { campos: ['link'], monta: () => Q.paraLink($('link').value) },
  texto: { campos: ['texto'], monta: () => Q.paraTexto($('texto').value) },
  wifi: {
    campos: ['wifi'],
    monta: () => Q.paraWifi({
      rede: $('rede').value,
      senha: $('senhaRede').value,
      seguranca: $('seguranca').value,
      oculta: $('oculta').checked,
    }),
  },
  contato: {
    campos: ['contato'],
    monta: () => Q.paraContato({
      nome: $('ctNome').value,
      telefone: $('ctTelefone').value,
      email: $('ctEmail').value,
      empresa: $('ctEmpresa').value,
      site: $('ctSite').value,
    }),
  },
  pix: {
    campos: ['pix'],
    monta: () => Q.paraPix({
      chave: $('pixChave').value,
      nome: $('pixNome').value,
      cidade: $('pixCidade').value,
      valor: $('pixValor').value,
      descricao: $('pixDescricao').value,
    }),
  },
};

let tipo = 'link';
let conteudoAtual = '';

/* ------------------------------------------------------------------ *
 * Tipo
 * ------------------------------------------------------------------ */
$('tipos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tipo]');
  if (!b) return;
  tipo = b.dataset.tipo;
  for (const outro of $('tipos').children) outro.classList.toggle('is-active', outro === b);

  for (const grupo of document.querySelectorAll('[data-campos]')) {
    grupo.hidden = !TIPOS[tipo].campos.includes(grupo.dataset.campos);
  }
  desenhar();
});

/* ------------------------------------------------------------------ *
 * Qualquer mudança redesenha
 * ------------------------------------------------------------------ */
let pendente = null;
document.addEventListener('input', (e) => {
  if (!e.target.closest('.qr-lado')) return;
  if (e.target.id === 'tamanho') $('tamanhoVal').textContent = $('tamanho').value + ' px';
  clearTimeout(pendente);
  pendente = setTimeout(desenhar, 160);
});
document.addEventListener('change', (e) => {
  if (e.target.closest('.qr-lado')) desenhar();
});

/* ------------------------------------------------------------------ *
 * Contraste
 * ------------------------------------------------------------------ */

/** Luminância relativa de uma cor #rrggbb, na fórmula da WCAG. */
function luminancia(hex) {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/**
 * Confere se as cores escolhidas dão um código que a câmera consegue ler.
 *
 * Isto não é detalhe de estética. Medi com um leitor de verdade: preto sobre
 * branco (razão 21) lê, cinza #808080 sobre branco (razão 3,95) ainda lê, e
 * #909090 (razão 3,19) já NÃO lê mais. O problema é que a tela continua
 * mostrando um desenho bonito nos dois casos — quem escolheu a cor só descobre
 * que o código não funciona depois de imprimir. Por isso o aviso.
 *
 * Os limites ficam bem acima do ponto onde o leitor quebrou, porque a leitura
 * real é pior que a do teste: papel, luz fraca, câmera torta e tinta que
 * espalha. A conta é simétrica de propósito — claro sobre escuro também lê, e
 * eu conferi que lê.
 */
function conferirContraste() {
  const a = luminancia($('corFrente').value);
  const b = luminancia($('corFundo').value);
  const [alto, baixo] = a > b ? [a, b] : [b, a];
  const razao = (alto + 0.05) / (baixo + 0.05);

  const el = $('contraste');
  if (razao < 4.5) {
    el.hidden = false;
    el.className = 'qr-alerta ruim';
    el.textContent = 'Estas cores não têm contraste suficiente: provavelmente '
      + 'nenhum celular vai conseguir ler este código. Escureça a cor ou clareie o fundo.';
  } else if (razao < 7) {
    el.hidden = false;
    el.className = 'qr-alerta atencao';
    el.textContent = 'O contraste está justo. Na tela funciona, mas impresso ou '
      + 'com pouca luz pode falhar.';
  } else {
    el.hidden = true;
  }
}

/* ------------------------------------------------------------------ *
 * Desenho
 * ------------------------------------------------------------------ */
async function desenhar() {
  let conteudo;
  try {
    conteudo = TIPOS[tipo].monta();
  } catch (erro) {
    // Campo vazio no meio do preenchimento não é erro que mereça alarme
    // vermelho: a pessoa ainda está digitando. O QR só some e o aviso explica
    // o que falta.
    conteudoAtual = '';
    $('palco').hidden = true;
    $('faltando').hidden = false;
    $('faltando').textContent = erro.message;
    $('baixarPng').disabled = true;
    $('copiar').hidden = true;
    // A caixa do copia e cola TEM que sumir junto. Deixar o codigo anterior na
    // tela depois que a chave foi apagada e pior que nao mostrar nada: quem
    // copiasse dali levaria a chave velha achando que era a nova.
    $('codigo').hidden = true;
    $('codigo').value = '';
    return;
  }

  conteudoAtual = conteudo;
  $('faltando').hidden = true;
  $('palco').hidden = false;
  $('baixarPng').disabled = false;

  const QR = await carregarLib();
  const lado = Number($('tamanho').value);

  try {
    await QR.toCanvas($('qr'), conteudo, {
      width: lado,
      margin: 2,
      // A correção de erro alta deixa o código legível mesmo amassado, sujo ou
      // impresso pequeno — e é o que permite a logo no meio sem quebrar nada.
      errorCorrectionLevel: 'H',
      color: { dark: $('corFrente').value, light: $('corFundo').value },
    });
  } catch (erro) {
    $('palco').hidden = true;
    $('faltando').hidden = false;
    $('faltando').textContent = 'Este conteúdo é comprido demais para um QR Code.';
    return;
  }

  conferirContraste();

  // O código copia e cola do PIX vale tanto quanto o desenho: muita gente
  // prefere colar no aplicativo do banco a apontar a câmera para a própria tela.
  $('copiar').hidden = tipo !== 'pix';
  $('codigo').hidden = tipo !== 'pix';
  if (tipo === 'pix') $('codigo').value = conteudo;
}

/* ------------------------------------------------------------------ *
 * Saída
 * ------------------------------------------------------------------ */
$('baixarPng').addEventListener('click', () => {
  $('qr').toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrcode-' + tipo + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, 'image/png');
});

$('copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(conteudoAtual);
    $('copiar').textContent = 'Copiado!';
    setTimeout(() => { $('copiar').textContent = 'Copiar código PIX'; }, 1800);
  } catch {
    // Sem permissão da área de transferência, selecionar o texto resolve —
    // some browsers recusam a cópia fora de um clique direto.
    $('codigo').select();
    $('copiar').textContent = 'Selecionado — use Ctrl+C';
    setTimeout(() => { $('copiar').textContent = 'Copiar código PIX'; }, 2600);
  }
});

refreshSliders();
desenhar();
