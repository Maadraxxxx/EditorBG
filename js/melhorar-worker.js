/**
 * O modelo de super-resolução, rodando fora da thread principal.
 *
 * POR QUE ISTO EXISTE: a inferência é trabalho de CPU puro e síncrono. Na
 * thread principal ela congela a página inteira enquanto roda — nada de
 * rolagem, nada de clique, nem a barra de progresso se redesenha. E não é
 * pouco tempo: cada ladrilho leva alguns segundos.
 *
 * Ceder o controle ENTRE ladrilhos, que foi a primeira tentativa, não resolve.
 * O congelamento acontece DURANTE cada um, e a pausa entre eles só dá ao
 * navegador um respiro curto demais para parecer que a página está viva.
 *
 * Aqui dentro, o trabalho pesado acontece numa thread só dele e a página
 * continua respondendo o tempo todo.
 */
import {
  pipeline,
  RawImage,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
import { PRECISAO_GPU } from './limites.js';

env.allowLocalModels = false;

const MODELO = 'Xenova/swin2SR-lightweight-x2-64';

let modelo = null;
let dispositivo = null;   // 'webgpu' ou 'wasm', decidido no carregamento

/**
 * `navigator.gpu` existir não garante WebGPU: em muitos PCs o adapter não é
 * concedido. Só uma requisição real responde isso. Mesma checagem do
 * segment.js — a decisão precisa ser tomada aqui dentro porque o worker tem
 * o próprio `navigator`.
 */
async function temGpu() {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    return !!(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** O modelo devolve 3 canais; o canvas quer 4. */
function paraRGBA(img) {
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

self.onmessage = async (e) => {
  const msg = e.data || {};

  try {
    if (msg.tipo === 'carregar') {
      if (!modelo) {
        const aviso = (p) => {
          if (p && p.status === 'progress' && p.total) {
            self.postMessage({ tipo: 'baixando', fracao: p.loaded / p.total });
          }
        };

        // A placa de vídeo faz o mesmo ladrilho em cerca de um terço do tempo
        // do processador: medido nesta máquina, 11,8 s no CPU contra 4,0 s na
        // GPU, por ladrilho de 192px. Sem pedir a GPU, mesmo quem tem uma
        // esperava o triplo à toa — que é a maior parte da lentidão em
        // computador fraco que ainda dá para resolver dentro do navegador.
        if (await temGpu()) {
          try {
            modelo = await pipeline('image-to-image', MODELO, {
              device: 'webgpu', dtype: PRECISAO_GPU, progress_callback: aviso,
            });
            dispositivo = 'webgpu';
          } catch (e) {
            // GPU reconhecida mas incapaz de rodar o modelo (driver antigo,
            // pouca memória de vídeo). Cair no processador é lento, mas é
            // melhor do que a ferramenta simplesmente não funcionar.
            modelo = null;
          }
        }

        if (!modelo) {
          modelo = await pipeline('image-to-image', MODELO, {
            device: 'wasm', dtype: 'q8', progress_callback: aviso,
          });
          dispositivo = 'wasm';
        }
      }
      self.postMessage({ tipo: 'carregado', dispositivo });
      return;
    }

    if (msg.tipo === 'ladrilho') {
      const entrada = await RawImage.fromBlob(msg.blob);
      const saida = await modelo(entrada);
      const dados = paraRGBA(saida);

      // Transfere o buffer em vez de copiar: são alguns megabytes por ladrilho,
      // e copiar isso a cada pedaço apareceria no tempo total.
      self.postMessage(
        { tipo: 'ladrilho-pronto', id: msg.id, largura: saida.width, altura: saida.height, dados },
        [dados.buffer]
      );
      return;
    }
  } catch (err) {
    self.postMessage({ tipo: 'erro', id: msg.id, mensagem: err.message });
  }
};
