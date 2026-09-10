/**
 * Interface das contas: o botão no cabeçalho e o modal de entrar/cadastrar.
 * Toda a lógica de sessão fica em conta.js — aqui é só tela.
 */
import * as Conta from './conta.js';

// A tela vem junto com o modulo: assim a home, que nao carrega o editor,
// ganha o botao de conta so por importar este arquivo.
if (!document.getElementById('modalConta')) {
  const url = new URL('../partials/conta.html', import.meta.url);
  document.body.insertAdjacentHTML('beforeend', await fetch(url).then((r) => r.text()));
}

const $ = (id) => document.getElementById(id);

const modal = $('modalConta');
const formulario = $('contaFormulario');
const logada = $('contaLogada');
const recuperar = $('contaRecuperar');
const aviso = $('contaAviso');
const avisoSenha = $('contaAvisoSenha');

let modo = 'entrar';   // 'entrar' | 'cadastrar'

// Sem o provedor configurado, o botão só daria erro: melhor nem mostrar.
$('contaGoogle').hidden = !Conta.GOOGLE_ATIVO;

/* ------------------------------------------------------------------ *
 * Botão no cabeçalho
 * ------------------------------------------------------------------ */
const botao = document.createElement('button');
botao.className = 'conta-botao';
botao.type = 'button';
botao.addEventListener('click', abrir);

function encaixarBotao() {
  // cada página tem um lugar natural: a barra de topo ou a do editor
  const alvo = document.querySelector('.topbar') || document.querySelector('.ed-top-actions');
  if (!alvo) return;
  if (alvo.classList.contains('topbar')) alvo.appendChild(botao);
  else alvo.insertBefore(botao, alvo.firstChild);
}

// Quem clicou no link do e-mail não deveria ter de caçar o botão de conta para
// terminar a troca — o modal se abre sozinho, uma vez só.
let jaAbriuTroca = false;

function pintarBotao({ usuario, vip, recuperando }) {
  if (!Conta.CONFIGURADO) { botao.hidden = true; return; }

  if (recuperando && !jaAbriuTroca) {
    jaAbriuTroca = true;
    abrir();
  }

  botao.hidden = false;
  botao.classList.toggle('is-vip', vip);
  if (!usuario) {
    botao.innerHTML = 'Entrar';
    botao.title = 'Entrar ou criar conta';
    return;
  }
  const inicial = (usuario.email || '?')[0].toUpperCase();
  botao.innerHTML = '<span class="conta-avatar-mini">' + inicial + '</span>' +
    (vip ? 'VIP' : 'Grátis');
  botao.title = usuario.email;
}

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */
export function abrir(paraAssinar) {
  if (!Conta.CONFIGURADO) return;
  aviso.textContent = '';
  aviso.className = 'hd-aviso';

  // A troca de senha tem prioridade sobre tudo. Era exatamente aqui que a
  // pessoa ficava presa: a sessão do link contava como "logado", então a tela
  // mostrava o perfil e a troca não tinha por onde aparecer.
  const trocando = Conta.estaRecuperando();
  const logado = Conta.estaLogado();

  recuperar.hidden = !trocando;
  formulario.hidden = trocando || logado;
  logada.hidden = trocando || !logado;

  if (trocando) {
    avisoSenha.textContent = '';
    avisoSenha.className = 'hd-aviso';
    $('contaSenhaNova').value = '';
    $('contaSenhaNova2').value = '';
    modal.hidden = false;
    $('contaSenhaNova').focus();
    return;
  }

  if (logado) {
    const u = Conta.usuario();
    $('contaEmailLogado').textContent = u.email;
    $('contaInicial').textContent = (u.email || '?')[0].toUpperCase();
    const vip = Conta.ehVip();
    $('contaPlano').textContent = vip ? 'Plano VIP ativo' : 'Plano grátis';
    $('contaPlano').classList.toggle('vip', vip);
    $('contaVerVip').hidden = vip;
    $('contaPainel').hidden = !Conta.ehAdmin();
  } else if (paraAssinar) {
    $('contaSub').textContent = 'Crie a conta para assinar o VIP.';
  }

  modal.hidden = false;
}

function fechar() { modal.hidden = true; }

$('contaFechar').addEventListener('click', fechar);
modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });

$('contaAlternar').addEventListener('click', () => {
  modo = modo === 'entrar' ? 'cadastrar' : 'entrar';
  pintarFormulario();
  aviso.textContent = '';
});

