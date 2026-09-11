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

env.allowLocalModels = false;

const MODELO = 'Xenova/swin2SR-lightweight-x2-64';

let modelo = null;

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
        modelo = await pipeline('image-to-image', MODELO, {
          dtype: 'q8',
          progress_callback: (p) => {
            if (p && p.status === 'progress' && p.total) {
              self.postMessage({ tipo: 'baixando', fracao: p.loaded / p.total });
            }
          },
        });
      }
      self.postMessage({ tipo: 'carregado' });
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
