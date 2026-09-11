/**
 * O modelo de tradução, rodando fora da thread principal.
 *
 * POR QUE ISTO EXISTE: carregar 107 MB de modelo e rodar a inferência são
 * trabalho síncrono e pesado. Na thread principal eles congelam a página
 * inteira — nada de rolagem, nada de clique, e a barra de progresso nem se
 * redesenha. Quem está olhando vê uma tela travada e um modelo que "nunca
 * carrega", quando na verdade ele está carregando e a página é que não
 * consegue mostrar isso.
 *
 * É exatamente o mesmo motivo do melhorar-worker.js, e a mesma solução: aqui
 * dentro o trabalho pesado acontece numa thread só dele, e a página continua
 * respondendo o tempo todo.
 */
import {
  pipeline,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;

/**
 * Traduz de vários idiomas PARA O INGLÊS, em 107 MB.
 *
 * O modelo que traduz para qualquer idioma pesa 603 MB e não fica guardado no
 * cache do navegador — seriam 603 MB a cada uso. Este cabe, fica, e entrega o
 * que promete.
 */
const MODELO = 'Xenova/opus-mt-mul-en';

let modelo = null;

self.onmessage = async (e) => {
  const msg = e.data || {};

  try {
    if (msg.tipo === 'carregar') {
      if (!modelo) {
        modelo = await pipeline('translation', MODELO, {
          // Processador e não placa de vídeo: o caminho da GPU não terminou de
          // carregar em nenhum teste. Entre um caminho medido e funcionando e
          // outro que talvez seja mais rápido mas trava, vale o que funciona.
          device: 'wasm',
          dtype: 'q8',
          progress_callback: (p) => {
            if (p && p.status === 'progress' && p.total) {
              self.postMessage({ tipo: 'baixando', fracao: p.loaded / p.total, arquivo: p.file });
            }
          },
        });
      }
      self.postMessage({ tipo: 'carregado' });
      return;
    }

    if (msg.tipo === 'traduzir') {
      // Frase a frase: o modelo tem teto de entrada curto, e um parágrafo
      // inteiro sai truncado no meio sem aviso nenhum.
      const saida = [];
      for (const frase of msg.frases) {
        const r = await modelo(frase);
        saida.push((r[0] && r[0].translation_text) || '');
      }
      self.postMessage({ tipo: 'traduzido', id: msg.id, texto: saida.join(' ') });
      return;
    }
  } catch (erro) {
    self.postMessage({ tipo: 'erro', id: msg.id, mensagem: String(erro && erro.message ? erro.message : erro) });
  }
};
