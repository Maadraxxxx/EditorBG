# EditorBG ✂

Site que **reconhece o objeto principal da imagem e remove o fundo automaticamente**, usando IA que roda
**100% dentro do navegador**. Nenhuma imagem é enviada para servidor nenhum.

## Páginas

| Página | O que faz |
|---|---|
| `index.html` | Início, com os dois cards de entrada |
| `remover-fundo.html` | Remoção de fundo com IA + editor |
| `editar.html` | Editor puro: recorte, tamanho, cores e posição, sem passar pela IA |

As duas páginas usam o mesmo editor, mas com fluxos diferentes:

- **Remover fundo** é uma galeria: várias imagens em fila, cada uma com seu card, e o editor abre por cima
  quando você clica em *Editar*.
- **Editar imagem** é o editor em tela cheia. A imagem entra por um cartão no centro da mesa de trabalho —
  sem tela intermediária de upload — e sai pelo botão **Baixar PNG**, que não fecha o editor. *Trocar
  imagem* volta ao estado vazio. Como não há IA, a máscara nasce opaca e o pincel funciona como borracha.

O markup do editor mora em `partials/editor.html` e é injetado em tempo de execução, para não duplicar
170 linhas de HTML entre as páginas.

## Como rodar

Clique duas vezes em **`start.bat`** — ele sobe um servidor local e abre o site em `http://localhost:5180`.

Ou pelo terminal, dentro da pasta do projeto:

```bash
python serve.py 5180
```

O `serve.py` manda `Cache-Control: no-store` em tudo. Com o `python -m http.server` o navegador guarda
os módulos JS por conta própria e você acaba vendo a versão antiga depois de editar um arquivo.

> ⚠️ Não abra o `index.html` com duplo clique. O navegador bloqueia módulos JavaScript em `file://`,
> então o site **precisa** ser servido por HTTP (o `start.bat` já resolve isso).

## Como funciona

