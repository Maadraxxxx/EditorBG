/**
 * Contas e plano VIP, em cima do Supabase.
 *
 * Quem manda no plano é a coluna `vip` da tabela `perfis`, protegida por Row
 * Level Security: o navegador consegue LER o próprio perfil, mas não escrever.
 * Só a função serverless, com a service role key, promove alguém a VIP — e ela
 * só faz isso depois de confirmar o pagamento com o Mercado Pago.
 *
 * Sem as chaves preenchidas abaixo o site continua funcionando normalmente,
 * apenas sem contas e sempre no plano grátis.
 */

/* ------------------------------------------------------------------ *
 * Projeto Supabase
 * ------------------------------------------------------------------ */
// A chave anon é pública por design: ela vai no código do site e fica visível
// para qualquer visitante. Quem protege o banco é o RLS, não o sigilo dela.
export const SUPABASE_URL = 'https://lbbzrmvmezywmeghofzd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYnpybXZtZXp5d21lZ2hvZnpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MTU1NjgsImV4cCI6MjEwNDM5MTU2OH0.HjwpcNxyAiLFzBTiqPArR0sdjNniR8mpaFLwgLQmrSo';

/** Só ligue depois de configurar o provedor Google no painel do Supabase. */
export const GOOGLE_ATIVO = false;

export const CONFIGURADO = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/* ------------------------------------------------------------------ *
 * Estado
 * ------------------------------------------------------------------ */
let cliente = null;
let sessao = null;
let perfil = null;

const ouvintes = new Set();

/**
 * Recuperação de senha.
 *
 * O link que chega por e-mail JÁ entra na conta — é assim que o Supabase
 * funciona, a sessão é o comprovante de que a pessoa abriu a caixa de entrada.
 * Só que entrar não era o pedido dela: ela quer trocar a senha. Sem marcar de
 * onde veio essa sessão, a tela mostra "você está logado" e a troca nunca
 * aparece.
 *
 * A URL é lida aqui em cima, no carregamento do módulo, porque o `createClient`
 * apaga o hash assim que processa o link — depois dele não sobra o que ler.
 */
const VEIO_DE_RECUPERACAO = (() => {
  try {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const busca = new URLSearchParams(location.search);
    return hash.get('type') === 'recovery' || busca.get('type') === 'recovery';
  } catch {
    return false;
  }
})();

let recuperando = VEIO_DE_RECUPERACAO;

/** A sessão atual veio de um link de "esqueci a senha"? */
export function estaRecuperando() {
  return recuperando;
}

/** Desiste da troca sem sair da conta. */
export function limparRecuperacao() {
  recuperando = false;
  avisar();
}

/** Avisa a interface que a conta ou o plano mudou. */
function avisar() {
  for (const fn of ouvintes) {
    try { fn({ usuario: usuario(), vip: ehVip(), admin: ehAdmin(), recuperando }); } catch (err) { console.error(err); }
  }
}

export function aoMudar(fn) {
  ouvintes.add(fn);
  fn({ usuario: usuario(), vip: ehVip(), admin: ehAdmin(), recuperando });
  return () => ouvintes.delete(fn);
}

export function usuario() {
  return sessao ? sessao.user : null;
}

export function estaLogado() {
  return !!sessao;
}

export function ehVip() {
  return !!(perfil && perfil.vip);
}

/**
 * Cargo de administrador.
 *
 * Serve só para decidir o que a tela mostra. Quem realmente barra o acesso ao
 * painel e as mudancas de cargo e a funcao serverless, que confere isto no
 * banco a cada chamada — mentir aqui no navegador nao abre porta nenhuma.
 */
export function ehAdmin() {
  return !!(perfil && perfil.admin);
}

export function tokenAcesso() {
  return sessao ? sessao.access_token : null;
}

/* ------------------------------------------------------------------ *
 * Início
 * ------------------------------------------------------------------ */
let iniciando = null;

