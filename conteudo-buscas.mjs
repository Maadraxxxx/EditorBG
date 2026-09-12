/**
 * O TEXTO das páginas de busca. Uma entrada por tarefa que as pessoas procuram.
 *
 * POR QUE O TEXTO MORA AQUI E NÃO NO GERADOR: página feita só para ranquear, com
 * o mesmo texto trocando duas palavras, é o que o Google chama de doorway page e
 * penaliza — e merece penalizar, porque não ajuda ninguém. Cada entrada abaixo
 * responde de verdade à dúvida de quem digitou aquilo, com o que é específico
 * daquela tarefa: o que se perde, o que não dá para fazer, o que costuma dar
 * errado. Se uma entrada puder ser trocada pela outra sem alguém notar, ela não
 * deveria existir.
 *
 * Cada página aponta para a ferramenta real por link direto, então quem chega
 * pela busca já cai no lugar de fazer, não numa página de propaganda.
 */
export const BUSCAS = [
  {
    arquivo: 'juntar-pdf',
    ferramenta: '/pdf#juntar',
    titulo: 'Juntar PDF online grátis — sem enviar arquivo para servidor',
    h1: 'Juntar PDF',
    resumo: 'Une vários PDFs num arquivo só, na ordem que você escolher. '
      + 'Acontece dentro do seu navegador: os arquivos não sobem para servidor nenhum.',
    descricao: 'Junte vários PDFs num arquivo só, direto no navegador. Arraste para '
      + 'ordenar, junte quantos quiser e baixe na hora. Nada é enviado para servidores.',
    passos: [
      'Arraste os PDFs para a página, ou segure Ctrl e escolha vários de uma vez.',
      'Arraste os nomes na lista para colocar na ordem em que devem aparecer.',
      'Clique em juntar e baixe o arquivo único.',
    ],
    corpo: [
      ['A ordem da lista é a ordem do documento',
        'É o detalhe que mais gera retrabalho: a maioria das ferramentas junta na '
        + 'ordem em que os arquivos foram selecionados, que é a ordem alfabética do '
        + 'sistema — e aí "anexo-10.pdf" entra antes de "anexo-2.pdf". Aqui a lista '
        + 'aparece na tela antes de juntar, e você arrasta os nomes até ficar certo.'],
      ['Documento protegido',
        'PDF apenas marcado como somente leitura — o caso da maioria das notas '
        + 'fiscais e extratos bancários — é juntado normalmente. PDF que exige senha '
        + 'para abrir precisa ser aberto antes, na ferramenta de desbloquear, e para '
        + 'isso você precisa saber a senha.'],
    ],
    faq: [
      ['Existe limite de quantos arquivos?',
        'Não impomos limite. O limite é a memória do seu aparelho, porque a junção '
        + 'acontece nele e não num servidor. Dezenas de PDFs comuns funcionam sem '
        + 'problema; centenas de arquivos digitalizados pesados podem ficar lentos '
        + 'num computador antigo.'],
      ['O arquivo perde qualidade ao juntar?',
        'Não. As páginas são copiadas como estão, sem recompressão. O arquivo final '
        + 'tem praticamente a soma do tamanho dos originais.'],
      ['Meus arquivos são enviados para algum lugar?',
        'Não. A junção acontece dentro do seu navegador. Depois que a página '
        + 'carregou, você pode desligar a internet e ela continua funcionando.'],
    ],
  },

  {
    arquivo: 'dividir-pdf',
    ferramenta: '/pdf#dividir',
    titulo: 'Dividir PDF online grátis — separar páginas sem enviar para servidor',
    h1: 'Dividir PDF',
    resumo: 'Separa cada página num arquivo, ou extrai só as páginas que você quiser. '
      + 'Tudo dentro do navegador, sem subir o documento para lugar nenhum.',
    descricao: 'Divida um PDF em vários arquivos ou extraia só um intervalo de '
      + 'páginas. Direto no navegador, sem enviar o documento para servidores.',
    passos: [
      'Escolha o PDF que quer separar.',
      'Decida entre uma página por arquivo ou só um intervalo, como 1-3, 7.',
      'Baixe: um arquivo só, ou todos num .zip.',
    ],
    corpo: [
      ['Extrair um intervalo é diferente de separar tudo',
        'São duas necessidades que costumam ser confundidas. "Separar tudo" serve '
        + 'para quem digitalizou um maço de papéis de uma vez e precisa de um arquivo '
        + 'por documento. "Extrair intervalo" serve para quem tem um contrato de '
        + 'quarenta páginas e precisa mandar só as três da assinatura. As duas estão '
        + 'na mesma ferramenta, na primeira opção da tela.'],
      ['Como escrever o intervalo',
        'Aceita o que você escreveria no papel: 1-3, 7, 10-12. Vírgula ou ponto e '
        + 'vírgula separam, traço indica faixa. Número fora do documento é ignorado '
        + 'em vez de invalidar a linha inteira — uma vírgula sobrando no fim não '
        + 'estraga nada.'],
    ],
    faq: [
      ['Vários arquivos baixam de uma vez?',
        'Saem juntos num .zip. Baixar trinta arquivos seguidos faz o navegador '
        + 'bloquear a partir do segundo, e a pessoa fica sem entender o que aconteceu '
        + 'com o resto.'],
      ['Dá para dividir sempre a cada X páginas?',
        'Hoje não automaticamente. Dá para extrair o intervalo que quiser, quantas '
        + 'vezes precisar, e cada extração sai num arquivo.'],
      ['O original é alterado?',
        'Nunca. O arquivo que você escolheu continua igual no seu computador — o que '
        + 'sai é sempre um arquivo novo.'],
    ],
  },

  {
    arquivo: 'comprimir-pdf',
    ferramenta: '/pdf#comprimir',
    titulo: 'Comprimir PDF online grátis — reduzir tamanho no navegador',
    h1: 'Comprimir PDF',
    resumo: 'Reduz o tamanho do arquivo redesenhando as páginas como imagem. '
      + 'Funciona no navegador, sem enviar o documento para servidor.',
    descricao: 'Reduza o tamanho de um PDF para caber em anexo de e-mail ou upload. '
      + 'Direto no navegador, sem enviar o documento para servidores.',
    passos: [
      'Escolha o PDF pesado.',
      'Escolha quanto reduzir: mais compressão significa página menos nítida.',
      'Compare o antes e o depois na mensagem e baixe.',
    ],
    corpo: [
      ['O que a compressão custa, em linguagem clara',
        'A compressão redesenha cada página como imagem. Num documento digitalizado '
        + '— que já era imagem — a troca é ótima: o arquivo encolhe bastante e nada '
        + 'de útil se perde. Num contrato com texto de verdade, a troca é ruim: o '
        + 'texto deixa de ser texto, e não dá mais para pesquisar, copiar nem '
        + 'selecionar. Vale saber disso antes, não depois.'],
      ['Quando o arquivo não encolhe',
        'Um PDF que já é só texto costuma FICAR MAIOR ao ser comprimido, porque '
        + 'texto ocupa menos que a imagem daquele texto. Nesse caso a ferramenta não '
        + 'entrega nada e diz o porquê, em vez de te dar um arquivo pior junto com um '
        + 'aviso para não usá-lo.'],
    ],
    faq: [
      ['Quanto o arquivo diminui?',
        'Depende inteiramente do que tem dentro. Documento digitalizado costuma cair '
        + 'de 50% a 90%. PDF gerado a partir do Word, que já é leve, pode não cair '
        + 'nada — e a ferramenta avisa quando é esse o caso.'],
      ['Dá para comprimir vários de uma vez?',
        'Sim, com o VIP: a ferramenta aceita a pasta inteira e devolve tudo num .zip. '
        + 'Sem o VIP, um arquivo de cada vez.'],
      ['O texto continua pesquisável depois?',
        'Não. É o custo dessa técnica. Se você precisa manter a busca, não comprima — '
        + 'ou comprima uma cópia e guarde o original.'],
    ],
  },

  {
    arquivo: 'pdf-para-word',
    ferramenta: '/pdf#para-word',
    titulo: 'PDF para Word online grátis — converter em .docx editável',
    h1: 'PDF para Word',
    resumo: 'Gera um .docx editável de verdade, com títulos, parágrafos e listas. '
      + 'A conversão acontece no navegador: o documento não sai do seu computador.',
    descricao: 'Converta PDF em Word (.docx) editável, com títulos e listas '
      + 'reconhecidos. Direto no navegador, sem enviar o documento para servidores.',
    passos: [
      'Escolha o PDF.',
      'Clique em converter e espere alguns segundos.',
      'Abra o .docx no Word, no LibreOffice ou no Google Docs e edite.',
    ],
    corpo: [
      ['O que esperar, com honestidade',
        'Um PDF guarda letras soltas com a posição de cada uma na folha. Ele não '
        + 'guarda parágrafos, tabelas nem colunas — essas coisas são DEDUZIDAS na '
        + 'conversão: título é reconhecido porque está escrito maior que o resto do '
        + 'texto. O que sai é um documento editável de verdade, não uma foto da '
        + 'página dentro do Word. O que não sobrevive é o layout milimétrico: '
        + 'margens exatas, posição de imagem e desenho de tabela se perdem, porque '
        + 'essa informação nunca esteve no arquivo para ser recuperada.'],
      ['PDF digitalizado não vira Word direto',
        'Se o seu PDF é a foto de um papel, não existe texto nenhum lá dentro para '
        + 'converter — só pixels. Nesse caso passe antes pelo OCR, que lê o texto da '
        + 'imagem, e converta depois. A ferramenta avisa quando é esse o caso em vez '
        + 'de entregar um documento vazio.'],
    ],
    faq: [
      ['Por que o layout não ficou igual?',
        'Porque o PDF não guarda layout, guarda posições de letra. Qualquer conversor '
        + 'deduz o resto, e nenhum acerta sempre. Documento de texto corrido sai bem; '
        + 'folheto com colunas e caixas sai desmontado.'],
      ['Meu documento é enviado para algum servidor?',
        'Não, e essa é a diferença principal para as outras ferramentas. A conversão '
        + 'acontece dentro do seu navegador — o contrato, o holerite ou o laudo não '
        + 'passa pela máquina de ninguém.'],
      ['Funciona com PDF protegido?',
        'Com o que é apenas somente leitura, sim. Com o que exige senha para abrir, '
        + 'passe antes pela ferramenta de desbloquear, sabendo a senha.'],
    ],
  },

  {
    arquivo: 'word-para-pdf',
    ferramenta: '/pdf#de-word',
    titulo: 'Word para PDF online grátis — converter .docx sem enviar arquivo',
    h1: 'Word para PDF',
    resumo: 'Converte .docx em PDF mantendo o texto selecionável e pesquisável. '
      + 'Roda no navegador, sem subir o documento para servidor nenhum.',
    descricao: 'Converta documentos do Word (.docx) em PDF direto no navegador, com '
      + 'o texto continuando selecionável. Nada é enviado para servidores.',
    passos: [
      'Escolha o arquivo .docx.',
      'Clique em converter.',
      'Baixe o PDF e confira antes de enviar.',
    ],
    corpo: [
      ['O texto continua texto',
        'A conversão não fotografa o documento: o texto entra no PDF como texto, '
        + 'então continua dando para buscar com Ctrl+F, selecionar e copiar. Isso '
        + 'importa mais do que parece — currículo e contrato costumam ser lidos por '
        + 'sistemas que procuram palavras dentro do arquivo.'],
      ['O que não sobrevive',
        'Margens exatas, cabeçalho, rodapé e o posicionamento de imagem não são '
        + 'reproduzidos. O que se lê do .docx é o conteúdo e sua estrutura — títulos, '
        + 'parágrafos, listas, tabelas — não a página já montada como o Word a '
        + 'desenharia. Para documento que precisa sair idêntico ao original, o '
        + '"Salvar como PDF" do próprio Word continua sendo o melhor caminho.'],
    ],
    faq: [
      ['E arquivo .doc antigo?',
        'Só .docx, o formato do Word moderno. O .doc antigo tem estrutura '
        + 'completamente diferente. Abrir e salvar como .docx no Word resolve.'],
      ['Consigo converter vários currículos de uma vez?',
        'Sim, com o VIP: a ferramenta aceita vários .docx e devolve todos os PDFs '
        + 'num .zip.'],
      ['Precisa ter o Word instalado?',
        'Não. Nada é instalado e nada é enviado — a conversão acontece no navegador.'],
    ],
  },

  {
    arquivo: 'pdf-para-jpg',
    ferramenta: '/pdf#para-jpg',
    titulo: 'PDF para JPG online grátis — converter páginas em imagem',
    h1: 'PDF para JPG',
    resumo: 'Cada página do PDF vira uma imagem, na qualidade que você escolher. '
      + 'A conversão acontece no navegador, sem enviar o arquivo para servidor.',
    descricao: 'Transforme cada página de um PDF em JPG ou PNG, escolhendo a '
      + 'qualidade. Direto no navegador, sem enviar o arquivo para servidores.',
    passos: [
      'Escolha o PDF.',
      'Escolha JPG ou PNG e a qualidade — de tela até impressão.',
      'Baixe: uma página sai solta, várias saem num .zip.',
    ],
    corpo: [
      ['Qual qualidade escolher',
        'Para mandar no WhatsApp ou olhar na tela, a opção de tela basta e gera '
        + 'arquivos leves. Para imprimir ou ampliar, escolha alta ou impressão — os '
        + 'arquivos ficam bem maiores, e num PDF de muitas páginas isso demora. A '
        + 'diferença entre elas é a resolução em que a página é desenhada, não uma '
        + 'compressão depois.'],
      ['JPG ou PNG',
        'JPG gera arquivo bem menor e é o certo para página com foto. PNG guarda as '
        + 'linhas com mais fidelidade e é melhor para página com texto miúdo, '
        + 'desenho técnico ou tabela — onde o JPG cria sujeira em volta das letras.'],
    ],
    faq: [
      ['Sai uma imagem por página?',
        'Sim, numerada na ordem do documento. Mais de uma página sai num .zip para o '
        + 'navegador não bloquear os downloads.'],
      ['Dá para converter só algumas páginas?',
        'Extraia antes o intervalo na ferramenta de dividir, e converta o resultado.'],
      ['O fundo fica preto?',
        'Não. O PDF não tem fundo próprio, então a página é desenhada sobre branco '
        + 'antes de virar imagem — sem isso o JPG sairia com o fundo escuro.'],
    ],
  },

  {
    arquivo: 'assinar-pdf',
    ferramenta: '/pdf#assinar',
    titulo: 'Assinar PDF online grátis — desenhe e posicione sua assinatura',
    h1: 'Assinar PDF',
    resumo: 'Desenhe a assinatura na tela e arraste até o lugar certo da página. '
      + 'O documento não sai do seu computador em momento nenhum.',
    descricao: 'Assine um PDF desenhando a assinatura e arrastando até o lugar '
      + 'certo. Direto no navegador — o documento não é enviado para servidores.',
    passos: [
      'Escolha o PDF a assinar.',
      'Desenhe a assinatura no quadro branco, ou use a foto de uma assinatura no papel.',
      'Arraste até a linha certa, ajuste o tamanho e baixe.',
    ],
    corpo: [
      ['O que isto é, e o que não é',
        'Isto equivale a assinar à caneta e digitalizar. NÃO é assinatura digital com '
        + 'certificado ICP-Brasil e não tem a validade jurídica de uma. Para a maior '
        + 'parte do dia a dia — orçamento, recibo, autorização, formulário de escola — '
        + 'é exatamente o que se pede. Para escritura e documento com exigência legal '
        + 'de certificado, não serve, e é melhor saber agora.'],
      ['Por que a assinatura não entra num retângulo branco',
        'Assinatura fotografada costuma vir com o papel junto, e aí o retângulo branco '
        + 'tapa o texto do contrato embaixo. Aqui o fundo claro da foto é removido e a '
        + 'folga em volta é cortada, então só a tinta entra no documento. Quem desenha '
        + 'na tela já desenha com fundo transparente.'],
    ],
    faq: [
      ['Preciso redesenhar a assinatura em cada documento?',
        'Com o VIP não: ela fica guardada no seu navegador e volta pronta no próximo '
        + 'documento. A assinatura fica só no seu aparelho, nunca num servidor — é '
        + 'uma assinatura, mandá-la para algum lugar seria o oposto do que este site '
        + 'promete.'],
      ['Dá para assinar em todas as páginas?',
        'Sim, há uma opção para repetir a assinatura em todas as páginas do documento.'],
      ['Funciona no celular?',
        'Funciona, e no celular é até melhor: dá para assinar com o dedo, o que sai '
        + 'mais natural do que com o mouse.'],
    ],
  },

  {
    arquivo: 'proteger-pdf-com-senha',
    ferramenta: '/pdf#proteger',
    titulo: 'Proteger PDF com senha online grátis — criptografia AES-256',
    h1: 'Proteger PDF com senha',
    resumo: 'Tranca o arquivo com senha de verdade, em AES-256. A senha é criada '
      + 'no seu navegador e não passa por servidor nenhum.',
    descricao: 'Proteja um PDF com senha usando criptografia AES-256, direto no '
      + 'navegador. Nem o arquivo nem a senha são enviados para servidores.',
    passos: [
      'Escolha o PDF.',
      'Crie a senha e repita para confirmar.',
      'Baixe o arquivo protegido e guarde a senha em lugar seguro.',
    ],
    corpo: [
      ['AES-256, e por que isso importa',
        'Muita ferramenta ainda tranca PDF com RC4 de 40 bits, que programas de '
        + 'recuperação de senha quebram em minutos. Uma senha que não segura ninguém '
        + 'é pior do que nenhuma, porque passa uma sensação de proteção que não '
        + 'existe. Aqui a criptografia é AES-256, a mesma classe usada para proteger '
        + 'dado bancário.'],
      ['Senha de abrir, não só de restringir',
        'PDF aceita dois tipos de senha: a de dono, que só pede para o leitor não '
        + 'deixar imprimir — e qualquer leitor decente ignora — e a de usuário, que '
        + 'realmente exige a senha para o conteúdo ser lido. A mesma senha é gravada '
        + 'nos dois lugares, então o arquivo tranca de verdade.'],
    ],
    faq: [
      ['Vocês guardam minha senha?',
        'Não, e não temos como. A senha é usada dentro do seu navegador para cifrar o '
        + 'arquivo e nunca sai dali. Se você esquecer, o arquivo não abre mais — nem '
        + 'para você, nem para nós.'],
      ['Dá para tirar a senha depois?',
        'Dá, na ferramenta de desbloquear, informando a senha. O que não existe aqui '
        + 'é descobrir senha: sem ela o conteúdo é ilegível, e é assim que deve ser.'],
      ['O arquivo protegido abre em qualquer leitor?',
        'Sim. É criptografia padrão do formato PDF, entendida pelo Acrobat, pelo '
        + 'navegador, pelo celular e pelos leitores comuns.'],
    ],
  },
];