/** Deixa o formulario com a cara do modo atual: entrar ou criar conta. */
function pintarFormulario() {
  const entrando = modo === 'entrar';
  $('contaTitulo').textContent = entrando ? 'Entrar' : 'Criar conta';
  $('contaEnviar').textContent = entrando ? 'Entrar' : 'Criar conta';
  $('contaTexto').textContent = entrando ? 'Não tem conta?' : 'Já tem conta?';
  $('contaAlternar').textContent = entrando ? 'Criar conta' : 'Entrar';
  $('contaSenha').autocomplete = entrando ? 'current-password' : 'new-password';

  // Conferir e-mail e senha so faz sentido para quem esta criando a conta.
  $('campoEmail2').hidden = entrando;
  $('campoSenha2').hidden = entrando;
  $('contaEmail2').value = '';
  $('contaSenha2').value = '';

  // "Esqueci a senha" nao tem o que fazer numa conta que ainda nao existe.
  $('contaEsqueci').closest('.conta-troca').hidden = !entrando;
}

$('contaEnviar').addEventListener('click', enviar);

// Enter em qualquer campo do formulario envia, como em qualquer site.
for (const id of ['contaEmail', 'contaEmail2', 'contaSenha', 'contaSenha2']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
}

async function enviar() {
  const email = $('contaEmail').value.trim();
  const senha = $('contaSenha').value;
  if (!email || !senha) return mostrar('Preencha e-mail e senha.', 'erro');

  if (modo === 'cadastrar') {
    // Comparacao sem diferenciar maiusculas: e-mail nao distingue, e reclamar
    // de "Joao@" contra "joao@" seria implicancia com a pessoa certa.
    if ($('contaEmail2').value.trim().toLowerCase() !== email.toLowerCase()) {
      return mostrar('Os dois e-mails não são iguais.', 'erro');
    }
    if ($('contaSenha2').value !== senha) {
      return mostrar('As duas senhas não são iguais.', 'erro');
    }
    if (senha.length < 6) {
      return mostrar('A senha precisa de pelo menos 6 caracteres.', 'erro');
    }
  }

  mostrar(modo === 'entrar' ? 'Entrando…' : 'Criando conta…');
  try {
    if (modo === 'entrar') {
      await Conta.entrar(email, senha);
      fechar();
    } else {
      const { precisaConfirmar } = await Conta.cadastrar(email, senha);
      if (precisaConfirmar) mostrar('Confira seu e-mail para confirmar a conta.', 'ok');
      else fechar();
    }
  } catch (err) {
    mostrar(err.message, 'erro');
  }
}

$('contaGoogle').addEventListener('click', async () => {
  try { await Conta.entrarComGoogle(); } catch (err) { mostrar(err.message, 'erro'); }
});

$('contaEsqueci').addEventListener('click', async () => {
  const email = $('contaEmail').value.trim();
  if (!email) return mostrar('Escreva seu e-mail no campo acima primeiro.', 'erro');
  try {
    await Conta.recuperarSenha(email);
    mostrar('Enviamos um link de recuperação para o seu e-mail.', 'ok');
  } catch (err) {
    mostrar(err.message, 'erro');
  }
});

$('contaSalvarSenha').addEventListener('click', salvarSenha);

// Enter em qualquer um dos dois campos salva — é o que se espera de um
// formulário de senha, e evita a busca pelo botão.
for (const id of ['contaSenhaNova', 'contaSenhaNova2']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') salvarSenha(); });
}

async function salvarSenha() {
  const nova = $('contaSenhaNova').value;
  const repetida = $('contaSenhaNova2').value;

  if (nova.length < 6) return mostrarSenha('A senha precisa de pelo menos 6 caracteres.', 'erro');
  if (nova !== repetida) return mostrarSenha('As duas senhas não são iguais.', 'erro');

  $('contaSalvarSenha').disabled = true;
  mostrarSenha('Salvando…');
  try {
    await Conta.alterarSenha(nova);
    $('contaSenhaNova').value = '';
    $('contaSenhaNova2').value = '';
    mostrarSenha('Senha alterada. É essa que vale a partir de agora.', 'ok');
    setTimeout(fechar, 1800);
  } catch (err) {
    mostrarSenha(err.message, 'erro');
  } finally {
    $('contaSalvarSenha').disabled = false;
  }
}

$('contaPularSenha').addEventListener('click', () => {
  Conta.limparRecuperacao();
  fechar();
});

$('contaSair').addEventListener('click', async () => {
  await Conta.sair();
  fechar();
});

$('contaVerVip').addEventListener('click', () => {
  fechar();
  document.dispatchEvent(new CustomEvent('mostrar-vip'));
});

function mostrar(texto, tipo) {
  aviso.textContent = texto;
  aviso.className = 'hd-aviso' + (tipo ? ' ' + tipo : '');
}

function mostrarSenha(texto, tipo) {
  avisoSenha.textContent = texto;
  avisoSenha.className = 'hd-aviso' + (tipo ? ' ' + tipo : '');
}

/* ------------------------------------------------------------------ *
 * Ligação
 * ------------------------------------------------------------------ */
encaixarBotao();
Conta.aoMudar(pintarBotao);
Conta.iniciar();

// Conta a visita e mantem o "ativos agora" do painel em dia.
import('./presenca.js');
