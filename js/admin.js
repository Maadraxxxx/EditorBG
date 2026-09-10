/**
 * Painel de controle.
 *
 * Esta tela não decide nada. Ela pergunta tudo a /api/admin, que confere o
 * cargo no banco a cada chamada. Se alguém abrir admin.html sem ser
 * administrador, a página carrega — e não consegue arrancar um único número
 * dela, porque toda resposta volta 403.
 *
 * É por isso que não há nenhum "if (ehAdmin)" escondendo dados aqui: os dados
 * simplesmente não chegam.
 */
import * as Conta from './conta.js';
import './conta-ui.js';

const $ = (id) => document.getElementById(id);
const ENDERECO = '/api/admin';

/* ------------------------------------------------------------------ *
 * Conversa com o servidor
 * ------------------------------------------------------------------ */
async function pedir(acao, extra) {
  const token = Conta.tokenAcesso();
  if (!token) throw new Error('sem-conta');

  const r = await fetch(ENDERECO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ acao, ...(extra || {}) }),
  });

  if (r.status === 401) throw new Error('sem-conta');
  if (r.status === 403) throw new Error('sem-cargo');

  const dados = await r.json().catch(() => ({}));
  if (!r.ok || !dados.ok) throw new Error(dados.motivo || 'Algo deu errado no servidor.');
  return dados;
}

/* ------------------------------------------------------------------ *
 * Números
 * ------------------------------------------------------------------ */
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR');

async function carregarResumo() {
  const { resumo: r } = await pedir('resumo');

  $('numVisitasHoje').textContent = numero.format(r.visitasHoje);
  $('numVisitas7').textContent = numero.format(r.visitas7) + ' nos últimos 7 dias';
  $('numVisitasTotal').textContent = numero.format(r.visitasTotal);

  $('numContas').textContent = numero.format(r.contas);
  $('numContasHoje').textContent = r.contasHoje === 1
    ? '1 criada hoje'
    : numero.format(r.contasHoje) + ' criadas hoje';

  $('numOnline').textContent = numero.format(r.online);

  $('numAssinaturas').textContent = numero.format(r.assinaturas);
  $('numVips').textContent = numero.format(r.vips) + ' contas com VIP ativo';

  $('numFaturado').textContent = dinheiro.format(r.faturado);
  $('numFaturadoMes').textContent = dinheiro.format(r.faturadoMes) + ' neste mês';
}

/* ------------------------------------------------------------------ *
 * Lista de contas
 * ------------------------------------------------------------------ */
