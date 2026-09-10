/**
 * Melhorar a qualidade de uma imagem.
 *
 * Dois caminhos, com honestidades diferentes:
 *
 *   rapido()   — níveis automáticos, redução de ruído, nitidez e ampliação por
 *                reamostragem. Sai na hora, em qualquer tamanho, em qualquer
 *                máquina. NÃO inventa detalhe: melhora o que já está na foto.
 *
 *   comIA()    — super-resolução 2× de verdade, com um modelo que roda no
 *                navegador. Inventa detalhe plausível, e é por isso que é
 *                melhor — e por isso que demora.
 *
 * SOBRE O LIMITE DE TAMANHO DA IA, que não é capricho: o modelo leva cerca de
 * 0,32 ms por pixel de entrada, medido aqui em dois tamanhos com escala linear
 * confirmada. Uma foto de 1000×1000 levaria cinco minutos e meio; uma de
 * 1500×1500, doze. Por isso a IA só é oferecida abaixo de TETO_IA — acima
 * disso a espera deixaria de ser espera e viraria abandono.
 */
import { aplicarAjustes } from './adjust.js';

/** Acima disso a IA não é oferecida: a conta de tempo deixa de fechar. */
export const TETO_IA = 600;

/** Segundos aproximados que a IA vai levar, para avisar antes de começar. */
export function estimarSegundos(largura, altura) {
  return Math.max(5, Math.round(largura * altura * 0.00032));
}

/* ------------------------------------------------------------------ *
 * Caminho rápido
 * ------------------------------------------------------------------ */

function paraCanvas(fonte, largura, altura) {
  const c = document.createElement('canvas');
  c.width = largura || fonte.width;
  c.height = altura || fonte.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return c;
}

/**
 * Onde o histograma realmente começa e termina.
 *
 * Foto desbotada usa só um pedaço da faixa disponível — nada chega perto do
 * preto nem do branco. Esticar esse pedaço até as pontas é o que devolve
 * contraste sem precisar de nenhum ajuste manual.
 *
 * O corte é por percentil, não pelo mínimo e máximo absolutos: um único pixel
 * queimado ou um pontinho preto de ruído definiria a faixa inteira sozinho, e
 * o esticamento não faria nada.
 */
function faixaUtil(dados, corte = 0.004) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < dados.length; i += 4) {
    const lum = (dados[i] * 0.2126 + dados[i + 1] * 0.7152 + dados[i + 2] * 0.0722) | 0;
    hist[lum]++;
  }

  const total = dados.length / 4;
  const alvo = total * corte;

  let baixo = 0, acumulado = 0;
  while (baixo < 255 && acumulado + hist[baixo] < alvo) { acumulado += hist[baixo]; baixo++; }

  let alto = 255; acumulado = 0;
  while (alto > 0 && acumulado + hist[alto] < alvo) { acumulado += hist[alto]; alto--; }

  return { baixo, alto };
}

/**
 * Quanto ruído esta foto tem, em desvio padrão de luminância.
 *
 * Truque padrão: numa área lisa, o laplaciano é praticamente só ruído. Tomando
 * a MEDIANA dos valores absolutos em vez da média, as bordas de verdade —
 * poucas e enormes — não puxam a conta, e sobra a granulação, que está em toda
 * parte. O 1,4826 converte mediana de desvio absoluto em desvio padrão.
 *
 * Sem esta medida o filtro usaria um limiar fixo, e limiar fixo erra nos dois
 * sentidos: apaga detalhe em foto limpa e deixa passar grão em foto suja.
 */
function estimarRuido(d, largura, altura) {
  const amostras = [];
  const passo = Math.max(1, Math.floor(Math.min(largura, altura) / 90));

  for (let y = passo; y < altura - passo; y += passo) {
    for (let x = passo; x < largura - passo; x += passo) {
      const i = (y * largura + x) * 4;
      const L = (p) => d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722;
      amostras.push(Math.abs(4 * L(i) - L(i - 4) - L(i + 4) - L(i - largura * 4) - L(i + largura * 4)));
    }
  }
  if (!amostras.length) return 0;

  amostras.sort((a, b) => a - b);
  const mediana = amostras[amostras.length >> 1];
  // O laplaciano de 5 vizinhos multiplica o desvio por raiz de 20.
  return (mediana * 1.4826) / Math.sqrt(20);
}