export function iniciar() {
  if (!CONFIGURADO) return Promise.resolve(null);
  if (iniciando) return iniciando;

  iniciando = (async () => {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Assinado ANTES do getSession de propósito: o PASSWORD_RECOVERY nasce
    // enquanto o SDK lê o link do e-mail, e quem assina depois perde o evento.
    cliente.auth.onAuthStateChange(async (evento, nova) => {
      if (evento === 'PASSWORD_RECOVERY') recuperando = true;
      if (evento === 'SIGNED_OUT') recuperando = false;
      sessao = nova || null;
      await carregarPerfil();
      avisar();
    });

    const { data } = await cliente.auth.getSession();
    sessao = data.session || null;
    await carregarPerfil();

    avisar();
    return cliente;
  })();

  return iniciando;
}

async function carregarPerfil() {
  if (!sessao) { perfil = null; return; }
  const { data, error } = await cliente
    .from('perfis')
    .select('vip, admin, email')
    .eq('id', sessao.user.id)
    .maybeSingle();
  if (error) console.warn('Não deu para ler o perfil:', error.message);
  perfil = data || { vip: false };
}

/** Relê o plano no banco — usado depois de um pagamento. */
export async function atualizarPlano() {
  if (!CONFIGURADO || !sessao) return false;
  await carregarPerfil();
  avisar();
  return ehVip();
}

/* ------------------------------------------------------------------ *
 * Entrar, cadastrar, sair
 * ------------------------------------------------------------------ */
function exigirCliente() {
  if (!CONFIGURADO) throw new Error('As contas ainda não foram configuradas neste site.');
  if (!cliente) throw new Error('Conta ainda carregando, tente de novo em instantes.');
}

export async function entrar(email, senha) {
  exigirCliente();
  const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzir(error.message));
  return true;
}

export async function cadastrar(email, senha) {
  exigirCliente();
  const { data, error } = await cliente.auth.signUp({ email, password: senha });
  if (error) throw new Error(traduzir(error.message));
  // Com confirmação de e-mail ligada no Supabase, a sessão só vem depois do clique.
  return { precisaConfirmar: !data.session };
}

export async function entrarComGoogle() {
  exigirCliente();
  const { error } = await cliente.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: enderecoDeVolta() },
  });
  if (error) throw new Error(traduzir(error.message));
}

export async function recuperarSenha(email) {
  exigirCliente();
  const { error } = await cliente.auth.resetPasswordForEmail(email, {
    redirectTo: enderecoDeVolta(),
  });
  if (error) throw new Error(traduzir(error.message));
}

/**
 * Grava a senha nova. É o que fecha o ciclo do "esqueci a senha": o link do
 * e-mail abre a sessão, isto troca a senha de verdade.
 */
export async function alterarSenha(nova) {
  exigirCliente();
  if (!sessao) throw new Error('A sessão expirou. Peça outro link de recuperação.');

  const { error } = await cliente.auth.updateUser({ password: nova });
  if (error) throw new Error(traduzir(error.message));

  recuperando = false;
  avisar();
  return true;
}

/**
 * Endereço para onde o e-mail devolve a pessoa, sem hash nem query.
 * `location.href` traria junto o que já estivesse na barra e o Supabase
 * precisa anexar o token dele num endereço limpo.
 */
function enderecoDeVolta() {
  return location.origin + location.pathname;
}

export async function sair() {
  if (!cliente) return;
  await cliente.auth.signOut();
}

/** As mensagens do Supabase vêm em inglês; as comuns viram português. */
function traduzir(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('user already registered')) return 'Esse e-mail já tem conta. Tente entrar.';
  if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.';
  if (m.includes('unable to validate email')) return 'E-mail inválido.';
  if (m.includes('email not confirmed')) return 'Confirme o e-mail antes de entrar.';
  if (m.includes('for security purposes')) return 'Muitas tentativas seguidas. Espere alguns segundos.';
  if (m.includes('should be different')) return 'A senha nova precisa ser diferente da atual.';
  if (m.includes('auth session missing')) return 'O link expirou. Peça outro e-mail de recuperação.';
  if (m.includes('token has expired') || m.includes('invalid or has expired')) {
    return 'Esse link já foi usado ou passou da validade. Peça outro.';
  }
  return msg;
}