| Peça | Papel |
|---|---|
| Rede neural de segmentação | Recebe a imagem em 1024×1024 e devolve uma máscara de transparência. Três modelos disponíveis (abaixo). |
| [`transformers.js`](https://github.com/huggingface/transformers.js) | Roda o modelo ONNX no navegador, via **WebGPU** (placa de vídeo) com fallback automático para **WASM** (CPU). |
| Canvas API | Aplica a máscara como canal alpha da imagem original, em resolução cheia, e compõe o fundo escolhido. |

O modelo é baixado **uma única vez** e fica em cache no navegador. Da segunda visita em diante o site
abre instantaneamente e funciona até offline.

## Qualidade do recorte

### Modelos

Escolhidos na seção **Modelo de IA**, que fica visível desde o início — dá para configurar antes de enviar
qualquer imagem.

| Modelo | Quando usar | Tamanho |
|---|---|---|
| **Padrão** — [`briaai/RMBG-1.4`](https://huggingface.co/briaai/RMBG-1.4) | Uso geral. | ~44 MB |
| **Detalhes finos** — [`ISNet`](https://huggingface.co/onnx-community/ISNet-ONNX) | Alternativa treinada em outro conjunto (DIS5K). Vale tentar quando o Padrão erra. | ~44 MB |

Ambos rodam em WebGPU quando disponível, com fallback automático para CPU.

O botão **↻** em cada card reprocessa aquela imagem com o modelo selecionado, sem precisar enviá-la de novo.
Serve para comparar modelos na mesma foto. As edições de enquadramento e cor são mantidas; as pinceladas
na máscara não, já que a máscara é o que está sendo refeito.

### Segunda passada em alta resolução

O modelo sempre reduz a entrada para 1024×1024. Se o objeto ocupa só um quarto da foto, ele chega à rede
com um quarto da resolução — e detalhes finos se perdem.

Com o interruptor ligado, o app roda o modelo duas vezes: a primeira localiza o objeto, a segunda roda só no
recorte em volta dele (com 15% de margem, para não perder nada que a primeira passada tenha cortado).
O objeto chega à rede muito maior, e o detalhe melhora.

Medido num teste sintético com hastes de 4px e objeto ocupando ~10% do quadro:

| | IoU | Fundo que sobrou | Tempo (CPU) |
|---|---|---|---|
| 1 passada | 96,67% | 0,172% | 14,0 s |
| 2 passadas | **98,41%** | **0,081%** | 24,6 s |

O erro cai pela metade. A segunda passada é pulada automaticamente quando o objeto já preenche mais de
60% do quadro, porque aí ela não acrescentaria nada.

## Recursos

- Arrastar e soltar, colar com `Ctrl+V` ou selecionar arquivos
- Várias imagens de uma vez (processadas em fila)
- Fundo transparente, branco, preto, azul, verde ou cor personalizada
- Ajuste de suavização de borda (0–6px)
- Comparação antes/depois arrastando direto na miniatura (duplo clique volta ao resultado), ou em tela cheia pelo ícone de olho
- Download individual em PNG ou todas em `.zip`
- Trocar o fundo **não** reprocessa a IA — a máscara fica guardada, a recomposição é instantânea

## Editor

O botão **✏ Editar** fica no rodapé de cada card, sempre visível (fora da imagem, para não tapar nada).

| Aba | O que faz |
|---|---|
| **Pincel** | Corrige o que a IA errou. *Apagar fundo* remove o que sobrou; *Trazer de volta* recupera pedaços que foram removidos por engano. Tamanho e dureza da borda ajustáveis, com opção de ver a máscara em vermelho. |
| **Ajustes** | 13 controles de revelação: balanço de brancos, iluminação, cor e textura (abaixo). |
| **Recortar** | Moldura com 8 alças e grade de terços, proporções fixas (1:1, 3:4, 4:3, 16:9, 9:16) ou livre, **Cortar rente ao objeto** e o **tamanho da imagem em pixels**. |
| **Texto** | Caixas de texto com fonte, tamanho, cor, contorno, alinhamento e peso. |
| **Elementos** | 8 formas (retângulo, arredondado, círculo, triângulo, estrela, coração, linha, seta) com cor, contorno e arredondamento. |
| **Uploads** | Outras imagens como camada sobre a foto; as enviadas ficam na barra para reusar. |
| **Posição** | Rotação livre (−180° a 180°), giro de 90° e espelhamento horizontal/vertical. |

### Camadas

Texto, formas e imagens ficam **por cima** da foto, em [js/layers.js](js/layers.js). Clique para
selecionar, arraste para mover, use as alças dos cantos para redimensionar e a alça de cima para girar
(com `Shift` a rotação trava de 15 em 15 graus). O bloco no rodapé da barra controla opacidade, ordem,
duplicação e **Excluir camada** — a tecla `Delete` faz o mesmo, exceto enquanto se digita num campo.

Em **Uploads**, as imagens enviadas ficam como miniaturas para reusar. O `×` sobre a miniatura tira o
atalho da lista, sem mexer nas camadas já colocadas na foto.

Cada camada guarda sua posição em **coordenadas da imagem original**, as mesmas da máscara. Por isso
recorte, rotação e redimensionamento se aplicam a elas automaticamente — girar a foto 90° leva o texto
junto, sem código extra.

As camadas são desenhadas **depois** do recorte da máscara. Se fossem antes, o `destination-in` apagaria
tudo que estivesse fora do objeto, incluindo um texto sobre o fundo transparente.

### Ajustes de imagem

Processamento pixel a pixel em [js/adjust.js](js/adjust.js) — os filtros do canvas (`ctx.filter`) só
entregam brilho, contraste e saturação, então o resto é matemática própria.

| Grupo | Controles |
|---|---|
| Balanço de brancos | Temperatura, Matiz |
| Iluminação | Brilho, Contraste, Destaques, Sombras, Brancos, Pretos |
| Cor | Vibração, Saturação, Inverter cores |
| Textura | Nitidez, Claridade, Vinheta |

Destaques e sombras usam máscaras de luminância com transição suave, para não criar emenda dura no
meio-tom. Vibração mede a saturação de cada pixel e mexe mais no que está sem cor, poupando o que já
está forte. Nitidez e claridade são máscaras de nitidez com raios diferentes (fino e largo), usando o
blur acelerado do canvas em vez de convolução em JavaScript.

O preview processa com teto de 1600px, que cai para 700px enquanto o slider está sendo arrastado e volta
ao sair — assim o arrasto responde na hora. O arquivo final sempre roda em resolução cheia (~0,5 s numa
foto de 900×650).

### Tamanho da imagem

Na aba **Recortar**, o bloco **Tamanho da imagem** define as dimensões em pixels do PNG que vai ser
salvo. Com **Manter proporção** ligado, digitar a largura calcula a altura sozinha; desligado, dá para
forçar qualquer medida (útil para um quadrado exato, ainda que estique a imagem).

O preview reflete o tamanho pedido: se você destravar a proporção e forçar uma medida, a imagem aparece
esticada na tela do jeito que vai sair no arquivo. O rodapé do painel mostra sempre as dimensões finais, e
**Redefinir tamanho** volta ao tamanho natural (ou ao do recorte, se houver um).

O reescalonamento acontece depois do recorte e antes do fundo, para uma cor de fundo cobrir o quadro
inteiro sem sobrar borda transparente.

### Zoom

A barra flutuante no rodapé do editor controla o zoom (20% a 800%): **−** afasta, **+** aproxima e clicar na
porcentagem volta a ajustar à tela. **Ctrl + roda do mouse** amplia no ponto sob o cursor; a roda sozinha
rola a imagem. Com zoom alto a área de trabalho ganha barras de rolagem para navegar pela foto.

Pincel, moldura e cursor continuam alinhados em qualquer zoom — as coordenadas da tela são convertidas de
volta para pixels da imagem original a cada evento.

`Ctrl+Z` desfaz (até 24 passos), **Restaurar tudo** volta à máscara original da IA e `Esc` cancela sem salvar.

O preview do editor trabalha na resolução da tela, então pincelar continua fluido mesmo numa foto de 3000px —
a resolução cheia só é reprocessada no **Aplicar**. As edições ficam guardadas por imagem: reabrir o editor
mantém recorte, rotação, ajustes e pinceladas.

## Estrutura

```
index.html        página inicial (dois cards)
remover-fundo.html  app de remoção de fundo
editar.html       app de edição pura
partials/editor.html  markup do editor, compartilhado
js/boot.js        injeta o editor e carrega o app (página de remover fundo)
js/editar.js      controla o editor em tela cheia (página de edição)
css/style.css     estilos
js/app.js         galeria, fila de processamento, downloads
js/segment.js     modelos de IA, carregamento e segunda passada
js/compose.js     pipeline de composição (máscara, ajustes, recorte, tamanho, fundo)
js/editor.js      editor: pincel, ajustes, recorte e posição
js/sliders.js     preenchimento em degradê dos sliders
serve.py          servidor local sem cache
start.bat         sobe o servidor e abre o navegador
.claude/          config de preview usada pelo Claude Code
```

## Publicar na internet

É um site estático — funciona em qualquer hospedagem grátis:

- **GitHub Pages**: suba a pasta num repositório e ative Pages nas Settings
- **Vercel / Netlify**: arraste a pasta na interface deles

Precisa ser **HTTPS** (todos os três já são) para o WebGPU ficar disponível.

## Limitações conhecidas

- Imagens acima de 3000px são reduzidas antes do processamento, para não estourar memória
- Cabelo muito fino e objetos transparentes (vidro, fumaça) podem ficar imperfeitos — é limitação do modelo
- No primeiro acesso o download do modelo depende da conexão

## Contas e plano VIP

| | Grátis | VIP |
|---|---|---|
| Resolução do download | 70% do original | original |
| Recorte | 1 passada | 2 passadas (IoU 96,67% → 98,41%) |
| Conta | não precisa | obrigatória |

O plano fica na coluna `vip` da tabela `perfis`, no Supabase, protegida por Row Level Security: o
navegador **lê** o próprio perfil, mas não escreve. Quem promove alguém a VIP é a função
[api/validar.js](api/validar.js), com a service role key, e só depois de confirmar o pagamento na API
do Mercado Pago. Sem isso, qualquer pessoa se promoveria pelo console do navegador.

### Verificação de segurança

O Supabase tem um verificador (`get_advisors`) que aponta brechas depois de qualquer mudança de schema.
Ele pegou uma que passou despercebida na primeira migração: a função `criar_perfil()` é `SECURITY
DEFINER` e o Postgres concede `EXECUTE` a todo mundo por padrão — o PostgREST então a expunha em
`/rest/v1/rpc/criar_perfil`. A migração `20260908050000` revoga esse acesso. Gatilhos não passam por
essa checagem, então o cadastro continua criando o perfil normalmente.

Vale rodar o verificador sempre que mexer no banco.

### Configuração

1. **Supabase** — as tabelas vivem em `supabase/migrations/` e são aplicadas com `supabase db push`.
   A URL e a chave `anon public` ficam em [js/conta.js](js/conta.js); essa chave é pública por design.
3. **Vercel** — publique o projeto (aí a pasta `api/` vira funções) e defina as variáveis:
   `MP_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` e `PRECO_VIP`.
   A **chave publica** do Mercado Pago vai em `MP_PUBLIC_KEY` no
   [js/licenca.js](js/licenca.js) -- ela e publica por design, roda no navegador.
4. **Mercado Pago** — em Suas integrações > Webhooks, aponte para `SEU_SITE/api/webhook-mp`
   e marque o evento de **pagamentos**.
5. Ajuste `PRECO` e `REDUCAO_GRATIS` em [js/licenca.js](js/licenca.js) a gosto.

Enquanto as chaves do Supabase estiverem vazias, o site funciona normalmente — sem botão de conta e
sempre no plano grátis.

### Fluxo da compra (Checkout Bricks)

1. Pessoa tenta usar um recurso VIP -> abre a tela do plano.
2. Sem conta, o botao vira **Entrar para assinar**.
3. Logada, **Assinar agora** carrega o SDK do Mercado Pago e monta o Payment Brick
   dentro do proprio modal. Cartao, debito e Pix, sem sair do site.
4. O Brick tokeniza o cartao no navegador e manda so o token para
   [api/pagar.js](api/pagar.js), que cria o pagamento via `POST /v1/payments`
   com `external_reference = id do usuario`.
5. **Cartao aprovado**: libera na hora. **Pix**: o pagamento nasce pendente e a
   tela mostra o QR e o copia-e-cola.
6. Quando o pagamento e aprovado, o Mercado Pago chama
   [api/webhook-mp.js](api/webhook-mp.js), que grava `vip = true` na conta certa.
7. O navegador repergunta o plano a cada 5s e libera sozinho quando aparece.

Dados de cartao **nunca** passam pelo nosso servidor -- o SDK tokeniza direto
com o Mercado Pago.

### Duas coisas que o servidor nao aceita do navegador

O `api/pagar.js` recebe o formulario do Brick, mas ignora dois campos dele:

- **o valor**, que vem de `PRECO_VIP` no servidor. Sem isso daria para editar
  `transaction_amount` no console e virar VIP por R$ 0,01.
- **quem esta comprando**, que sai do token da sessao do Supabase, nao de um
  campo do formulario.

### Seguranca do webhook

O conteudo da notificacao **nao** e levado a serio -- ela so avisa "olhe o pagamento X". Quem responde
se ele existe, se foi aprovado e de quem e somos nos, consultando a API do Mercado Pago com o nosso
token. Uma notificacao forjada nao libera nada.

### O limite deste bloqueio

Como todo o processamento acontece no navegador, **a imagem em alta resolução já existe na máquina de
quem usa**. O bloqueio é atrito, não segurança: segura a grande maioria, mas quem abrir o DevTools
contorna. A segunda passada também roda no navegador, então vale o mesmo. Travar de verdade exigiria
processar num servidor, o que custaria dinheiro e acabaria com a promessa de que a imagem nunca sai do
computador.

Já o **pagamento** é real: quem confirma é a API do Mercado Pago, e o `vip` só muda pelo servidor.

## Painel do administrador

Em `admin.html`, aberto pelo botão **Painel de controle** dentro do modal da
conta — que só aparece para quem tem o cargo.

Mostra visitantes (hoje, 7 dias, total), contas criadas, contas ativas nos
últimos 15 minutos, assinaturas pagas e faturamento (total e do mês). Embaixo,
a lista de contas com dois interruptores por linha: **VIP** e **admin**.

### Por que esconder o botão não é a proteção

Não é. Quem souber o endereço abre `admin.html` do mesmo jeito — e não consegue
arrancar um número dela. Toda informação do painel passa por `/api/admin`, que
antes de qualquer coisa:

1. valida o token da sessão no Supabase (quem é você);
2. lê `perfis.admin` **no banco**, com a service role key (o que você pode).

O cargo nunca vem do navegador. Some isso ao fato de `perfis` não ter nenhuma
política de UPDATE para o cliente, e ninguém se promove pelo console.

### Cortesia não é faturamento

VIP dado à mão pelo painel muda só o perfil. Ele **não** entra na tabela
`pagamentos`, que é de onde sai o valor faturado — senão o total mentiria.

### Como os visitantes são contados

Uma vez por dia por pessoa, não por recarregamento. A "pessoa" é um hash de
IP + navegador, calculado no servidor com a service key como sal. **O IP não é
gravado**: o site inteiro se apoia na promessa de que nada sai do computador de
quem usa, e um banco cheio de endereços de rede contradiria isso.

### Primeiro administrador

Não tem como se promover pela tela — a primeira promoção sai do banco:

```sql
update public.perfis set admin = true where email = 'seu@email.com';
```

Depois disso o painel se vira sozinho. Um admin não consegue tirar o próprio
cargo, para que o painel nunca fique sem ninguém que entre.

## Os três planos

Ficam em [js/planos.js](js/planos.js), importado pelo navegador **e** pelas
funções em `api/`:

| Plano | Preço | Duração |
|---|---|---|
| 1 mês | R$ 4,90 | 1 mês |
| 3 meses | R$ 12,90 | 3 meses |
| Vitalício | R$ 19,90 | não expira |

Um arquivo só, dos dois lados, de propósito. Com duas listas separadas, mudar
um preço em apenas um lugar faria a pessoa ver R$ 4,90 na tela e ser cobrada
outra coisa — o tipo de bug que só aparece depois de alguém pagar errado.

Isso não substitui a regra de sempre: **o navegador escolhe um plano, nunca um
preço**. `api/pagar.js` recebe o id e busca o valor na tabela dele. O Brick
manda `transaction_amount` no formulário e esse campo é ignorado.

### VIP com prazo

`perfis.vip` sozinho não responde mais se alguém tem acesso — ele continua
`true` depois do vencimento, porque nada roda de tempos em tempos para virar a
chave. Quem decide é `vip_ate`:

```
vip = true,  vip_ate = null        → vitalício
vip = true,  vip_ate > agora       → assinatura valendo
vip = true,  vip_ate <= agora      → venceu, sem acesso
```

A conta está em `vipAtivo()`, usada no navegador, e repetida em SQL dentro de
`resumo_admin()` para o painel não contar assinatura vencida como ativa.

### Duas regras que parecem detalhe

**Renovar soma.** Quem tem 3 meses e renova no segundo mês não perde o que
falta por ter renovado cedo — o tempo novo entra em cima do que resta.

**Vitalício nunca vira prazo.** Se quem já tem vitalício comprar um mensal por
engano, a validade não é mexida. Trocar "nunca expira" por "expira em 30 dias"
seria tirar algo que a pessoa já pagou.

### De qual plano foi um pagamento

O plano viaja em `metadata`, mas quem decide é o **valor pago**. Metadata é um
campo que acompanha o pagamento; o dinheiro que entrou é o pagamento. Se os
dois discordarem, vale o valor — entregar 3 meses para quem pagou R$ 4,90 seria
pior do que ignorar o campo.

### Cortesia

VIP ligado à mão pelo painel entra como `plano = 'cortesia'` e sem validade.
Não vence, e não soma no faturamento — só pagamento de verdade soma.

## Testes

Não precisam de banco, de chave nem de internet — o `fetch` é trocado por um
dublê. Rodam com o Node instalado:

```bash
node testes/planos.mjs && node testes/admin.mjs
```

`planos.mjs` cobre preço, validade, renovação, o pulo de calendário de 31/01 e
a recusa de um valor vindo do navegador. `admin.mjs` cobre quem entra e quem
não entra no painel.

## Endereços sem `.html`

`vercel.json` liga `cleanUrls`, então o site atende `editorbg.com.br/remover-fundo`
em vez de `.../remover-fundo.html`, e `/` em vez de `/index.html`. Os endereços
antigos continuam funcionando — a Vercel redireciona com 308, então link já
compartilhado não quebra.

O `serve.py` faz a mesma coisa na sua máquina. Sem isso, o site testado local e
o publicado seriam dois sites com regras de rota diferentes, e a diferença só
apareceria depois do deploy.

**Por que o `vercel.json` não tem comentários:** JSON não aceita, e a Vercel
valida o arquivo contra um schema. Uma chave inventada ali dentro reprova o
build inteiro — e build reprovado tira o site do ar. As explicações ficam aqui.

Duas coisas nele que não são óbvias:

- `functions.includeFiles` força `js/planos.js` a entrar no pacote das funções.
  Elas importam esse arquivo, que mora fora de `api/`; a Vercel rastreia import
  estático sozinha, mas o caminho do pagamento não é lugar para apostar nisso.
  Se o arquivo não subisse junto, a função quebraria no import e ninguém
  conseguiria pagar.
- `trailingSlash: false` evita que `/remover-fundo` e `/remover-fundo/` virem
  dois endereços com o mesmo conteúdo, o que confunde buscador.

## Cada módulo traz a própria tela

`js/conta-ui.js` injeta `partials/conta.html`; `js/paywall.js` injeta
`partials/paywall.html`. Quem importa o módulo ganha o markup junto, sem
precisar lembrar de colar nada no HTML da página.

Isso nasceu de um bug: "Conhecer o VIP" não fazia nada na home. O markup do
paywall morava dentro de `partials/editor.html`, e a home não carrega o editor
— então o modal não existia ali. Pior, o botão disparava um `CustomEvent` que
só era ouvido por `app.js` e `editar.js`, então mesmo com markup não haveria
quem respondesse.

Os dois eventos (`abrir-conta` e `mostrar-vip`) foram embora. Cada módulo chama
o outro por **import dinâmico** — nunca estático, porque os dois se chamam
mutuamente e um ciclo com `await` no topo travaria os dois.

A regra que sobra: se um botão precisa de uma tela, o módulo dele traz a tela.
Espalhar markup por páginas e ouvintes por arquivos é o que fazia o mesmo botão
funcionar em duas páginas e falhar em silêncio numa terceira.
