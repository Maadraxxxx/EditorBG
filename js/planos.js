/**
 * Os planos VIP — nome, preço e duração.
 *
 * Este arquivo é importado dos DOIS lados: pelo navegador, que desenha os
 * cartões, e pelas funções em `api/`, que cobram e liberam o acesso. É de
 * propósito. Com duas listas separadas, uma alteração de preço em só um lugar
 * faria a pessoa ver R$ 4,90 na tela e ser cobrada outra coisa — o tipo de bug
 * que só aparece depois de alguém pagar errado.
 *
 * Continua valendo que o servidor é quem manda: `api/pagar.js` lê o preço
 * daqui pelo id do plano e ignora qualquer valor que venha do navegador. Ter a
 * mesma tabela dos dois lados evita divergência; não é o que garante a
 * cobrança certa.
 */

export const PLANOS = {
  mensal: {
    id: 'mensal',
    nome: '1 mês',
    valor: 4.90,
    meses: 1,
    descricao: 'para um trabalho pontual',
  },
  trimestral: {
    id: 'trimestral',
    nome: '3 meses',
    valor: 12.90,
    meses: 3,
    descricao: 'sai por R$ 4,30 por mês',
    destaque: true,
  },
  vitalicio: {
    id: 'vitalicio',
    nome: 'Vitalício',
    valor: 19.90,
    meses: null,            // null = não expira
    descricao: 'paga uma vez e acabou',
  },
};

/** Ordem em que aparecem na tela, do mais barato ao mais caro. */
export const ORDEM = ['mensal', 'trimestral', 'vitalicio'];

/** Qual vem marcado ao abrir. O do meio, que é o de melhor custo-benefício. */
export const PLANO_PADRAO = 'trimestral';

/** Devolve o plano, ou undefined se o id não existir. Nunca confie no id vindo de fora sem passar por aqui. */
export function plano(id) {
  return Object.prototype.hasOwnProperty.call(PLANOS, id) ? PLANOS[id] : undefined;
}

export function precoEscrito(id) {
  const p = plano(id);
  return p ? 'R$ ' + p.valor.toFixed(2).replace('.', ',') : '—';
}

/**
 * Qual plano custa este valor.
 *
 * O webhook usa isto para conferir o que o Mercado Pago diz ter recebido. O
 * plano tambem viaja em `metadata`, mas metadata e conveniencia — o dinheiro
 * que entrou e o fato. Se os dois discordarem, vale o valor pago.
 */
export function planoPeloValor(valor) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return undefined;
  return ORDEM.map((id) => PLANOS[id]).find((p) => Math.abs(p.valor - v) < 0.005);
}

/**
 * Qual plano um pagamento do Mercado Pago comprou.
 *
 * O plano viaja em `metadata`, posto por api/pagar.js. Mas metadata e um campo
 * que acompanha o pagamento, e o VALOR e o pagamento. Se os dois discordarem,
 * vale o dinheiro que entrou — entregar 3 meses para quem pagou R$ 4,90 seria
 * pior do que confiar no campo.
 *
 * Usada pelo webhook e pela conferencia manual, que precisam chegar na mesma
 * conclusao sobre o mesmo pagamento.
 */
export function planoDoPagamento(pagamento) {
  const pagoDeFato = planoPeloValor(pagamento.transaction_amount);
  if (pagoDeFato) return pagoDeFato.id;

  const declarado = plano(pagamento.metadata && pagamento.metadata.plano);
  if (declarado) return declarado.id;

  // Valor que nao bate com plano nenhum e sem metadata utilizavel. E o caso dos
  // pagamentos feitos antes de existirem planos, quando so havia o vitalicio.
  return PLANOS.vitalicio.id;
}

/* ------------------------------------------------------------------ *
 * Validade
 * ------------------------------------------------------------------ */

/**
 * Soma meses sem o pulo de calendário do JavaScript.
 *
 * `new Date('2026-01-31').setMonth(+1)` devolve 3 de março, porque 31 de
 * fevereiro não existe e a data transborda. Quem comprou um mês em 31 de
 * janeiro ganharia três dias de brinde — pouco, mas errado, e no fim de cada
 * mês de 31 dias. Aqui o dia é grudado no último dia do mês de destino.
 */
function somarMeses(data, meses) {
  const d = new Date(data);
  const diaDesejado = d.getDate();

  d.setDate(1);
  d.setMonth(d.getMonth() + meses);

  const ultimoDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaDesejado, ultimoDoMes));
  return d;
}

/**
 * Até quando o VIP vale depois desta compra.
 *
 * Devolve null para o vitalício — é assim que "não expira" é representado no
 * banco. Devolve undefined se o plano não existir, para quem chamou perceber.
 *
 * Renovar em cima de um plano ainda válido SOMA ao que falta, em vez de jogar
 * fora. Quem comprou 3 meses e renova no segundo mês não deve perder o que
 * pagou por ter renovado cedo.
 */
export function novaValidade(planoId, validadeAtual, agora) {
  const p = plano(planoId);
  if (!p) return undefined;
  if (p.meses === null) return null;

  const hoje = agora ? new Date(agora) : new Date();
  const restante = validadeAtual ? new Date(validadeAtual) : null;
  const base = restante && restante > hoje ? restante : hoje;

  return somarMeses(base, p.meses).toISOString();
}

/**
 * A pessoa tem VIP agora?
 *
 * `vip` sozinho não basta: ele continua true depois que a assinatura vence,
 * porque nada roda de tempos em tempos para virar a chave. Quem decide é a
 * data, e por isso esta conta precisa ser feita em todo lugar que pergunta.
 */
export function vipAtivo(perfil) {
  if (!perfil || !perfil.vip) return false;
  if (!perfil.vip_ate) return true;                 // vitalício
  return new Date(perfil.vip_ate) > new Date();
}
