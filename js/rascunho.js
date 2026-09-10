/**
 * Guarda a última imagem editada de quem tem conta, para ela poder continuar
 * de onde parou.
 *
 * FICA NO NAVEGADOR, NÃO NO SERVIDOR. Esta foi uma escolha, não uma limitação:
 * o site promete em três telas que as imagens não são enviadas para servidor
 * nenhum, e guardar o trabalho de alguém num bucket tornaria essas frases
 * falsas. O preço é que o rascunho não acompanha a pessoa entre aparelhos —
 * quem editar no computador não encontra o trabalho no celular.
 *
 * IndexedDB e não localStorage porque localStorage só guarda texto e estoura
 * em poucos megabytes; uma imagem de 3000px em PNG passa disso sozinha.
 *
 * Um rascunho por conta: o pedido era a ÚLTIMA imagem, então a nova
 * sobrescreve a anterior.
 */

const BANCO = 'editorbg';
const LOJA = 'rascunhos';
const VERSAO = 1;

/** Acima disso o rascunho é descartado em vez de gravado. */
const TETO_BYTES = 40 * 1024 * 1024;

let conexao = null;

function abrir() {
  if (conexao) return conexao;

  conexao = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sem IndexedDB'));

    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });

  // Uma falha não pode deixar a promessa recusada em cache para sempre.
  conexao.catch(() => { conexao = null; });
  return conexao;
}

function transacao(modo) {
  return abrir().then((db) => db.transaction(LOJA, modo).objectStore(LOJA));
}

function pedir(requisicao) {
  return new Promise((resolve, reject) => {
    requisicao.onsuccess = () => resolve(requisicao.result);
    requisicao.onerror = () => reject(requisicao.error);
  });
}

/* ------------------------------------------------------------------ *
 * Converter para algo que sobreviva ao fechar do navegador
 * ------------------------------------------------------------------ */
function paraCanvas(fonte) {
  const c = document.createElement('canvas');
  c.width = fonte.width;
  c.height = fonte.height;
  c.getContext('2d').drawImage(fonte, 0, 0);
  return c;
}

function paraBlob(fonte) {
  const canvas = fonte instanceof HTMLCanvasElement ? fonte : paraCanvas(fonte);
  // PNG sempre: a máscara e o recorte dependem de transparência exata, e JPEG
  // mexeria nos valores.
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Camadas de imagem carregam um ImageBitmap, que não atravessa o fechar da
 * aba de forma confiável. Viram blob na gravação e voltam a bitmap na leitura.
 */
async function guardarCamadas(layers) {
  const saida = [];
  for (const l of layers || []) {
    if (l.tipo === 'imagem' && l.bitmap) {
      const { bitmap, ...resto } = l;
      saida.push({ ...resto, blob: await paraBlob(bitmap) });
    } else {
      saida.push({ ...l });
    }
  }
  return saida;
}

async function lerCamadas(layers) {
  const saida = [];
  for (const l of layers || []) {
    if (l.tipo === 'imagem' && l.blob) {
      const { blob, ...resto } = l;
      saida.push({ ...resto, bitmap: await createImageBitmap(blob) });
    } else {
      saida.push({ ...l });
    }
  }
  return saida;
}

/* ------------------------------------------------------------------ *
 * Guardar, ler, apagar
 * ------------------------------------------------------------------ */

/** @param {string} conta id da conta  @param {object} item {name, bitmap, maskCanvas, edit} */
export async function guardar(conta, item) {
  if (!conta || !item || !item.bitmap) return false;

  try {
    const imagem = await paraBlob(item.bitmap);
    const mascara = item.maskCanvas ? await paraBlob(item.maskCanvas) : null;
    const camadas = await guardarCamadas(item.edit && item.edit.layers);

    const tamanho = imagem.size + (mascara ? mascara.size : 0)
      + camadas.reduce((t, l) => t + (l.blob ? l.blob.size : 0), 0);

    if (tamanho > TETO_BYTES) {
      console.warn('Rascunho grande demais para guardar:', Math.round(tamanho / 1e6) + ' MB');
      return false;
    }

    const registro = {
      nome: item.name || 'imagem',
      quando: Date.now(),
      largura: item.bitmap.width,
      altura: item.bitmap.height,
      imagem,
      mascara,
      edit: { ...(item.edit || {}), layers: camadas },
    };

    const loja = await transacao('readwrite');
    await pedir(loja.put(registro, conta));
    return true;
  } catch (err) {
    // Aba anônima, cota cheia, banco bloqueado: nada disso justifica atrapalhar
    // quem está editando.
    console.warn('Não deu para guardar o rascunho:', err.message);
    return false;
  }
}

/** Só o cabeçalho: nome, data e tamanho, para montar o convite sem decodificar nada. */
export async function resumo(conta) {
  if (!conta) return null;
  try {
    const loja = await transacao('readonly');
    const r = await pedir(loja.get(conta));
    if (!r) return null;
    return { nome: r.nome, quando: r.quando, largura: r.largura, altura: r.altura };
  } catch {
    return null;
  }
}

/** O rascunho inteiro, já pronto para voltar ao editor. */
export async function ler(conta) {
  if (!conta) return null;
  try {
    const loja = await transacao('readonly');
    const r = await pedir(loja.get(conta));
    if (!r || !r.imagem) return null;

    const bitmap = await createImageBitmap(r.imagem);

    let maskCanvas;
    if (r.mascara) {
      maskCanvas = paraCanvas(await createImageBitmap(r.mascara));
    } else {
      // Sem máscara guardada, nasce opaca: a imagem inteira aparece.
      maskCanvas = document.createElement('canvas');
      maskCanvas.width = bitmap.width;
      maskCanvas.height = bitmap.height;
      const ctx = maskCanvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    return {
      name: r.nome,
      quando: r.quando,
      bitmap,
      maskCanvas,
      edit: { ...r.edit, layers: await lerCamadas(r.edit && r.edit.layers) },
    };
  } catch (err) {
    console.warn('Não deu para ler o rascunho:', err.message);
    return null;
  }
}

export async function apagar(conta) {
  if (!conta) return;
  try {
    const loja = await transacao('readwrite');
    await pedir(loja.delete(conta));
  } catch { /* já não estava lá */ }
}
