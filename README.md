# Sinclair QL Emulator

## Contacto e respeito pela comunidade

> **Contactar o Autor: luis.luiscunha[at]gmail.com**
>
> **Direitos e pedidos de remoção de componentes ou conteúdos**
>
> Este projeto nasce da admiração pelo Sinclair QL e pela comunidade que mantém
> viva a sua história. Na sua preparação, procurou-se cumprir todos os requisitos
> legais e éticos aplicáveis, respeitando os direitos, as licenças e o trabalho
> dos autores e das entidades envolvidas.
>
> Se alguma pessoa ou empresa considerar que um componente ou conteúdo incluído
> viola os seus direitos, ou preferir que um elemento da sua autoria ou de que
> seja titular não faça parte do emulador, agradeço que me contacte, identificando
> o elemento e o motivo do pedido. Cada situação será apreciada com atenção,
> respeito e boa-fé; após essa apreciação, os elementos a que o pedido se refere
> serão removidos do projeto.
>
> **Luís Simões da Cunha · autor do emulador**
>
> Para escrever, substitua `[at]` por `@`. Obrigado por ajudar a preservar esta
> memória com respeito por quem a tornou possível.
>
> Na aplicação, escolha **Contactar o Autor**, junto dos créditos e licenças.

---

Emulador do Sinclair QL para o navegador, escrito em JavaScript e sem
dependências de execução.

Explore o SuperBASIC, escreva os seus próprios programas e redescubra software
clássico com duas unidades Microdrive. Como experiência complementar, o QL Chat
permite conversar através do próprio QL, com uma demonstração local ou uma
ligação opcional ao Gemini configurada com a chave pessoal do utilizador.

O projeto preserva os créditos e as licenças dos componentes incluídos,
acompanha a ROM Minerva com o seu código-fonte e verifica a integridade dos
ficheiros distribuídos. O emulador processa os cartuchos no navegador; a
configuração pessoal do Gemini fica no computador do utilizador.

Consulte [autoria e licenças](COPYRIGHT.md), [privacidade](PRIVACY.md) e
[créditos na aplicação](legal.html). As fontes, verificações e pontos em revisão
estão reunidos no [registo de distribuição](docs/LEGAL_REVIEW.md).

## Objetivo

A primeira configuração-alvo é um Sinclair QL Issue 6:

- MC68008 a 7,5 MHz;
- 128 KiB de RAM;
- ROM interna de 48 KiB, incluindo a Minerva livre distribuída pelo projeto;
- ZX8301 e os dois modos de vídeo originais;
- ZX8302, Intel 8049/IPC, teclado, joysticks, som e RTC;
- dois Microdrives com imagens `.mdv`;
- temporização suficientemente rigorosa para executar software original.

O projeto inclui a versão inglesa da **Minerva 1.98a1**, distribuída nos termos
da GPL-2.0-or-later, juntamente com uma cópia completa e imutável do respetivo
código-fonte. As ROMs QDOS/Sinclair não livres continuam deliberadamente
excluídas. Consulte [ROMs e licenças](roms/README.md) e os
[avisos de terceiros](THIRD_PARTY_NOTICES.md).

## Executar

Requer Node.js 20.12 ou posterior apenas para o servidor local e para os testes.

```sh
npm start
```

Quando o servidor estiver pronto, abre automaticamente `http://localhost:8080`
no navegador predefinido do sistema (Windows, macOS e Linux). Se o navegador
não abrir, o endereço continua disponível para abrir manualmente.

Para iniciar apenas o servidor, sem abrir o navegador:

```sh
npm run start:server
```

