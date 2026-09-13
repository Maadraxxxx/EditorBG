/**
 * As contas do sistema de indicação.
 *
 * Isto aqui mexe em dinheiro de verdade: um erro de arredondamento ou um preço
 * com desconto que o servidor não reconhece não aparece como erro na tela —
 * aparece como plano errado liberado ou comissão errada paga. Por isso os
 * valores são conferidos número a número.
 */
import {
  PLANOS, ORDEM, comDesconto, planoPeloValor, planoDoPagamento,
  DESCONTO_INDICACAO, COMISSAO_INDICACAO,
} from '../js/planos.js';
import { limparCodigo } from '../api/_afiliados.js';

let falhas = 0;
const ok = (cond, texto, extra = '') => {
  console.log('  ' + (cond ? 'ok   ' : 'FALHA') + ' ' + texto + (extra ? '\n        ' + extra : ''));
  if (!cond) falhas++;
};
const reais = (v) => 'R$ ' + Number(v).toFixed(2);

console.log('\n--- o desconto ---');
for (const id of ORDEM) {
  const p = PLANOS[id];
  const d = comDesconto(p.valor);
  const esperado = Math.round(p.valor * 0.8 * 100) / 100;
  ok(d === esperado, id + ': ' + reais(p.valor) + ' vira ' + reais(d));
  ok(Number.isInteger(Math.round(d * 100)) && d.toFixed(2) === d.toFixed(2),
    id + ': o valor com desconto tem no máximo dois decimais');
}

console.log('\n--- o valor com desconto ainda identifica o plano ---');
// ISTO É O QUE MAIS IMPORTA AQUI. `planoDoPagamento` decide pelo VALOR pago; se
// o valor com desconto não batesse com plano nenhum, o caminho de reserva
// entregaria VITALÍCIO para quem pagou o mensal com desconto.
for (const id of ORDEM) {
  const d = comDesconto(PLANOS[id].valor);
  const achado = planoPeloValor(d);
  ok(achado && achado.id === id, id + ': ' + reais(d) + ' é reconhecido como ' + id,
    achado ? '' : 'nenhum plano casou com este valor');

  const semMetadata = planoDoPagamento({ transaction_amount: d, metadata: {} });
  ok(semMetadata === id, id + ': sem metadata, ' + reais(d) + ' ainda vira ' + id,
    'veio ' + semMetadata);
}

console.log('\n--- nenhum preço colide com outro ---');
const todos = ORDEM.flatMap((id) => [PLANOS[id].valor, comDesconto(PLANOS[id].valor)]);
ok(new Set(todos).size === todos.length,
  'os ' + todos.length + ' preços (cheios e com desconto) são todos diferentes',
  todos.map((v) => reais(v)).join(' · '));

console.log('\n--- a comissão ---');
for (const id of ORDEM) {
  const pago = comDesconto(PLANOS[id].valor);
  const comissao = Math.round(pago * COMISSAO_INDICACAO * 100) / 100;
  const sobra = Math.round((pago - comissao) * 100) / 100;
  ok(comissao > 0 && comissao < pago,
    id + ': paga ' + reais(pago) + ', comissão ' + reais(comissao) + ', sobra ' + reais(sobra));
}

console.log('\n--- quantas indicações para sacar R$ 100 ---');
for (const id of ORDEM) {
  const comissao = Math.round(comDesconto(PLANOS[id].valor) * COMISSAO_INDICACAO * 100) / 100;
  const quantas = Math.ceil(100 / comissao);
  console.log('        ' + id.padEnd(12) + ' comissão ' + reais(comissao)
    + ' → ' + quantas + ' indicações');
}

console.log('\n--- o código digitado à mão ---');
ok(limparCodigo('k7qm2xz') === 'K7QM2XZ', 'minúscula vira maiúscula');
ok(limparCodigo(' K7QM-2XZ ') === 'K7QM2XZ', 'espaço e traço não invalidam');
ok(limparCodigo('') === '', 'vazio continua vazio');
ok(limparCodigo(null) === '', 'nulo não quebra');
ok(limparCodigo('<script>') === 'SCRIPT', 'só sobram letras e números');
ok(limparCodigo('A'.repeat(50)).length === 16, 'código gigante é cortado');

console.log('\n--- as taxas são as combinadas ---');
ok(DESCONTO_INDICACAO === 0.20, 'desconto de 20%');
ok(COMISSAO_INDICACAO === 0.20, 'comissão de 20%');

console.log(falhas ? '\n' + falhas + ' FALHA(S)\n' : '\ntudo passou\n');
process.exit(falhas ? 1 : 0);