function quando(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "há 3 minutos" diz mais do que uma data quando foi agora há pouco. */
function faz(iso) {
  if (!iso) return 'nunca entrou';
  const minutos = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return 'há ' + minutos + ' min';
  if (minutos < 60 * 24) return 'há ' + Math.floor(minutos / 60) + ' h';
  return quando(iso);
}

function chave(pessoa, campo) {
  return 'ch-' + campo + '-' + pessoa.id;
}

function desenharLista(pessoas) {
  const corpo = $('admLinhas');
  corpo.textContent = '';
  $('admVazio').hidden = pessoas.length > 0;

  const eu = Conta.usuario();

  for (const p of pessoas) {
    const tr = document.createElement('tr');
    const souEu = eu && eu.id === p.id;
    const ativo = p.ultimo_acesso && (Date.now() - new Date(p.ultimo_acesso)) < 15 * 60 * 1000;

    const tdEmail = document.createElement('td');
    tdEmail.className = 'admin-email';
    tdEmail.textContent = p.email || '(sem e-mail)';
    if (ativo) {
      const ponto = document.createElement('span');
      ponto.className = 'admin-ponto';
      ponto.title = 'ativo agora';
      tdEmail.prepend(ponto);
    }
    if (souEu) {
      const eu2 = document.createElement('span');
      eu2.className = 'admin-voce';
      eu2.textContent = 'você';
      tdEmail.append(eu2);
    }
    tr.append(tdEmail);

    const tdCriada = document.createElement('td');
    tdCriada.textContent = quando(p.criado_em);
    tr.append(tdCriada);

    const tdVisto = document.createElement('td');
    tdVisto.textContent = faz(p.ultimo_acesso);
    tr.append(tdVisto);

    tr.append(celulaChave(p, 'vip', p.vip, false));
    // Ninguém tira o próprio cargo: o servidor recusa, e deixar o botão clicável
    // só entregaria um erro. Melhor já vir travado.
    tr.append(celulaChave(p, 'admin', p.admin, souEu));

    corpo.append(tr);
  }
}

function celulaChave(pessoa, campo, ligado, travado) {
  const td = document.createElement('td');
  td.className = 'admin-c';

  // Mesmo interruptor usado no resto do site, para o painel não parecer
  // outro produto.
  const rotulo = document.createElement('label');
  rotulo.className = 'switch small';
  if (travado) rotulo.classList.add('switch-travada');

  const caixa = document.createElement('input');
  caixa.type = 'checkbox';
  caixa.checked = !!ligado;
  caixa.disabled = !!travado;
  caixa.id = chave(pessoa, campo);
  caixa.addEventListener('change', () => mudar(pessoa, campo, caixa));

  const trilho = document.createElement('span');
  trilho.className = 'track';
  const bola = document.createElement('span');
  bola.className = 'knob';
  trilho.append(bola);

  rotulo.append(caixa, trilho);
  rotulo.title = travado
    ? 'Você não pode tirar o seu próprio cargo de administrador.'
    : (campo === 'vip' ? 'Dar ou tirar o VIP' : 'Dar ou tirar o cargo de administrador');

  td.append(rotulo);
  return td;
}

async function mudar(pessoa, campo, caixa) {
  const querido = caixa.checked;
  caixa.disabled = true;
  avisar('');

  try {
    const { pessoa: nova } = await pedir('definir', { id: pessoa.id, [campo]: querido });
    pessoa.vip = nova.vip;
    pessoa.admin = nova.admin;
    caixa.checked = !!nova[campo];

    avisar(
      (nova.email || 'A conta') + ': ' +
      (campo === 'vip' ? 'VIP' : 'administrador') + ' ' +
      (querido ? 'ligado' : 'desligado') + '.',
      'ok'
    );

    // O número lá em cima acabou de mudar junto.
    carregarResumo().catch(() => {});
  } catch (err) {
    caixa.checked = !querido;          // desfaz na tela o que não colou no banco
    avisar(err.message, 'erro');
  } finally {
    caixa.disabled = false;
  }
}

async function carregarLista() {
  const { pessoas } = await pedir('listar', { busca: $('admBusca').value });
  desenharLista(pessoas);
}

function avisar(texto, tipo) {
  $('admAviso').textContent = texto;
  $('admAviso').className = 'hd-aviso' + (tipo ? ' ' + tipo : '');
}

/* ------------------------------------------------------------------ *
 * Entrada
 * ------------------------------------------------------------------ */
function barrar(titulo, texto) {
  $('admCarregando').hidden = true;
  $('admConteudo').hidden = true;
  $('admBarrado').hidden = false;
  $('admBarradoTitulo').textContent = titulo;
  $('admBarradoTexto').textContent = texto;
}

async function abrir() {
  try {
    await Promise.all([carregarResumo(), carregarLista()]);
    $('admCarregando').hidden = true;
    $('admBarrado').hidden = true;
    $('admConteudo').hidden = false;
  } catch (err) {
    if (err.message === 'sem-conta') {
      barrar('Entre na sua conta', 'Use o botão no topo da página para entrar.');
    } else if (err.message === 'sem-cargo') {
      barrar('Área restrita', 'Esta página é só para administradores.');
    } else {
      barrar('Não deu para abrir o painel', err.message);
    }
  }
}

$('admAtualizar').addEventListener('click', () => {
  Promise.all([carregarResumo(), carregarLista()])
    .then(() => avisar('Atualizado.', 'ok'))
    .catch((err) => avisar(err.message, 'erro'));
});

// Espera a digitação parar antes de ir ao servidor.
let buscando = null;
$('admBusca').addEventListener('input', () => {
  clearTimeout(buscando);
  buscando = setTimeout(() => carregarLista().catch((e) => avisar(e.message, 'erro')), 300);
});

Conta.iniciar().then(abrir);

// Entrar ou sair pelo modal recarrega o painel com a resposta certa.
let anterior = null;
Conta.aoMudar(({ usuario }) => {
  const agora = usuario ? usuario.id : null;
  if (anterior !== null && anterior !== agora) abrir();
  anterior = agora;
});
