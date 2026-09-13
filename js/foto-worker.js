/**
 * O recorte da pessoa, rodando fora da thread principal.
 *
 * POR QUE ISTO EXISTE: carregar o modelo e rodar a inferência são trabalho
 * síncrono e demorado. Na thread principal eles congelam a página inteira — e
 * o detalhe que engana é que nem a barra de progresso se redesenha, então de
 * fora parece que o modelo nunca carregou, quando na verdade ele carregou e a
 * página é que não conseguiu mostrar.
 *
 * Aqui o `segment.js` é o mesmo módulo que a página de remover fundo usa. Ele
 * cria os canvas por um ajudante que devolve `OffscreenCanvas` quando não há
 * `document` — foi para isto que o ajudante existe. Duas cópias da mesma
 * lógica de recorte divergiriam na primeira correção feita só num lado.
 */
import { loadSegmenter, segmentImage } from './segment.js';

let pronto = null;

self.onmessage = async (e) => {
  const msg = e.data || {};

  try {
    if (msg.tipo === 'carregar') {
      if (!pronto) {
        pronto = await loadSegmenter(msg.modelo || 'padrao', {
          onProgress: (p) => {
            if (p && p.status === 'progress' && p.total) {
              self.postMessage({ tipo: 'baixando', fracao: p.loaded / p.total });
            }
          },
        });
      }
      self.postMessage({ tipo: 'carregado', dispositivo: pronto.device });
      return;
    }

    if (msg.tipo === 'recortar') {
      if (!pronto) throw new Error('O modelo ainda não carregou.');

      const mascara = await segmentImage(pronto.segmenter, msg.bitmap, {
        twoPass: true,
        onStatus: (texto) => self.postMessage({ tipo: 'andamento', texto }),
      });

      // A máscara sai como OffscreenCanvas aqui dentro. Vira ImageBitmap para
      // atravessar por transferência, sem cópia: são alguns megabytes.
      const bitmap = mascara.transferToImageBitmap
        ? mascara.transferToImageBitmap()
        : await createImageBitmap(mascara);

      self.postMessage({ tipo: 'recortado', id: msg.id, mascara: bitmap }, [bitmap]);
      return;
    }
  } catch (err) {
    self.postMessage({ tipo: 'erro', id: msg.id, mensagem: err.message });
  }
};
