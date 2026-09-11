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
 * A IA aceita qualquer tamanho. Ela processa em ladrilhos, num Worker, e o
 * tempo estimado aparece escrito antes de começar — o modelo leva cerca de
 * 0,32 ms por pixel de entrada, medido aqui em dois tamanhos com escala linear
 * confirmada.
 */
import { aplicarAjustes } from './adjust.js';
import { ehCelular } from './limites.js';

/* ------------------------------------------------------------------ *
 * Ladrilhos
 * ------------------------------------------------------------------ *
 * A IA aceita qualquer tamanho, e é por isso que ela processa em pedaços.
 *
 * Uma imagem grande de uma vez só não é apenas lenta: os tensores intermediários
 * do modelo crescem com o número de pixels, e o WASM tem teto de memória. Uma
 * foto de 3000 px estouraria antes de terminar, depois de ter feito a pessoa
 * esperar. Em ladrilhos o pico de memória fica igual para qualquer tamanho.
 *
 * Cada ladrilho é processado com uma margem em volta e depois recortado ao
 * miolo. Essa margem existe para não haver emenda: o modelo se comporta
 * diferente na beira do que recebe, e sem contexto ao redor as costuras
 * apareceriam como uma grade sobre a foto inteira.
 */
const LADRILHO = 192;
const MARGEM = 16;

/**
 * Custo medido por pixel de entrada, num ladrilho de 192px: 0,32 ms no
 * processador e 0,108 ms na placa de vídeo — quase três vezes mais rápido.
 *
 * São dois números e não um porque a mesma imagem leva tempos muito
 * diferentes conforme a máquina tenha ou não WebGPU, e prometer o tempo do
 * CPU para quem tem GPU (ou o contrário, pior ainda) quebra justamente o
 * aviso que existe para a pessoa decidir se vale esperar.
 *
 * A margem faz cada ladrilho processar mais pixels do que aproveita, e esse
 * desperdício entra na conta — senão a estimativa mentiria para baixo
 * justamente nas imagens grandes, que são as que precisam de aviso.
 *
 * Os dois valores vieram de uma máquina só (GPU NVIDIA Pascal). Numa placa
 * integrada fraca a vantagem é menor, então o número da GPU é otimista;
 * por isso o padrão, quando não se sabe, é o do processador.
 */
const MS_POR_PIXEL = { wasm: 0.00032, webgpu: 0.000108 };
const DESPERDICIO = ((LADRILHO + 2 * MARGEM) ** 2) / (LADRILHO ** 2);

/**
 * Processador de celular é bem mais lento que o do computador onde os números
 * acima foram medidos. Três é um chute honesto, não uma medição — mas errar
 * para cima é o lado certo de errar: quem vê "2 minutos" e espera 6 desiste no
 * meio achando que travou. Assim que o primeiro pedaço termina, a tela passa a
 * mostrar o ritmo real do aparelho e este número deixa de importar.
 */
const PESO_CELULAR = 3;

export function estimarSegundos(largura, altura, dispositivo) {
  const porPixel = MS_POR_PIXEL[dispositivo] || MS_POR_PIXEL.wasm;
  const peso = ehCelular ? PESO_CELULAR : 1;
  return Math.max(5, Math.round(largura * altura * porPixel * DESPERDICIO * peso));
}

/**
 * Qual motor a máquina vai usar. Checagem própria e não a do segment.js para
 * não arrastar o transformers.js inteiro para esta página só por causa de uma
 * pergunta de seis linhas.
 */
let gpuPromessa = null;
export function dispositivoProvavel() {
  if (!gpuPromessa) {
    gpuPromessa = (async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'wasm';
      try {
        return (await navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
      } catch {
        return 'wasm';
      }
    })();
  }
  return gpuPromessa;
}