Para usar o emulador em ecrã inteiro, clique em **Ecrã inteiro**. No Windows,
**F11** alterna o modo de ecrã inteiro do navegador, mantendo toda a interface
disponível. A página não força esse modo no arranque: a
[API de ecrã inteiro exige uma interação do utilizador](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen#security_considerations).
Mantenha o terminal aberto enquanto usa o emulador; **Ctrl+C** para o servidor.

A Minerva incluída é carregada automaticamente. O interruptor **OFF / ON**
liga a máquina em **ON**; **OFF** corta a alimentação emulada, apaga a memória,
encerra o chat e deixa o ecrã preto. **Reiniciar** faz o mesmo ciclo de desligar
e voltar a ligar, regressando ao arranque F1/F2. Os cartuchos permanecem inseridos
e mantêm o conteúdo já escrito; os programas e variáveis apenas em RAM perdem-se.
O estado aparece junto ao interruptor. Nas instruções,
**Ligar QL** é também um atalho clicável, sublinhado e com o símbolo de ligar:
liga ou retoma o QL e coloca o foco no ecrã, sem o desligar se já estiver em execução.
Estes comandos também funcionam com o teclado (Tab, Enter ou Espaço).
**Reiniciar** e o som ficam junto aos controlos principais. **Controlos avançados**
reúne a execução de uma instrução, **Carregar outra ROM** e o diagnóstico da CPU.
Clique no ecrã para enviar o teclado do
navegador ao QL. Para facilitar a utilização com teclados modernos, Backspace é
traduzido automaticamente no atalho Ctrl+seta esquerda do QL; Ctrl+seta direita
apaga o carácter sob o cursor. O botão **Som ligado/desligado** controla o
altifalante emulado; o áudio só é ativado após uma interação com a página. A ROM
é processada apenas no navegador.

Os modos **Ecrã**, **Monitor** e **QL completo** ajustam a apresentação à janela
sem deformar as proporções. No modo QL completo, a composição mostra
automaticamente os cartuchos realmente montados em `MDV1` e `MDV2`: nenhum,
apenas o da esquerda, apenas o da direita ou ambos. A imagem regressa ao estado
correspondente assim que um cartucho é ejetado.

### Guia interativo

Se estiver no modo de chat, abrir **Guia de SuperBASIC** ou **Software e
Microdrives** apresenta **Voltar ao QL de sempre**. Pode continuar no chat ou
confirmar o reinício para usar a máquina original, sem IA. A confirmação
cancela uma resposta pendente e qualquer carregamento do terminal, limpa o
programa em memória e abre a ferramenta escolhida. Os cartuchos montados e a
configuração Gemini são mantidos. Prima **F1** no ecrã inicial para entrar no
SuperBASIC. O aviso também aparece depois de `/quit`, enquanto o programa do
terminal ainda estiver em memória; no modo normal, os dois botões abrem
diretamente, sem reiniciar.

O botão **Guia de SuperBASIC**, em **Mais para explorar**, abre um painel de aprendizagem que fica ao lado do
emulador em ecrãs largos e se apresenta como uma camada compacta em janelas
menores. As 32 lições cobrem os 16 capítulos do manual, podem ser pesquisadas,
percorridas em sequência e ligadas diretamente através de URLs como
`#guia/estrela-de-cores`. O progresso fica guardado localmente no navegador.

Cada exemplo permite **Carregar no QL** ou **Carregar e executar**. O código é
enviado gradualmente através do teclado IPC emulado, com controlo de fluxo,
progresso visível e possibilidade de cancelamento. Antes de substituir o
programa SuperBASIC que está na memória, o guia pede confirmação. Os exemplos
que guardam programas ou dados num Microdrive mostram ainda um aviso específico
com a unidade de destino (`mdv1_` ou `mdv2_`), e FORMAT indica que apaga o cartucho.
O guia inclui preparação de MDV2, diretórios das duas unidades, LOAD/LRUN,
cópias nos dois sentidos, DELETE e dois canais abertos para transferir dados.
As explicações e os exemplos são texto original
inspirado na progressão pedagógica do manual do QL, sem reproduzir o seu
conteúdo editorial.

### QL Chat — terminal com inteligência no host

As instruções estão na janela **QL Chat**:

1. Pode ligar o QL com **Ligar QL**; o chat também trata do arranque automaticamente.
2. Abra **QL Chat** e escolha **Google AI Studio** (ou a demonstração local, sem IA).
3. Prima **Carregar e iniciar chat** e confirme a substituição do programa em memória.
   A janela fecha-se e o ecrã fica em vista para acompanhar a escrita
   do SuperBASIC, linha a linha. Primeiro, o carregador entra no SuperBASIC
   (incluindo a escolha F1 no arranque) e verifica que o editor está pronto.
   Só depois envia o programa e avança a percentagem. Aguarde **Terminal pronto**.
4. Clique no ecrã, escreva após `>` e prima **Enter**. O histórico fica por baixo do monitor.

Para Gemini, mantenha `npm start` a correr. O carregamento visível pelo teclado
emulado é sempre preservado.

O botão **QL Chat** carrega e executa um terminal SuperBASIC real: MODE 4,
84 colunas, título verde, texto branco e uma zona de entrada separada. A Minerva
usa `ser1ir`; o ZX8302 entrega as mensagens ao host e recebe as respostas como
dados. O texto recebido nunca é executado como BASIC. Os Microdrives não são
alterados. O programa BASIC que estava na memória será substituído, mediante
confirmação. Se o SuperBASIC não ficar pronto, o carregamento para com uma
mensagem de erro, sem enviar o código para o ecrã de arranque.

Por defeito está selecionada a **Demonstração local**, que testa a ligação sem
IA, chave ou acesso a um fornecedor. O carregamento pelo teclado emulado demora
algumas dezenas de segundos. O progresso aparece junto ao histórico. Durante
essa fase, escrever no ecrã não interrompe nem altera o programa; **Reiniciar**
cancela. Aguarde **Terminal pronto**, que só aparece depois da confirmação
enviada pelo próprio SuperBASIC. Depois, use **Escrever no QL**, escreva uma
mensagem após `>` e prima Enter. Se o arranque falhar, o painel mostra o erro e
**Tentar novamente**. Escolha F1 antes de abrir o chat se ainda estiver no
ecrã inicial da Minerva.
`/new` limpa o histórico enviado ao modelo, mantendo o texto já visível;
`/quit` fecha a ligação. **Reiniciar** cancela pedidos pendentes, limpa a memória
e volta automaticamente ao arranque do QL; prima **F1** para entrar no SuperBASIC.
Backspace mantém o mapeamento para Ctrl+seta esquerda.

Recomenda-se inglês. Esta primeira versão descodifica o subconjunto imprimível
partilhado com ASCII e o símbolo £ do QL; outros caracteres de entrada tornam-se
`?`. Na resposta, acentos e pontuação Unicode são convertidos para texto simples;
caracteres de controlo são filtrados. Não é ainda uma conversão integral do
conjunto de caracteres QL. As respostas são mostradas quando estão completas,
com até 6000 bytes, sem streaming por token. A apresentação remove localmente
os marcadores Markdown de títulos, negrito e itálico, usa listas simples e
preserva o conteúdo e a indentação dos blocos de código. As linhas mudam entre
palavras, com margem para o prefixo `QL:`; apenas palavras ou endereços maiores
do que uma linha são partidos. Respostas que excedam o limite apresentam
`[Reply truncated]`. Esta formatação não altera o histórico enviado ao modelo
nem as suas definições.

#### Google AI Studio opcional, apenas Free e no servidor local

> A ligação está disponível quando configurada, sem ativar faturação.
> A utilização e disponibilização da integração seguem as condições do fornecedor,
> descritas no [registo de distribuição](docs/LEGAL_REVIEW.md#gemini-opcional).

O modelo fixo é `gemini-3.5-flash-lite`, através da Gemini Developer API.
A [tabela de preços Google](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
indica entrada e saída gratuitas no Free Tier (verificado em 16/09/2026).
Usamos pensamento **Minimal**, sem instruções de sistema adicionais, sem saída
estruturada, execução de código, chamadas de funções, Google Maps ou URL context.
O antigo prompt de companheiro QL, com preferência por inglês e respostas de
150 palavras, foi removido para corresponder ao campo vazio do Playground.
A conversão de caracteres para o QL continua a ser feita localmente.

**Diferença face ao Playground:** Google Search grounding está desligado.
A mesma tabela de preços indica que não está disponível no Free Tier da API
de `gemini-3.5-flash-lite`, embora possa ser testado no Google AI Studio.
Por isso, não reproduzimos essa opção do Playground com o requisito de custo
zero. Sem pesquisa, as respostas não são verificadas na web e podem conter
erros factuais; retirar o prompt não garante que esses erros desapareçam.
Mantemos o limite local de 1024 tokens e o histórico curto; temperatura e top-p
ficam nos valores predefinidos da API, pois não foram indicados no painel de
definições avançadas. Para comparar perguntas, use `/new` e uma conversa nova
no Playground. Reinicie `npm start` depois de atualizar o servidor.

Cada utilizador deve usar a sua
própria conta e chave. **Não publicar uma chave partilhada no GitHub, no JavaScript
do navegador ou num endpoint público.** A página estática continua a oferecer a
demonstração; o acesso ao Gemini requer o servidor Node local.

Para não haver cobranças, confirme no Google AI Studio que **o projeto da chave
está no plano Free, sem faturação ativada**, e mantenha-o assim. A
[faturação é definida por projeto](https://ai.google.dev/gemini-api/docs/billing);
o pedido `generateContent` não tem um seletor que force Free numa conta paga.
O host não consegue verificar esse estado só com a chave API e não altera a
faturação. **O limite local e a opção `confirmed` não garantem despesa zero
num projeto pago.** Não ative a integração enquanto houver dúvida sobre o plano.

**Configuração pelo diálogo (recomendada):** execute `npm start` e abra
`http://localhost:8080`. Na primeira visita, a apresentação explica que o chat
é um complemento opcional. **Continuar para o emulador** dispensa a chave;
pode programar em SuperBASIC, carregar software e experimentar a demonstração.
Pode reabrir **Configurar Gemini opcional** no topo da página ou
**Configurar a minha chave Gemini** em QL Chat.

1. Abra o [Google AI Studio](https://aistudio.google.com/api-keys) e entre com
   a sua conta Google. Escolha **Create API key**, selecionando ou criando um
   projeto ([instruções Google](https://ai.google.dev/gemini-api/docs/api-key)).
2. Confirme que o projeto está no plano **Free**, sem faturação ativada.
3. Cole a sua chave no campo protegido, assinale a confirmação e escolha
   **Guardar neste computador**. Não é feito um pedido ao Google ao guardar.

**Atenção: o identificador do projeto não é a chave API.** Um valor como
`gen-lang-client-…` identifica apenas o projeto. No Google AI Studio, copie o
valor da **chave API**, não o nome, o número ou o ID do projeto.

O diálogo escreve `GEMINI_API_KEY` e `QL_GEMINI_FREE_ONLY=confirmed` em
**`.env` na raiz do projeto**, junto de `package.json`, preservando outras
variáveis e comentários existentes. O arranque lê esse mesmo ficheiro.
O `.gitignore` exclui `.env` e os ficheiros temporários `.env.*` das adições
normais ao Git; apenas `.env.example`, sem chaves, deve ser versionado.
Não use `git add -f .env`, não partilhe este ficheiro nem o inclua em ZIPs ou
uploads da pasta do projeto. O `.gitignore` não protege ficheiros já versionados.
O servidor bloqueia o acesso HTTP ao `.env`. É um ficheiro de texto privado,
não um cofre encriptado. Em sistemas POSIX, é criado com permissões `0600`.

As alterações entram em vigor sem reiniciar. Desmarcar a confirmação e guardar
deixa `QL_GEMINI_FREE_ONLY` vazio e desliga Gemini. O campo vazio mantém a chave
existente; **Remover chave** esvazia ambas as variáveis no `.env` do projeto.
Isso não revoga a chave no Google. A antiga localização
`~/.config/sinclair-ql-emulator/.env` deixou de ser lida ou alterada: se usou
essa versão, volte a guardar pelo diálogo para configurar este projeto.
A suspensão de segurança por quota/configuração não é removida
pelo diálogo. O navegador não guarda a chave em localStorage nem a recebe de
volta do servidor; o campo é limpo depois de guardar ou fechar. Apenas a
preferência de já ter visto a apresentação é guardada no navegador.

Numa página pública/estática, o campo fica indisponível: a configuração exige
o servidor local. Não há chave partilhada nem envio para um servidor do autor.

**Alternativa manual**, na raiz do projeto, junto de `package.json`:

1. Se ainda não existir `.env`, copie `.env.example` para **`.env`**.
2. No [Google AI Studio](https://aistudio.google.com/api-keys), obtenha a chave
   do seu projeto Free. Um ID como `gen-lang-client-…` identifica o projeto;
   **não é uma chave API**. Cole a chave apenas em `.env`, depois de `GEMINI_API_KEY=`.
3. Depois de verificar o plano Free e a faturação desativada desse projeto,
   escreva `confirmed` depois de `QL_GEMINI_FREE_ONLY=`:

```dotenv
GEMINI_API_KEY=coloque_a_sua_chave_privada_aqui
QL_GEMINI_FREE_ONLY=confirmed
```

Edite apenas `.env`; `.env.example` é o modelo público e deve continuar sem
chaves. No Windows, confirme que o nome é `.env`, não `.env.txt`.

O `.gitignore` exclui `.env` do controlo de versões; apenas o modelo
`.env.example` é incluído no GitHub. O servidor também bloqueia o acesso HTTP
a estes ficheiros. `confirmed` continua a ser a sua declaração de que verificou
o plano, não uma verificação Google nem um bloqueio de faturação. As antigas
variáveis `GROQ_API_KEY` e `QL_GROQ_FREE_ONLY` deixaram de ser usadas.

Depois, arranque normalmente na pasta do projeto:

```sh
npm start
```

O servidor lê o `.env` na raiz do projeto, sem substituir valores já definidos
no ambiente do sistema. Reinicie-o quando editar o ficheiro manualmente.
Sem `.env`, ou com os campos vazios, o emulador e a demonstração local continuam
a funcionar; o Gemini fica desativado. Variáveis já definidas no sistema ou por
`node --env-file=... scripts/serve.mjs` têm prioridade sobre `.env`;
nesse caso, o diálogo fica só de leitura para não dar uma falsa indicação de gravação.

Abra `http://localhost:8080`, escolha **QL Chat → Google AI Studio** e inicie. Só as mensagens
do chat e um histórico curto são enviados ao Google; a memória e os cartuchos do QL
não são enviados. A chave introduzida no diálogo passa apenas para o servidor
local, que a guarda e usa para autenticar pedidos ao Google. O servidor
escuta apenas em loopback, valida origem e Host e serve apenas os recursos
públicos da aplicação. Não o exponha através de um proxy público.

Como proteção adicional, o host admite um pedido de cada vez, com intervalo
mínimo de 15 segundos, até 100 pedidos por dia UTC e até oito sessões. Conserva
no máximo três pares recentes de mensagens, reduzindo esse histórico quando
excede 6000 caracteres (o par mais recente é sempre mantido). Estes contadores
e o histórico estão em memória e desaparecem ao reiniciar o servidor. A quota
real depende do projeto e do modelo; consulte os
[limites Google](https://ai.google.dev/gemini-api/docs/rate-limits).

**Quota esgotada: parar.** HTTP 429 e os restantes erros 4xx (incluindo chave,
permissão, faturação ou modelo indisponível) bloqueiam novos pedidos. O bloqueio
é guardado em `.env.gemini-paused`, que não é publicado nem servido por HTTP,
e mantém-se após reiniciar o host. `/new` não o remove. Para desbloquear,
pare o servidor, confirme a reposição da quota, o plano Free e a faturação
desativada; só então remova manualmente `.env.gemini-paused` e reinicie.
Não há novas tentativas automáticas, mudança de modelo, fornecedor alternativo,
pesquisa Google, cache paga ou ferramentas externas. Cada pedido gera no máximo
uma resposta de 1024 tokens. Nunca fazemos uma chamada paga para testar o plano.

Se o chat mostrar um erro de ligação:

- **Google HTTP 500/503/504**: o fornecedor falhou, está indisponível ou demorou
  demasiado. O código HTTP aparece no terminal; pode tentar manualmente mais
  tarde. Estes erros não são tratados como quota esgotada.
- **LOCAL SERVER DISCONNECTED**: confirme que `npm start` continua a correr.
  Mantenha essa janela aberta durante o chat.
- **LOCAL SESSION EXPIRED**: o servidor foi reiniciado. Abra novamente **QL Chat**
  para obter uma nova sessão; essa mensagem não chegou ao Google.
- **GEMINI TIMEOUT / LOCAL SERVER TIMEOUT**: o servidor espera até 45 segundos
  pelo Google e o navegador até 55 segundos pelo servidor. O pedido é cancelado
  e o QL recebe o fim da resposta para voltar ao prompt.

Não há reenvio automático: depois de uma falha de rede, o Google pode já ter
recebido o pedido. Os detalhes internos e a chave API nunca aparecem nos erros.

O transporte série é uma ligação virtual por bytes com transmissão temporizada
e receção IPC em lotes; não simula eletricamente RS-232, paridade nem o timing
da receção do 8049. O terminal envia STX após abrir SER1 para confirmar o
arranque; esse sinal nunca é enviado ao modelo. O enquadramento do chat usa LF para pedidos e ETX para o fim
da resposta. As referências do protocolo são as fontes Minerva incluídas
(`inc/pc`, `inc/ipcmd`, `ip/int.asm` e `od/ser.asm`).

### Carregar software

**Software**, em **Mais para explorar**, abre a biblioteca e permite escolher uma pasta, adicionar vários
ficheiros ou arrastá-los para o painel. Mostra apenas os formatos suportados e
permite inserir ou trocar cartuchos nas duas unidades emuladas: **MDV1 e MDV2**.
Cada título tem **Carregar e arrancar**: insere em MDV1, reinicia o QL e envia F1.
**Escolher unidade…** abre as opções de **Inserir em MDV1** ou **Inserir em MDV2**,
sem reiniciar. Após essa inserção, abre-se o gestor da unidade. **Gerir MDV1/MDV2**
também abre diretamente o gestor, onde **Novo cartucho** cria e insere um cartucho
virgem na unidade escolhida. Cada unidade mostra o nome
completo do cartucho, a atividade e instruções breves. O acesso ao guia explica
FORMAT, DIR, SAVE, LOAD e COPY.

A biblioteca inclui, por esta ordem, os seguintes programas em `local-software/`:

- **SkyQL:** planetário para o QL, © 2026 Luis Cunha. Código MIT;
  dados de catálogo e constelações CC BY-SA 4.0, com créditos no cartucho.
- **Psion Quill 2.35:** processador de texto.
- **Psion Abacus 2.35:** folha de cálculo.
- **Psion Easel 2.35:** gráficos de dados.
- **Psion Archive 2.38:** base de dados.
- **Psion Chess:** Richard Lang; © 1984 Psion Ltd. — Freeware.
- **Spook:** © 1985 Damon Chaplin — domínio público.
- **Electric Dreams:** leitor musical para QL; composição de Philip Oakey e
  Giorgio Moroder, MIDI original sequenciado por Roger St louis. Cartucho de
  melodia, com fontes e créditos incluídos. Ative o som; Esc interrompe a
  reprodução. Depois, R repete ou Q sai.

Os quatro programas de escritório são © Psion: cópia gratuita para utilizadores
QL, sem fins lucrativos, com copyright conservado, segundo o
[arquivo QL de Dilwyn Jones](https://sinclairql.net/djw/psions/index.html).
São as versões para Microdrive: **Carregar e arrancar** inicia-as em MDV1;
use um cartucho gravável em MDV2 para os seus documentos e dados.
Autoria e termos dos jogos segundo [QL software, de Daniele Terdina](https://www.terdina.net/ql/software.html).
Os ficheiros fornecidos pelo utilizador são conservados sem alterações; os
[créditos dos exemplos](local-software/README.md) acompanham-nos. Para Psion Chess,
a biblioteca utiliza `chess_mk.zip`, a edição executável publicada no
[arquivo QL](https://sinclairql.net/djw/games/index.html), com adaptação de Jochen
Hassler e correção 3D de Marcel Kilgus. Arranca em MDV1 sem cartucho mestre;
prima uma tecla para começar e F2 para alternar a vista 3D. O pacote original
`PsionChess.qlpak` também é conservado, mas mantém o mecanismo do cartucho original.
O servidor permite apenas os ficheiros de exemplo explicitamente identificados.

O importador preserva os metadados QDOS dos ZIPs. Quando um pacote contém apenas
um executável, cria um pequeno BOOT na imagem Microdrive para o iniciar na
unidade escolhida, sem modificar o arquivo. O arranque de Psion Chess foi
verificado com Minerva e MDV2 vazia; a vista 3D e o modo de demonstração também
foram experimentados.

A biblioteca aceita os seguintes formatos, inicialmente protegidos contra escrita:

- imagens `.mdv` no formato QLAY de 174 930 bytes;
- pacotes `.qlpak` do Q-emuLator;
- arquivos `.zip`, incluindo o campo adicional que preserva o tipo e o espaço
  de dados dos executáveis QDOS.

No gestor de cada unidade, **Permitir escrita** ou **Proteger** controla o cartucho montado.
Um clique alterna a proteção contra novas escritas, sem apagar alterações já
feitas. A escolha é recordada neste navegador pelo conteúdo do ficheiro,
incluindo cópias exportadas com **Guardar .mdv**; se o armazenamento local estiver
indisponível, vale apenas durante a sessão. Não se infere o modo pelo nome.
Cartuchos novos começam graváveis e unidades vazias não mostram este controlo.
**Alterações por guardar** é uma indicação independente da proteção: pode
guardar um cartucho alterado mesmo depois de o voltar a proteger.

QLPAK e ZIP são descomprimidos localmente e convertidos numa imagem Microdrive
temporária. Nos pacotes configurados como `FLP1`, as referências do ficheiro
`BOOT` são adaptadas para a unidade escolhida, sem alterar os restantes
ficheiros. Pacotes
que ultrapassem a capacidade de um cartucho são recusados claramente; formatos
destinados a discos `WIN` e software que exija hardware ainda não emulado não
são suportados por esta conversão.
Se o pacote não couber, o erro apresenta a capacidade por cartucho e a
configuração QCF (RAM, vídeo e disco, quando indicada). Pacotes SMSQ/E com
vídeo Q60 e vários MiB de RAM não passam a funcionar por montar duas unidades;
essas capacidades ainda não estão emuladas.

No guia, **Microdrives — começar aqui** abre a preparação de MDV1 com `FORMAT`,
antes da primeira gravação. **Comandos de mdv_** abre uma referência por tarefas:
preparar/listar, guardar/carregar/juntar BASIC, copiar/apagar, abrir/ler/escrever/
fechar ficheiros, e carregar binários ou executáveis. Inclui requisitos e exemplos
de `FORMAT`, `DIR`, `SAVE`, `LOAD`, `LRUN`, `MERGE`, `MRUN`, `COPY`, `COPY_N`,
`DELETE`, `OPEN`, `OPEN_IN`, `OPEN_NEW`, `PRINT`, `INPUT`, `EOF`, `CLOSE`, `EXEC`,
`EXEC_W`, `SBYTES`, `LBYTES` e `SEXEC`. Os exemplos avançados são referência;
os botões dessa lição executam apenas `DIR mdv1_`.

A sequência ensina a preparar as duas unidades, copiar antes de carregar a cópia,
exportar cada cartucho alterado e resolver erros. O exercício de dois canais usa
`EOF` antes de ler cada valor e fecha ambos os ficheiros. Há também acesso direto
ao início deste percurso na biblioteca, pelo botão **Guia de Microdrives**.

A referência distingue os comandos da ROM dos que exigem extensões, com ligações
ao [manual Sinclair QL](https://www.sinclairql.net/djw/docs/ebooks/olqlug/index.html)
e às páginas de comandos do
[manual SuperBASIC](https://superbasic-manual.readthedocs.io/en/latest/).

**Clique na porta de MDV1 ou MDV2** na apresentação QL completo para abrir o menu
da respetiva unidade. Os botões **MDV1 / MDV2** junto ao ecrã fazem o mesmo em
qualquer apresentação e são acessíveis pelo teclado. O menu identifica a unidade
escolhida e permite alternar entre **MDV1** e **MDV2**; selecionar um cartucho insere-o diretamente nela. Este clique não muda
os comandos do QL: continue a indicar `mdv1_` ou `mdv2_` em `DIR`, `SAVE`, etc.

O menu oferece **Novo cartucho**, **Os meus projetos**, **Biblioteca de software**
(os ficheiros importados nesta sessão) e **Abrir do computador…**. Se houver um
cartucho inserido, também oferece **Guardar projeto**, **Exportar .mdv**,
**Proteger / Permitir escrita** e **Retirar**. MDV1 oferece também **Reiniciar e arrancar de MDV1**.
**Abrir biblioteca de software** permite adicionar ficheiros ou pastas. Abrir a biblioteca
a partir do ecrã inteiro sai desse modo. Uma indicação junto à imagem mostra como
abrir o gestor; as portas destacam-se ao passar o rato ou receber foco pelo teclado.

**Criar e preparar no QL (FORMAT)** cria um cartucho virgem na unidade escolhida
e envia `FORMAT` através do teclado do QL. Antes, deixe o QL pronto no SuperBASIC
(F1 no arranque); este comando interrompe um programa em execução. Espere que o
motor pare e confirme com `DIR`. **Criar virgem — formatar depois** permite
prepará-lo manualmente. Um cartucho existente só é substituído após confirmação.

**Guardar projeto** conserva uma nova cópia completa em armazenamento local do
navegador, incluindo a proteção e a geometria do cartucho. As cópias aparecem em
**Os meus projetos** mesmo depois de recarregar a página, no mesmo navegador e
endereço do emulador. Pode remover uma cópia dessa lista sem retirar os cartuchos
já inseridos. Se o armazenamento estiver indisponível ou cheio, o menu comunica a
falha e conserva as versões anteriores; use **Exportar .mdv** para guardar no
computador. Limpar os dados do navegador remove os projetos locais.

**Novo cartucho**, no gestor de MDV1 ou MDV2, cria um meio gravável. Depois de o montar, o próprio
SuperBASIC pode inicializá-lo e usá-lo com os comandos habituais, por exemplo:

```basic
FORMAT mdv1_trabalho
SAVE mdv1_programa
DIR mdv1_
LOAD mdv1_programa
```

O emulador reproduz uma pequena emenda física para que a rotina `FORMAT` da
Minerva possa medir e validar o cartucho como faria com fita real. As alterações
ficam apenas em memória até escolher **Guardar .mdv** na unidade. Substituir ou
ejetar um cartucho alterado pede confirmação, e fechar a página também apresenta
o aviso normal do navegador.

No gestor de `MDV1`, **Reiniciar e arrancar de MDV1** usa o cartucho já inserido, reinicia a máquina, envia F1 e inicia a
execução para procurar `mdv1_boot`. **Inserir em MDV1/MDV2** não reinicia o QL, o que
permite preparar várias unidades antes do arranque. Todo o conteúdo permanece
no navegador; as pastas e os ficheiros escolhidos nunca são enviados nem
modificados.

Para trabalhar com dois cartuchos, monte a origem em **MDV1** e outro cartucho
em **MDV2**, usando **Inserir em MDV1/MDV2**. Deixe a origem protegida e torne o destino
gravável. Apenas se o destino for virgem ou dispensável, execute
`FORMAT mdv2_trabalho` — este comando apaga-o. Com o programa `guia` já guardado
em MDV1, execute cada comando e espere que termine:

```basic
DIR mdv1_ : DIR mdv2_
COPY mdv1_guia TO mdv2_guia
LOAD mdv2_guia
LIST
RUN
```

`COPY` preserva o cabeçalho QDOS, necessário aos executáveis; `COPY_N` remove-o.
Para copiar de volta com outro nome, torne MDV1 gravável e execute
`COPY mdv2_guia TO mdv1_guia_copia`. O destino não deve já existir. Repita COPY
para cada ficheiro necessário, incluindo BOOT e dados; a ROM base não inclui
cópia por curingas de todo o cartucho. Para executar um programa BASIC use
`LRUN mdv1_nome`; para código máquina com cabeçalho QDOS use `EXEC_W mdv1_nome`.

As luzes vermelhas na caixa e na biblioteca seguem os motores selecionados,
incluindo a procura de setores e a paragem controlada pela ROM, conforme o
[manual de serviço, secção 7](https://www.sinclairql.net/srv/qlsm1.html).
O QDOS alterna as unidades durante a cópia; ter dois cartuchos montados não
mantém as duas luzes acesas. Guardar, trocar e proteger cartuchos fica
temporariamente indisponível para cartuchos já inseridos enquanto há um motor
em marcha, para não exportar ou interromper uma gravação pendente. Pode sempre
inserir ou criar um cartucho na outra unidade se estiver vazia e parada.
Se a emulação estiver em pausa, **Retomar QL para concluir a operação** permite
continuar sem fechar a biblioteca. No final, escolha **Exportar .mdv**
em cada unidade alterada. Pausar a emulação congela também o estado dos motores;
retome a execução para que o QDOS termine o acesso.

Se um programa não carregar, confirme os nomes com DIR e consulte a lição
**Arrancar software e reconhecer erros**. Não formate uma imagem de software
para tentar corrigir um erro de leitura. Software que exija Toolkit II, outra
ROM, discos ou mais de 128 KiB de RAM pode continuar incompatível.

## Percorrer o QL Chat

Ao abrir o terminal, o **Histórico da conversa** aparece por baixo do monitor.
O botão destacado **Recolher conversa ▲ / Mostrar conversa ▼** permite
recolher ou consultar o histórico sem perder mensagens durante a conversa.
Fora do chat, toda a área fica oculta, incluindo o botão, sem ocupar espaço:
no arranque, ao sair com `/quit`, ao reiniciar o QL ou ao carregar um exemplo
do guia. Iniciar o chat abre-a novamente. As mensagens de carregamento e erro
têm uma área separada, para manter acessível **Tentar novamente** se necessário.
Em **Mais para explorar**, dois acessos com ícones de livro e cartucho destacam
o **Guia de SuperBASIC** e **Software**, com descrições breves e
os formatos `.mdv`, `.qlpak` e `.zip`.
Use a roda do rato, o trackpad ou deslize com o dedo. Os botões **↑ / ↓**
avançam uma linha; **⇈ / ⇊** avançam uma página com uma linha de sobreposição.
Com o histórico focado, use também as setas, **Page Up / Page Down** e
**Home / End**. A deslocação é suave e respeita a preferência de movimento
reduzido do navegador.

Enquanto lê mensagens antigas, as novas respostas mantêm a sua posição.
**Mais recente** mostra a contagem de novas mensagens e volta ao fim,
retomando o acompanhamento automático. **Escrever no QL** devolve o foco ao
teclado do terminal. O histórico guarda nesta página o texto enviado e as
respostas entregues ao QL, incluindo respostas longas. Fica oculto ao sair
do terminal; abrir outro terminal ou recarregar a página limpa-o.

## Testes

```sh
npm test
npm run test:conformance
```

O comando também confirma o tamanho e os hashes da ROM, do código-fonte
correspondente e dos avisos exigidos pela licença. O segundo comando executa a
amostra determinística do corpus público `SingleStepTests/m68000`: 56 estados
completos que cobrem NOP, MOVEQ, ADD.B, ABCD, Bcc, CLR.W e BTST, incluindo modos
de endereçamento por registo, memória e imediato.

Também é possível testar ficheiros binários originais, sem os converter para
JSON:

```sh
node scripts/run-m68000-conformance.mjs /caminho/m68000/v1/NOP.json.bin
```

Consulte [a validação da CPU](docs/ARCHITECTURE.md#validação-do-mc68008) para
obter a versão exata do corpus e conhecer as limitações atuais do comparador.

## Licença

> **Direitos ou pedidos de remoção? Contactar o Autor: luis.luiscunha[at]gmail.com**
>
> Se considerar que algum componente viola os seus direitos, ou preferir que um
> elemento da sua autoria ou de que seja titular não seja incluído, contacte-me.
> O pedido será apreciado com atenção, respeito e boa-fé; após essa apreciação,
> os elementos em causa serão removidos do projeto.
> Consulte o [aviso de contacto e respeito pela comunidade](#contacto-e-respeito-pela-comunidade).
> Para escrever, substitua `[at]` por `@`.

O código do emulador é Copyright (C) 2026 Luís Simões da Cunha e está licenciado
sob a [GNU GPL versão 2 apenas](LICENSE). A Minerva é um componente independente
de Laurence Reeves, sob GPL versão 2 ou posterior; os seus termos, proveniência
e fontes correspondentes estão identificados em
[`third_party/minerva/`](third_party/minerva/).

## Estado

O projeto contém a estrutura do emulador, barramento de 20 bits, mapa inicial de
ROM/RAM, carregamento automático da Minerva e o primeiro bloco de vídeo do
ZX8301: `MC_STAT`, blanking, MODE 4/8, dois bancos de ecrã e conversão para um
canvas RGBA de 512 × 256. O ZX8302 fornece os registos, a comunicação IPC
bit-serial, portas série virtuais SER1/SER2, o teclado, o som do IPC/8049 por Web Audio e a interrupção periódica
necessários para a Minerva chegar ao ecrã interativo do SuperBASIC. As duas
unidades de Microdrive aceitam imagens
QLAY `.mdv`, incluindo seleção em cadeia, GAP, cabeçalhos, registos e escrita
física através dos registos do ZX8302. Imagens e pacotes importados ficam
protegidos inicialmente, com proteção ajustável por cartucho; cartuchos virgens podem ser formatados e gravados pelo SuperBASIC e
exportados como `.mdv`. Pacotes QLPAK e ZIP que caibam
num cartucho são convertidos localmente para este formato, preservando os
metadados QDOS conhecidos. O primeiro bloco do MC68008 já
implementa reset, registos, pilhas de supervisor/utilizador, acesso alinhado, exceção de
instrução ilegal, emulação das linhas A/F, trace, interrupções autovetorizadas,
violação de privilégio e códigos de condição. Estão
implementados NOP, MOVEQ, MOVE/MOVEA, LEA, CLR, TST, NEG/NEGX, NOT, EXT, SWAP,
TAS, transferências de SR/CCR/USP, ADD/ADDA, SUB/SUBA, CMP/CMPA, ADDQ/SUBQ,
ADDX/SUBX, ABCD/SBCD/NBCD, CMPM, MOVEM, MOVEP, MULU/MULS, DIVU/DIVS, CHK, OR,
AND, EOR, EXG, operações de bits, shifts e rotações, as variantes imediatas,
BRA/Bcc, BSR, DBcc, Scc, JMP, JSR, PEA, LINK/UNLK, TRAP/TRAPV, RESET, STOP, RTS,
RTR e RTE, bem como os principais modos de endereçamento do MC68000. A cobertura
da CPU será aumentada incrementalmente e confrontada com os testes públicos
SingleStepTests/m68000. Uma primeira amostra fixada de 56 casos já faz parte dos
testes automáticos.

---

## Contactar o Autor

**Luís Simões da Cunha · luis.luiscunha[at]gmail.com**

Para questões sobre direitos, conteúdos ou pedidos de remoção, escreva-me
identificando o elemento e o motivo do pedido. Cada situação será apreciada
com atenção, respeito e boa-fé; após essa apreciação, os elementos em causa
serão removidos do projeto.

Substitua `[at]` por `@` ao escrever. Consulte também o
[aviso de contacto e respeito pela comunidade](#contacto-e-respeito-pela-comunidade)
no início deste documento. Obrigado por ajudar a preservar a história do QL
com respeito pelos seus autores e pela comunidade.
