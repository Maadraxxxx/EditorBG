/**
 * O conteúdo dos QR Codes.
 *
 * Um QR Code é só um texto desenhado em quadradinhos. O que decide se ele
 * funciona é o FORMATO desse texto: o celular lê "WIFI:..." e oferece conectar,
 * lê "BEGIN:VCARD" e oferece salvar o contato, e o aplicativo do banco lê o
 * código do PIX e abre o pagamento. Escrever o texto errado gera um QR que
 * abre como texto solto e não faz nada — por isso cada formato está aqui, e
 * não solto na tela.
 */

/** O que precisa de escape em cada formato, porque ninguém digita pensando nisso. */
const escaparWifi = (t) => String(t).replace(/([\\;,:"])/g, '\\$1');
const escaparVcard = (t) => String(t).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

export function paraLink(url) {
  const limpo = String(url || '').trim();
  if (!limpo) throw new Error('Escreva o endereço do site.');
  // Sem "https://" na frente, muito leitor trata como texto e não abre nada.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(limpo)) return 'https://' + limpo;
  return limpo;
}

export function paraTexto(texto) {
  const limpo = String(texto || '').trim();
  if (!limpo) throw new Error('Escreva o texto.');
  return limpo;
}

export function paraWifi({ rede, senha, seguranca, oculta }) {
  const nome = String(rede || '').trim();
  if (!nome) throw new Error('Escreva o nome da rede.');

  const tipo = seguranca === 'aberta' ? 'nopass' : seguranca === 'wep' ? 'WEP' : 'WPA';
  if (tipo !== 'nopass' && !String(senha || '').trim()) {
    throw new Error('Escreva a senha da rede, ou marque que ela é aberta.');
  }

  return 'WIFI:T:' + tipo
    + ';S:' + escaparWifi(nome)
    + ';P:' + (tipo === 'nopass' ? '' : escaparWifi(senha))
    + (oculta ? ';H:true' : '')
    + ';;';
}

export function paraContato({ nome, telefone, email, empresa, site }) {
  const n = String(nome || '').trim();
  if (!n) throw new Error('Escreva o nome do contato.');

  const linhas = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + escaparVcard(n), 'FN:' + escaparVcard(n)];
  if (empresa) linhas.push('ORG:' + escaparVcard(empresa));
  if (telefone) linhas.push('TEL;TYPE=CELL:' + String(telefone).replace(/[^\d+]/g, ''));
  if (email) linhas.push('EMAIL:' + String(email).trim());
  if (site) linhas.push('URL:' + paraLink(site));
  linhas.push('END:VCARD');
  return linhas.join('\n');
}

/* ------------------------------------------------------------------ *
 * PIX
 * ------------------------------------------------------------------ */

/**
 * O dígito verificador do código PIX, no padrão CRC-16/CCITT-FALSE.
 *
 * ISTO NÃO É DETALHE: o aplicativo do banco confere estes quatro caracteres
 * antes de qualquer outra coisa. Errou o cálculo, o código é recusado sem
 * explicação nenhuma — o usuário só vê "QR Code inválido" e não tem como saber
 * o porquê. Os parâmetros (polinômio 0x1021, valor inicial 0xFFFF, sem inversão
 * na entrada nem na saída) são os da especificação do Banco Central, e estão
 * conferidos contra o vetor de teste padrão: "123456789" tem que dar 0x29B1.
 */
export function crc16(texto) {
  let crc = 0xFFFF;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Cada campo do código é "id + tamanho com dois dígitos + conteúdo". */
const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

/**
 * Tira acento e o que não for aceito.
 *
 * O padrão do PIX trabalha em caracteres simples. "João" com o til passa por
 * alguns bancos e trava em outros — e o problema aparece só na hora do
 * pagamento, na mão de quem ia pagar.
 */
const simplificar = (t, limite) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 .-]/g, '')
  .trim()
  .slice(0, limite)
  .toUpperCase();

/**
 * Monta o código "copia e cola" do PIX.
 *
 * O valor é opcional de propósito: sem ele, quem paga digita quanto vai pagar,
 * que é o que se quer numa placa fixa no balcão. Com ele, o valor já vem
 * travado, que é o que se quer numa cobrança específica.
 */
export function paraPix({ chave, nome, cidade, valor, descricao }) {
  const k = String(chave || '').trim();
  if (!k) throw new Error('Escreva a chave PIX.');

  const n = simplificar(nome, 25);
  if (!n) throw new Error('Escreva o nome de quem recebe.');

  const c = simplificar(cidade, 15);
  if (!c) throw new Error('Escreva a cidade de quem recebe.');

  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', k)
    + (descricao ? campo('02', simplificar(descricao, 40)) : '');

  let payload = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')      // categoria do comércio: não usada
    + campo('53', '986');      // real brasileiro

  const v = Number(String(valor || '').replace(',', '.'));
  if (v > 0) payload += campo('54', v.toFixed(2));

  payload += campo('58', 'BR') + campo('59', n) + campo('60', c);
  payload += campo('62', campo('05', '***'));   // identificador livre

  // O "6304" entra ANTES do cálculo: o dígito é calculado sobre o texto que já
  // contém o cabeçalho do próprio campo.
  const comCabecalho = payload + '6304';
  return comCabecalho + crc16(comCabecalho);
}