/** "40 segundos", "cerca de 6 minutos" — para escrever na tela. */
export function tempoEscrito(segundos) {
  if (segundos < 90) return Math.round(segundos) + ' segundos';
  const min = Math.round(segundos / 60);
  return 'cerca de ' + min + (min === 1 ? ' minuto' : ' minutos');
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

/* ------------------------------------------------------------------ *
 * Perfis por tipo de foto
 * ------------------------------------------------------------------ *
 * Os mesmos controles, em posições diferentes. Existem porque "o que melhora"
 * muda com o assunto: pele pede menos nitidez do que etiqueta de produto, e
 * documento pede contraste duro que arruinaria um retrato.
 *
 * Não é recurso novo escondido — é o atalho para quem não quer aprender o que
 * cada controle faz. Os sliders continuam ali para quem quiser.
 */
export const PERFIS = {
  auto: {
    nome: 'Automático',
    dica: 'Equilibrado. Serve para a maioria das fotos.',
    opcoes: { niveis: true, ruido: 0.75, nitidez: 42, vibracao: 12 },
  },
  retrato: {
    nome: 'Retrato',
    dica: 'Menos nitidez e mais suavização: pele afiada demais mostra poro e mancha.',
    opcoes: { niveis: true, ruido: 0.9, nitidez: 22, vibracao: 8 },
  },
  produto: {
    nome: 'Produto',
    dica: 'Nitidez alta e cor puxada, para etiqueta legível e tecido com textura.',
    opcoes: { niveis: true, ruido: 0.5, nitidez: 68, vibracao: 22 },
  },
  paisagem: {
    nome: 'Paisagem',
    dica: 'Contraste e cor firmes, sem exagerar no grão do céu.',
    opcoes: { niveis: true, ruido: 0.65, nitidez: 50, vibracao: 26 },
  },
  documento: {
    nome: 'Documento',
    dica: 'Contraste duro e nitidez máxima: o que importa é a letra, não a foto.',
    opcoes: { niveis: true, ruido: 0.35, nitidez: 85, vibracao: 0 },
  },
};

/* ------------------------------------------------------------------ *
 * Equilíbrio de cor automático
 * ------------------------------------------------------------------ */

/**
 * Tira a dominante de cor da foto.
 *
 * Foto tirada sob lâmpada amarela fica amarela inteira; sob sombra de céu
 * aberto, azulada. O olho compensa na hora e a câmera nem sempre.
 *
 * O método é o "mundo cinza": numa cena variada, a média de todas as cores
 * deveria dar cinza. Se a média está puxada para o amarelo, é a luz, não a
 * cena — então cada canal é multiplicado até a média voltar ao neutro.
 *
 * O ganho é limitado de propósito. Foto que É de uma coisa laranja tem média
 * laranja legitimamente, e sem teto o filtro a deixaria azulada tentando
 * "consertar" o que não estava quebrado.
 */
export function equilibrarCor(canvas, forca = 1) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  let somaR = 0, somaG = 0, somaB = 0, n = 0;
  // Amostra espaçada: a média não muda e a conta fica instantânea em foto grande.
  const passo = Math.max(4, Math.floor(d.length / 4 / 40000)) * 4;
  for (let i = 0; i < d.length; i += passo) {
    // Pixel quase preto ou quase branco não informa sobre a cor da luz.
    const lum = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    if (lum < 24 || lum > 242) continue;
    somaR += d[i]; somaG += d[i + 1]; somaB += d[i + 2]; n++;
  }
  if (n < 50) return 0;

  const mR = somaR / n, mG = somaG / n, mB = somaB / n;
  const cinza = (mR + mG + mB) / 3;

  const limitar = (g) => Math.min(1.35, Math.max(0.74, g));
  let gR = limitar(cinza / mR);
  let gG = limitar(cinza / mG);
  let gB = limitar(cinza / mB);

  // `forca` permite aplicar só parte da correção.
  gR = 1 + (gR - 1) * forca;
  gG = 1 + (gG - 1) * forca;
  gB = 1 + (gB - 1) * forca;

  const tR = new Uint8ClampedArray(256);
  const tG = new Uint8ClampedArray(256);
  const tB = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) { tR[v] = v * gR; tG[v] = v * gG; tB[v] = v * gB; }

  for (let i = 0; i < d.length; i += 4) {
    d[i] = tR[d[i]]; d[i + 1] = tG[d[i + 1]]; d[i + 2] = tB[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);

  // Quanto a foto estava desviada, para a tela poder dizer se valeu a pena.
  return Math.round(Math.max(Math.abs(gR - 1), Math.abs(gG - 1), Math.abs(gB - 1)) * 100);
}