/**
 * Média dos vizinhos SÓ onde a vizinhança é lisa. Devolve o ruído medido, que
 * quem chama usa para decidir quanto afiar depois.
 *
 * Borrão comum tira o ruído junto com o detalhe. Aqui cada pixel só é
 * misturado com a média quando ele está próximo dela — o que acontece em céu,
 * pele e parede, e não acontece em borda.
 */
function reduzirRuido(ctx, largura, altura, forca) {
  if (forca <= 0) return 0;

  const img = ctx.getImageData(0, 0, largura, altura);
  const d = img.data;

  const sigma = estimarRuido(d, largura, altura);

  // Foto já limpa: mexer só tiraria detalhe.
  if (sigma < 1.2) return sigma;

  const saida = new Uint8ClampedArray(d);
  // 2,5 desvios cobre a quase totalidade do grão sem alcançar borda de
  // verdade, que salta muito mais que isso.
  const limite = Math.min(60, Math.max(8, sigma * 2.5));

  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const i = (y * largura + x) * 4;

      for (let canal = 0; canal < 3; canal++) {
        const p = i + canal;
        let soma = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            soma += d[p + (dy * largura + dx) * 4];
          }
        }
        const media = soma / 9;
        const dif = Math.abs(d[p] - media);
        if (dif < limite) {
          // quanto mais lisa a vizinhança, mais peso a média recebe
          const peso = forca * (1 - dif / limite);
          saida[p] = d[p] * (1 - peso) + media * peso;
        }
      }
    }
  }

  ctx.putImageData(new ImageData(saida, largura, altura), 0, 0);
  return sigma;
}

/**
 * Amplia em passos de 2×, nunca de uma vez.
 *
 * `drawImage` direto de 300 para 1200 pixels amostra pouco e deixa a imagem
 * mole. Dobrando de cada vez, cada passo tem vizinhos próximos para ler, e o
 * resultado fica bem mais firme — é o truque clássico para aproximar Lanczos
 * com o que o canvas oferece.
 */
function ampliar(fonte, escala) {
  let atual = fonte;
  let restante = escala;

  while (restante > 1.0001) {
    const passo = Math.min(2, restante);
    atual = paraCanvas(atual, Math.round(atual.width * passo), Math.round(atual.height * passo));
    restante /= passo;
  }
  return atual;
}

export const OPCOES_PADRAO = {
  niveis: true,
  ruido: 0.75,        // 0 a 1
  nitidez: 42,        // escala de adjust.js, 0 a 100
  vibracao: 12,
  escala: 1,          // 1 = não amplia
};

/**
 * A melhoria instantânea. Devolve um canvas novo; não toca no original.
 */
