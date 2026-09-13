/**
 * O sistema de indicação, do lado do servidor.
 *
 * Regra do negócio: quem chega com um código paga 20% menos, e quem indicou
 * ganha 20% do que foi efetivamente pago. O saque só abre a partir de um
 * mínimo, guardado em `configuracoes` para o admin mudar sem publicar código.
 *
 * TUDO AQUI RODA COM A CHAVE DE SERVIÇO E NUNCA NO NAVEGADOR. As tabelas estão
 * com RLS ligada e sem política nenhuma: a chave pública não lê saldo, não lê
 * chave PIX de terceiros e não escreve comissão. O único caminho é por estas
 * funções.
 *
 * O nome começa com "_" porque a Vercel não transforma esses arquivos em
 * endereços públicos — isto é biblioteca, não rota.
 */
import { cabecalhos } from './_supabase.js';
import { COMISSAO_INDICACAO } from '../js/planos.js';

/**
 * O alfabeto dos códigos.
 *
 * Sem O, 0, I, 1 e nem L: o código é feito para ser ditado no WhatsApp e
 * digitado à mão, e esses cinco são os que trocam de identidade dependendo da
 * fonte. Um código que a pessoa erra ao digitar é uma venda indicada perdida.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO = 7;

function sortearCodigo() {
  const bytes = new Uint8Array(TAMANHO);
  crypto.getRandomValues(bytes);
  let saida = '';
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
}

/** Normaliza o que a pessoa digitou: minúscula, espaço e traço não invalidam. */
export function limparCodigo(bruto) {
  return String(bruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

async function buscar(env, caminho) {
  const r = await fetch(env.url + '/rest/v1/' + caminho, { headers: cabecalhos(env.chave) });
  if (!r.ok) throw new Error('GET ' + caminho + ': ' + r.status + ' ' + (await r.text()));
  return r.json();
}

/**
 * O código de quem está pedindo — criando na primeira vez que é pedido.
 *
 * Criar só quando alguém abre a página de indicação evita encher a tabela com
 * código de quem nunca vai divulgar.
 */
export async function codigoDe(usuarioId, env) {
  const achado = await buscar(env, 'afiliados?select=codigo&id=eq.' + encodeURIComponent(usuarioId));
  if (achado[0]) return achado[0].codigo;

  // O sorteio pode bater num código que já existe. Em vez de conferir antes —
  // que ainda deixaria a brecha entre a conferência e a gravação — deixa o
  // banco recusar pela restrição de unicidade e tenta outro.
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const codigo = sortearCodigo();
    const r = await fetch(env.url + '/rest/v1/afiliados', {
      method: 'POST',
      headers: cabecalhos(env.chave, { Prefer: 'return=representation' }),
      body: JSON.stringify({ id: usuarioId, codigo }),
    });
    if (r.ok) return codigo;

    const texto = await r.text();
    // 23505 é "valor duplicado". Se foi o id que duplicou, alguém criou o
    // código em paralelo: o certo é ler o que ficou lá, não insistir.
    if (!texto.includes('23505')) throw new Error('POST afiliados: ' + r.status + ' ' + texto);
    const agora = await buscar(env, 'afiliados?select=codigo&id=eq.' + encodeURIComponent(usuarioId));
    if (agora[0]) return agora[0].codigo;
  }
  throw new Error('Não consegui gerar um código de indicação.');
}

/** De quem é este código. Devolve null quando não existe. */
export async function afiliadoPorCodigo(codigo, env) {
  const limpo = limparCodigo(codigo);
  if (!limpo) return null;
  const achado = await buscar(env, 'afiliados?select=id,codigo&codigo=eq.' + encodeURIComponent(limpo));
  return achado[0] || null;
}

/**
 * Esta pessoa ainda pode ser indicada?
 *
 * Não pode em três casos, e cada um é uma forma de tirar dinheiro do sistema:
 *
 *  - já foi indicada antes — o desconto vale na primeira assinatura, senão
 *    bastaria renovar sempre com código para nunca pagar preço cheio;
 *  - já pagou alguma vez — quem já era cliente não é indicação de ninguém;
 *  - é o próprio dono do código — desconto de 20% mais 20% de volta no próprio
 *    bolso é dinheiro saindo por nada.
 */
export async function podeSerIndicado(usuarioId, afiliadoId, env) {
  if (!afiliadoId || afiliadoId === usuarioId) return { pode: false, motivo: 'proprio_codigo' };

  const jaIndicado = await buscar(
    env, 'indicacoes?select=pagamento_id&indicado_id=eq.' + encodeURIComponent(usuarioId) + '&limit=1');
  if (jaIndicado.length) return { pode: false, motivo: 'ja_indicado' };

  const jaPagou = await buscar(
    env, 'pagamentos?select=id&status=eq.approved&usuario_id=eq.' + encodeURIComponent(usuarioId) + '&limit=1');
  if (jaPagou.length) return { pode: false, motivo: 'ja_e_cliente' };

  return { pode: true };
}

/**
 * Grava a comissão de uma venda indicada.
 *
 * Chamada depois que o pagamento foi confirmado e registrado. É idempotente
 * pela chave primária: o Mercado Pago reenvia a mesma notificação várias
 * vezes, e sem isso a mesma venda pagaria comissão repetida.
 */
export async function registrarIndicacao(dados, env) {
  const comissao = Math.round(Number(dados.valorPago) * COMISSAO_INDICACAO * 100) / 100;

  const r = await fetch(env.url + '/rest/v1/indicacoes', {
    method: 'POST',
    headers: cabecalhos(env.chave, { Prefer: 'resolution=ignore-duplicates' }),
    body: JSON.stringify({
      pagamento_id: String(dados.pagamentoId),
      afiliado_id: dados.afiliadoId,
      indicado_id: dados.indicadoId,
      plano: dados.plano || null,
      valor_pago: Number(dados.valorPago),
      comissao,
    }),
  });
  if (!r.ok) throw new Error('POST indicacoes: ' + r.status + ' ' + (await r.text()));
  return { comissao };
}

/** Quanto vale o saque mínimo hoje. */
export async function saqueMinimo(env) {
  try {
    const linhas = await buscar(env, 'configuracoes?select=valor&chave=eq.saque_minimo');
    const v = Number(linhas[0] && linhas[0].valor);
    return Number.isFinite(v) && v > 0 ? v : 100;
  } catch {
    return 100;
  }
}

/** O painel de quem indica: código, indicações, saldo e histórico de saques. */
export async function resumo(usuarioId, env) {
  const codigo = await codigoDe(usuarioId, env);

  const [indicacoes, saques, minimo] = await Promise.all([
    buscar(env, 'indicacoes?select=plano,valor_pago,comissao,criado_em&afiliado_id=eq.'
      + encodeURIComponent(usuarioId) + '&order=criado_em.desc&limit=100'),
    buscar(env, 'saques?select=id,valor,status,motivo,criado_em,resolvido_em&afiliado_id=eq.'
      + encodeURIComponent(usuarioId) + '&order=criado_em.desc&limit=50'),
    saqueMinimo(env),
  ]);

  const ganho = indicacoes.reduce((s, i) => s + Number(i.comissao), 0);
  const preso = saques
    .filter((s) => s.status === 'pedido' || s.status === 'pago')
    .reduce((s, x) => s + Number(x.valor), 0);

  return {
    codigo,
    minimo,
    indicacoes: indicacoes.length,
    ganho: Math.round(ganho * 100) / 100,
    saldo: Math.round((ganho - preso) * 100) / 100,
    vendas: indicacoes,
    saques,
  };
}

/**
 * Credita a comissão de um pagamento aprovado, se ele veio por indicação.
 *
 * Existe como função única porque a confirmação chega por DOIS caminhos: o
 * aviso do Mercado Pago (webhook) e a conferência que a própria tela faz
 * enquanto espera. Os dois precisam creditar igual, e a gravação é idempotente
 * pelo id do pagamento, então quem chegar primeiro grava e o segundo não
 * duplica.
 *
 * Nunca derruba a liberação do VIP: se a comissão falhar, quem pagou continua
 * recebendo o que comprou e o prejuízo é um número a corrigir no painel.
 */
export async function creditarSeIndicado(pagamento, usuarioId, planoId, env) {
  const afiliadoId = pagamento && pagamento.metadata && pagamento.metadata.indicado_por;
  if (!afiliadoId) return null;

  try {
    // Confere de novo aqui, e não só na hora de cobrar: entre o pagamento ser
    // criado e ser aprovado passa tempo — no PIX, até horas — e nesse meio a
    // pessoa pode ter sido indicada por outro código.
    const pode = await podeSerIndicado(usuarioId, afiliadoId, env);
    if (!pode.pode) {
      console.warn('Indicação recusada na confirmação:', pode.motivo, 'pagamento', pagamento.id);
      return null;
    }

    const { comissao } = await registrarIndicacao({
      pagamentoId: pagamento.id,
      afiliadoId,
      indicadoId: usuarioId,
      plano: planoId,
      valorPago: pagamento.transaction_amount || 0,
    }, env);

    console.log('Comissão de R$', comissao, 'para', afiliadoId, 'pelo pagamento', pagamento.id);
    return { comissao };
  } catch (err) {
    console.error('Falha ao creditar a indicação:', err);
    return null;
  }
}
