/**
 * Avisa o servidor que alguém está aqui.
 *
 * É o que alimenta dois números do painel: quantas pessoas passaram pelo site
 * e quantas contas estão ativas agora. Quem decide se a visita conta é o
 * servidor — daqui sai só o aviso, sem nenhum identificador.
 *
 * Silencioso por princípio: se a função não existir (rodando na sua máquina,
 * sem a Vercel) ou o servidor estiver fora do ar, a página segue igual. Uma
 * estatística nunca vale um erro na cara de quem está usando o site.
 */
import * as Conta from './conta.js';

const ENDERECO = '/api/presenca';
const ESPERA = 5 * 60 * 1000;   // não repete o aviso antes disso

let ultimoAviso = 0;

async function avisar() {
  const agora = Date.now();
  if (agora - ultimoAviso < ESPERA) return;
  ultimoAviso = agora;

  const cabecalhos = {};
  const token = Conta.tokenAcesso();
  if (token) cabecalhos.Authorization = 'Bearer ' + token;

  try {
    await fetch(ENDERECO, { method: 'POST', headers: cabecalhos });
  } catch {
    // sem servidor, sem estatística, sem problema
  }
}

// Na volta para a aba, e não a cada segundo: a espera acima segura o resto.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') avisar();
});

// O primeiro aviso espera a sessão carregar, senão quem está logado seria
// contado como visitante anônimo.
Conta.iniciar().then(avisar).catch(avisar);