export function rapido(fonte, opcoes = {}) {
  const o = { ...OPCOES_PADRAO, ...opcoes };

  // Ampliar ANTES de afiar: afiar primeiro e ampliar depois espalharia os
  // halos da nitidez junto com o resto.
  let canvas = o.escala > 1 ? ampliar(fonte, o.escala) : paraCanvas(fonte);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // RUÍDO PRIMEIRO, e a ordem aqui não é detalhe.
  //
  // Na primeira versão o esticamento de níveis vinha antes, e a foto saía mais
  // contrastada e visivelmente mais granulada. O motivo: esticar multiplica o
  // ruído junto com tudo. Um grão que valia 13 passava a valer 57, cruzava o
  // limiar que separa ruído de detalhe, e a redução seguinte simplesmente o
  // deixava passar — para a nitidez então reforçá-lo.
  const sigma = reduzirRuido(ctx, canvas.width, canvas.height, o.ruido);

  let ganho = 1;

  if (o.niveis) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { baixo, alto } = faixaUtil(img.data);

    // Faixa já ocupada quase inteira: esticar só amplificaria ruído.
    if (alto - baixo > 12 && (baixo > 3 || alto < 252)) {
      // Teto no esticamento: foto muito lavada pede um ganho enorme, e ganho
      // enorme entrega uma imagem dura, com sombra sem informação. Auto-níveis
      // de verdade não empurram tanto.
      ganho = Math.min(255 / (alto - baixo), 2.2);

      const d = img.data;
      const meio = (baixo + alto) / 2;
      const tabela = new Uint8ClampedArray(256);
      // Estica em volta do centro da faixa, não a partir do preto: assim o
      // brilho médio da foto não muda junto com o contraste.
      for (let v = 0; v < 256; v++) tabela[v] = meio + (v - meio) * ganho;

      for (let i = 0; i < d.length; i += 4) {
        d[i] = tabela[d[i]];
        d[i + 1] = tabela[d[i + 1]];
        d[i + 2] = tabela[d[i + 2]];
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  // A nitidez cede por dois motivos somados.
  //
  // Pelo esticamento: esticar já adiciona contraste local sozinho, e somar
  // nitidez cheia em cima disso vira halo.
  //
  // Pelo ruído: afiar é amplificar alta frequência, e ruído é exatamente alta
  // frequência. Numa foto granulada, nitidez cheia devolve na tela todo o grão
  // que a redução acabou de tirar — que foi o que a primeira versão fazia.
  const penalidadeRuido = 1 + Math.min(1.6, sigma / 6);
  const nitidez = Math.round(o.nitidez / (Math.sqrt(ganho) * penalidadeRuido));

  // A nitidez e a vibração já existem em adjust.js, testadas e com o mesmo
  // comportamento do editor. Reescrevê-las aqui só criaria duas versões para
  // divergirem depois.
  if (nitidez || o.vibracao) {
    canvas = aplicarAjustes(canvas, {
      brilho: 0, contraste: 0, saturacao: 0, exposicao: 0, destaques: 0,
      sombras: 0, temperatura: 0, tonalidade: 0, desfoque: 0, vinheta: 0,
      claridade: 0, inverter: false,
      nitidez,
      vibracao: o.vibracao,
    });
  }

  return canvas;
}

/* ------------------------------------------------------------------ *
 * Caminho com IA
 * ------------------------------------------------------------------ */
const MODELO_IA = 'Xenova/swin2SR-lightweight-x2-64';

let carregando = null;

/** Carrega o modelo uma vez. O download é grande; o navegador guarda depois. */
function carregarIA(aoProgredir) {
  if (carregando) return carregando;

  carregando = (async () => {
    const { pipeline, env } = await import(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'
    );
    env.allowLocalModels = false;
    return pipeline('image-to-image', MODELO_IA, {
      dtype: 'q8',
      progress_callback: aoProgredir,
    });
  })();

  carregando.catch(() => { carregando = null; });   // erro não pode ficar em cache
  return carregando;
}

/**
 * Super-resolução 2×. Devolve um canvas novo.
 *
 * @param {(fase: string, fracao: number) => void} aoProgredir  0 a 1
 */
export async function comIA(fonte, aoProgredir = () => {}) {
  const maior = Math.max(fonte.width, fonte.height);
  if (maior > TETO_IA) {
    throw new Error('Esta imagem é grande demais para a IA (máximo ' + TETO_IA + ' px de lado).');
  }

  aoProgredir('baixando', 0);
  const modelo = await carregarIA((p) => {
    if (p && p.status === 'progress' && p.total) {
      aoProgredir('baixando', Math.min(0.99, p.loaded / p.total));
    }
  });

  aoProgredir('processando', 0);

  const { RawImage } = await import(
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'
  );
  const blob = await new Promise((r) => paraCanvas(fonte).toBlob(r, 'image/png'));
  const entrada = await RawImage.fromBlob(blob);

  const saida = await modelo(entrada);
  aoProgredir('pronto', 1);

  // O modelo devolve RawImage; vira canvas para o resto do site trabalhar.
  const c = document.createElement('canvas');
  c.width = saida.width;
  c.height = saida.height;
  c.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(paraRGBA(saida)), saida.width, saida.height),
    0, 0
  );
  return c;
}

/** O modelo devolve 3 canais; o canvas quer 4. */
function paraRGBA(img) {
  if (img.channels === 4) return img.data;
  const n = img.width * img.height;
  const fora = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    fora[i * 4] = img.data[i * img.channels];
    fora[i * 4 + 1] = img.data[i * img.channels + 1];
    fora[i * 4 + 2] = img.data[i * img.channels + 2];
    fora[i * 4 + 3] = 255;
  }
  return fora;
}
