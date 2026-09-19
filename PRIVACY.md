# Dados e privacidade

Atualizado em 19 de setembro de 2026. Este documento descreve a execução local
do emulador através de `npm start`.

## Emulador e ficheiros

As ROMs e os cartuchos selecionados são lidos no navegador. Os seus conteúdos
não são enviados ao autor do projeto nem ao Google. Exportar um cartucho cria
um download, preservando o ficheiro original. A aplicação não inclui contas de
utilizador, publicidade, telemetria, fontes remotas ou ferramentas de análise.

O navegador guarda os seguintes dados em `localStorage`:

| Chave | Conteúdo e finalidade |
| --- | --- |
| `sinclair-ql-presentation` | Modo de apresentação escolhido |
| `sinclair-ql-sound` | Preferência de som |
| `sinclair-ql-guide-progress` | Identificadores das lições experimentadas |
| `sinclair-ql-microdrive-protection` | Hash SHA-256 e preferência de proteção dos cartuchos; este registo não contém os ficheiros nem os seus nomes |
| `sinclair-ql-project:…` | Projetos guardados pelo utilizador: nome, data, conteúdo completo do cartucho e propriedades da imagem |
| `sinclair-ql-welcome-seen` | Indicação de que a apresentação inicial já foi vista, sem segredos |

Estes dados ficam no navegador até serem removidos. Os projetos podem ser
apagados no gestor; os restantes registos podem ser removidos nas definições
de dados do site. Antes de limpar esses dados, exporte os cartuchos que pretende
conservar. A aplicação não transmite estes registos e não usa cookies de analítica.

## Conversa local e Gemini

A demonstração local funciona sem IA, chave API ou transmissão de mensagens a
fornecedores. O histórico visível fica na memória da página e desaparece ao
recarregá-la. `/new` inicia uma nova conversa lógica, conservando o histórico
já visível.

O Gemini é uma opção adicional, escolhida pelo utilizador. Quando utilizado,
recebe as mensagens e o contexto recente através do servidor local. O servidor
mantém até oito sessões em memória e não grava transcrições em ficheiros.
`/new` limpa o contexto da sessão; sair do chat não elimina imediatamente todas
as sessões guardadas pelo processo. Reiniciar o servidor elimina essa memória.

O tratamento dos dados enviados ao Google segue os
[termos da Gemini API](https://ai.google.dev/gemini-api/terms).
As condições de disponibilização da integração estão descritas no
[registo de distribuição](docs/LEGAL_REVIEW.md#gemini-opcional).

## Chave pessoal e configuração

Cada utilizador obtém a sua chave através da própria conta no
[Google AI Studio](https://aistudio.google.com/api-keys). O projeto não distribui
uma chave partilhada. A configuração exige a confirmação de projeto Free;
não ativa faturação nem recorre automaticamente a uma alternativa paga.

O diálogo de configuração guarda a chave e a confirmação no ficheiro `.env`,
junto de `package.json`. A proteção da configuração assenta em medidas concretas:

- O `.gitignore` exclui o `.env` das adições normais ao Git.
- O servidor web bloqueia o acesso ao ficheiro.
- A chave é enviada do campo protegido para o servidor local, sem ser devolvida
  nas respostas ou guardada no armazenamento do navegador.
- O campo é limpo ao guardar ou fechar o diálogo.
- Guardar a configuração não contacta o Google; a chave é utilizada quando
  o utilizador escolhe conversar com Gemini.

O `.env` é um ficheiro local sem encriptação. Mantenha o acesso à pasta reservado
e exclua-o de arquivos ou cópias partilhadas; a regra do Git não filtra ficheiros
ZIP nem adições forçadas. Pode remover a chave guardada no mesmo diálogo.
A revogação da chave na conta Google é uma operação separada.

## Âmbito de uma instalação pública

Esta descrição refere-se ao servidor local. Uma instalação alojada publicamente
deve documentar o seu operador, contacto, prestadores, registos de acesso e
prazos de retenção. O servidor local de chat foi concebido para uso no computador
do utilizador, não para exposição através de um proxy público.

Questões sobre o funcionamento podem ser comunicadas no
[repositório do projeto](https://github.com/luiscunhacsc/sinclair-ql-emulator-main).
Ao abrir uma issue pública, partilhe apenas a informação técnica necessária,
sem chaves API nem dados pessoais.