# Licenças, proveniência e distribuição

Documentação atualizada em 19 de setembro de 2026.

Este registo reúne as fontes, os cuidados de distribuição e as verificações do
Sinclair QL Emulator, um projeto independente com código aberto. Os componentes
mantêm os seus créditos e termos próprios, identificados em
[COPYRIGHT.md](../COPYRIGHT.md) e nos [avisos de terceiros](../THIRD_PARTY_NOTICES.md).

## Componentes documentados

| Componente | Cuidados adotados | Registo |
| --- | --- | --- |
| Código e documentação originais | Autoria identificada; licença GPL-2.0-only incluída; código JavaScript servido sem minificação | [Autoria](../COPYRIGHT.md), [licença](../LICENSE) |
| Minerva 1.98a1 | Aviso original preservado; ROM acompanhada de arquivo de fontes fixado numa revisão; integridade verificada por hashes | [Fontes e construção](../third_party/minerva/SOURCE.md) |
| Vetores MC68000 | Revisão de origem fixada; transformação da amostra documentada; licença MIT integral incluída | [Proveniência dos testes](../third_party/m68000-single-step/SOURCE.md) |
| Quill, Abacus, Easel, Archive, Psion Chess e Spook | Pacotes incluídos sem alterações, com autoria e condições de disponibilização atribuídas às fontes | [Software de exemplo](../local-software/README.md) |
| Ilustrações do equipamento | Referências e crédito do teclado registados; inventário por ficheiro com hash SHA-256 | [Proveniência visual](../assets/PROVENANCE.md) |
| Dados do utilizador | Processamento local de cartuchos; armazenamento descrito; chave pessoal separada do código distribuído | [Privacidade](../PRIVACY.md) |

O arquivo de fontes Minerva acompanha o binário distribuído. O verificador
compara esse binário com o do arquivo de referência; a reconstrução com
QMAC/QLINK é um procedimento distinto, descrito na documentação do componente.
Os avisos originais, incluindo o campo literal `yyyy`, são conservados.

## Referências técnicas e identidade

A [arquitetura](ARCHITECTURE.md) documenta as referências usadas para implementar
o comportamento do equipamento e comparar resultados. Os manuais históricos
citados não integram a distribuição. O guia apresenta explicações e exemplos
SuperBASIC do projeto. Componentes externos incluídos têm registos próprios de
origem, revisão e licença.

O nome Sinclair QL identifica a máquina emulada. A interface apresenta o projeto
como emulação independente, sem afiliação ou aprovação pelos titulares das
marcas mencionadas. A ROM incluída é a Minerva; ROMs proprietárias QDOS/Sinclair
não integram o pacote.

Os sons são sintetizados pelo código e as fontes tipográficas vêm do sistema.
O projeto não tem dependências npm de execução; Node.js e o navegador são
pré-requisitos externos.

## Gemini opcional

O emulador e a demonstração local de conversa funcionam sem serviços de IA.
A ligação ao Gemini usa uma chave pessoal, guardada no servidor local. Exige
confirmação de projeto Free, interrompe o chat ao atingir a quota e não ativa
faturação nem muda automaticamente para uma alternativa paga.

Os [termos adicionais da Gemini API](https://ai.google.dev/gemini-api/terms),
consultados em 19 de setembro de 2026, estabelecem condições de idade (18+),
finalidade profissional/empresarial e disponibilidade regional. Para
disponibilizar clientes a utilizadores no EEE, Suíça ou Reino Unido, exigem
Paid Services, associados a faturação ativa. Esta condição difere da existência
de uma quota gratuita e permanece por conciliar com a configuração Free-only
do projeto antes da disponibilização pública da integração.

A configuração técnica e as condições do fornecedor são documentadas
separadamente. A [privacidade](../PRIVACY.md) explica os dados enviados quando
o utilizador escolhe Gemini.

## Registo de preparação da distribuição

O [inventário de publicação](../legal/publication-review.json) conserva o estado
de cada área e a ligação à documentação correspondente. Estão em revisão:

- A licença das adaptações visuais, as permissões das referências do monitor e
  a correspondência entre fontes e imagens finais.
- O enquadramento da apresentação visual e das marcas nos territórios de distribuição.
- A identificação do operador e do tratamento de dados, caso seja criado um serviço alojado.
- A revisão final das fontes, referências e avisos do pacote a distribuir.
- A condição regional de disponibilização da integração Gemini descrita acima.

Estes registos distinguem a informação já documentada da que ainda necessita de
confirmação. A atualização editorial mantém os estados e as evidências existentes.

## Verificações disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm run verify:distribution` | Verificar os ficheiros, hashes, fontes e avisos incluídos no pacote |
| `npm test` | Executar a verificação de distribuição e os testes de funcionamento |
| `npm run audit:legal` | Conferir o inventário visual e apresentar os pontos declarados em revisão |

As verificações automáticas dão rastreabilidade ao pacote; o estado das permissões
é sustentado pelos registos e documentos de cada componente.