export const OPCOES_PADRAO = {
  niveis: true,
  ruido: 0.75,        // 0 a 1
  nitidez: 42,        // escala de adjust.js, 0 a 100
  vibracao: 12,
  escala: 1,          // 1 = não amplia
  equilibrio: 0,      // 0 a 1 — correção de dominante de cor, recurso VIP
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
  // Equilíbrio ANTES de tudo: a dominante de cor é da luz da cena, e corrigir
  // depois de esticar contraste significaria corrigir um desvio já ampliado.
  if (o.equilibrio > 0) equilibrarCor(canvas, o.equilibrio);

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
/**
 * O modelo roda num Worker, nunca aqui.
 *
 * A inferência é CPU síncrona e leva segundos por ladrilho. Na thread da
 * página isso congela tudo: rolagem, clique, e a própria barra de progresso,
 * que nem chega a ser redesenhada. Ceder o controle ENTRE os ladrilhos não
 * adianta — o congelamento acontece durante cada um.
 */
let trabalhador = null;
let proximoId = 1;
const pendentes = new Map();
let aoBaixar = null;

function obterTrabalhador() {
  if (trabalhador) return trabalhador;

  trabalhador = new Worker(new URL('./melhorar-worker.js', import.meta.url), { type: 'module' });

  trabalhador.onmessage = (e) => {
    const m = e.data || {};

    if (m.tipo === 'baixando') { if (aoBaixar) aoBaixar(m.fracao); return; }

    const espera = pendentes.get(m.tipo === 'carregado' ? 'carregar' : m.id);
    if (!espera) return;
    pendentes.delete(m.tipo === 'carregado' ? 'carregar' : m.id);

    if (m.tipo === 'erro') espera.rejeitar(new Error(m.mensagem));
    else espera.resolver(m);
  };

  trabalhador.onerror = (e) => {
    for (const { rejeitar } of pendentes.values()) {
      rejeitar(new Error('Falha no processador de imagem: ' + (e.message || 'erro desconhecido')));
    }
    pendentes.clear();
    // Worker quebrado não pode ficar guardado: a próxima tentativa recria.
    trabalhador = null;
  };

  return trabalhador;
}

function pedirAoTrabalhador(mensagem, chave, transferiveis) {
  return new Promise((resolver, rejeitar) => {
    pendentes.set(chave, { resolver, rejeitar });
    obterTrabalhador().postMessage(mensagem, transferiveis || []);
  });
}

let carregando = null;

function carregarIA(aoProgredirDownload) {
  aoBaixar = aoProgredirDownload;
  if (carregando) return carregando;

  carregando = pedirAoTrabalhador({ tipo: 'carregar' }, 'carregar');
  carregando.catch(() => { carregando = null; });   // erro não pode ficar em cache
  return carregando;
}



/**
 * Super-resolução 2×, em ladrilhos, com o modelo rodando no Worker.
 *
 * @param {(fase: string, fracao: number, info?: {feitos: number, total: number}) => void} aoProgredir
 * @param {() => boolean} deveParar  consultado entre ladrilhos
 */
export async function comIA(fonte, aoProgredir = () => {}, deveParar = () => false) {
  aoProgredir('baixando', 0);
  const carga = await carregarIA((fracao) => aoProgredir('baixando', Math.min(0.99, fracao)));

  // Qual motor de fato pegou. Pode não ser o previsto: a GPU pode ter sido
  // reconhecida e mesmo assim recusar o modelo, e aí o tempo real é o do
  // processador. Quem chamou precisa saber para não continuar mostrando uma
  // conta otimista até o fim.
  if (carga && carga.dispositivo) aoProgredir('motor', 0, { dispositivo: carga.dispositivo });

  const entrada = paraCanvas(fonte);
  const saida = document.createElement('canvas');
  saida.width = entrada.width * 2;
  saida.height = entrada.height * 2;
  const ctxSaida = saida.getContext('2d');

  const colunas = Math.ceil(entrada.width / LADRILHO);
  const linhas = Math.ceil(entrada.height / LADRILHO);
  const total = colunas * linhas;
  let feitos = 0;

  aoProgredir('processando', 0, { feitos, total });

  for (let ly = 0; ly < linhas; ly++) {
    for (let lx = 0; lx < colunas; lx++) {
      if (deveParar()) throw new Error('cancelado');

      // Miolo que este ladrilho preenche.
      const mx = lx * LADRILHO;
      const my = ly * LADRILHO;
      const mw = Math.min(LADRILHO, entrada.width - mx);
      const mh = Math.min(LADRILHO, entrada.height - my);

      // Recorte maior, com margem, para o modelo ter contexto nas beiras.
      const rx = Math.max(0, mx - MARGEM);
      const ry = Math.max(0, my - MARGEM);
      const rw = Math.min(entrada.width, mx + mw + MARGEM) - rx;
      const rh = Math.min(entrada.height, my + mh + MARGEM) - ry;

      const pedaco = document.createElement('canvas');
      pedaco.width = rw;
      pedaco.height = rh;
      pedaco.getContext('2d').drawImage(entrada, rx, ry, rw, rh, 0, 0, rw, rh);

      const blob = await new Promise((r) => pedaco.toBlob(r, 'image/png'));

      const id = proximoId++;
      const pronto = await pedirAoTrabalhador({ tipo: 'ladrilho', id, blob }, id);

      const cv = document.createElement('canvas');
      cv.width = pronto.largura;
      cv.height = pronto.altura;
      cv.getContext('2d').putImageData(
        new ImageData(pronto.dados, pronto.largura, pronto.altura), 0, 0
      );

      // Descarta a margem e cola só o miolo: a margem existiu para dar contexto
      // ao modelo, não para aparecer no resultado.
      ctxSaida.drawImage(
        cv,
        (mx - rx) * 2, (my - ry) * 2, mw * 2, mh * 2,
        mx * 2, my * 2, mw * 2, mh * 2
      );

      feitos++;
      aoProgredir('processando', feitos / total, { feitos, total });
    }
  }

  aoProgredir('pronto', 1, { feitos, total });
  return saida;
}
