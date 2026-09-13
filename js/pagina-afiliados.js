/**
 * O painel de quem indica.
 *
 * Tudo o que aparece aqui vem do servidor — código, saldo, indicações. Nenhum
 * número é calculado no navegador, porque número de dinheiro calculado no
 * navegador é número que a pessoa pode reescrever. Aqui a tela só desenha o
 * que a api/afiliado.js respondeu.
 */
import * as Conta from './conta.js';
import * as ContaUI from './conta-ui.js';

const $ = (id) => document.getElementById(id);

const dinheiro = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const SITUACAO = {
  pedido: { texto: 'Em análise', classe: 'aguardando' },
  pago: { texto: 'Pago', classe: 'bom' },
  recusado: { texto: 'Recusado', classe: 'ruim' },
};

let dados = null;

async function carregar() {
  if (!Conta.estaLogado()) {
    $('deslogado').hidden = false;
    $('painel').hidden = true;
    $('carregando').hidden = true;
    return;
  }

  $('deslogado').hidden = true;
  $('carregando').hidden = false;

  try {
    const r = await fetch('/api/afiliado', {
      headers: { Authorization: 'Bearer ' + Conta.tokenAcesso() },
    });
    const corpo = await r.json();
    if (!corpo.ok) throw new Error(corpo.motivo || 'Não deu para carregar.');
    dados = corpo;
    desenhar();
  } catch (err) {
    $('carregando').hidden = true;
    avisar(err.message, true);
  }
}

function desenhar() {
  $('carregando').hidden = true;
  $('painel').hidden = false;

  const link = location.origin + '/?ref=' + dados.codigo;
  $('codigo').textContent = dados.codigo;
  $('link').value = link;

  $('totalIndicacoes').textContent = dados.indicacoes;
  $('totalGanho').textContent = dinheiro(dados.ganho);
  $('saldo').textContent = dinheiro(dados.saldo);
  $('minimo').textContent = dinheiro(dados.minimo);

  // O botão só abre no mínimo. Deixá-lo clicável antes disso só produziria uma
  // recusa depois do clique, e a pessoa já sabia que faltava.
  const podeSacar = dados.saldo >= dados.minimo;
  $('pedirSaque').disabled = !podeSacar;
  $('faltaParaSacar').hidden = podeSacar;
  if (!podeSacar) {
    $('faltaParaSacar').textContent = 'Faltam ' + dinheiro(dados.minimo - dados.saldo)
      + ' para você poder sacar.';
  }

  $('vendas').innerHTML = dados.vendas.length
    ? dados.vendas.map((v) => `
        <tr>
          <td>${dia(v.criado_em)}</td>
          <td>${v.plano || '—'}</td>
          <td class="num">${dinheiro(v.valor_pago)}</td>
          <td class="num forte">${dinheiro(v.comissao)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="vazio">Nenhuma indicação ainda.</td></tr>';

  $('saques').innerHTML = dados.saques.length
    ? dados.saques.map((s) => {
      const st = SITUACAO[s.status] || { texto: s.status, classe: '' };
      return `
        <tr>
          <td>${dia(s.criado_em)}</td>
          <td class="num">${dinheiro(s.valor)}</td>
          <td><span class="sit ${st.classe}">${st.texto}</span></td>
          <td>${s.motivo || (s.resolvido_em ? dia(s.resolvido_em) : '')}</td>
        </tr>`;
    }).join('')
    : '<tr><td colspan="4" class="vazio">Nenhum saque pedido ainda.</td></tr>';

  $('blocoSaques').hidden = !dados.saques.length;
}

/* ------------------------------------------------------------------ *
 * Copiar
 * ------------------------------------------------------------------ */
async function copiar(texto, botao, rotulo) {
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = 'Copiado!';
  } catch {
    $('link').select();
    botao.textContent = 'Selecionado — Ctrl+C';
  }
  setTimeout(() => { botao.textContent = rotulo; }, 1800);
}

$('copiarLink').addEventListener('click', (e) =>
  copiar($('link').value, e.currentTarget, 'Copiar link'));
$('copiarCodigo').addEventListener('click', (e) =>
  copiar(dados.codigo, e.currentTarget, 'Copiar código'));

/* ------------------------------------------------------------------ *
 * Saque
 * ------------------------------------------------------------------ */
$('pedirSaque').addEventListener('click', () => {
  $('formSaque').hidden = false;
  $('chavePix').focus();
});

$('confirmarSaque').addEventListener('click', async () => {
  const chave = $('chavePix').value.trim();
  if (chave.length < 3) { avisar('Escreva a sua chave PIX.', true); return; }

  $('confirmarSaque').disabled = true;
  try {
    const r = await fetch('/api/afiliado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + Conta.tokenAcesso(),
      },
      body: JSON.stringify({ chavePix: chave }),
    });
    const corpo = await r.json();
    if (!corpo.ok) throw new Error(corpo.motivo || 'Não deu para pedir o saque.');

    $('formSaque').hidden = true;
    $('chavePix').value = '';
    avisar('Saque de ' + dinheiro(corpo.valor) + ' pedido. Assim que for pago, '
      + 'aparece aqui embaixo.');
    await carregar();
  } catch (err) {
    avisar(err.message, true);
  } finally {
    $('confirmarSaque').disabled = false;
  }
});

$('cancelarSaque').addEventListener('click', () => { $('formSaque').hidden = true; });

$('entrar').addEventListener('click', () => ContaUI.abrir());

function avisar(texto, erro = false) {
  $('aviso').hidden = !texto;
  $('aviso').textContent = texto;
  $('aviso').className = erro ? 'pdf-aviso' : 'ed-hint';
}

// A conta pode ainda estar carregando quando o módulo roda: sem reagir à
// mudança, quem chega logado veria a tela de "entre na sua conta".
Conta.aoMudar(carregar);
carregar();
