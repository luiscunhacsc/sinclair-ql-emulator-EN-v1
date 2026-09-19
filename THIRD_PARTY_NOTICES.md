# Avisos de componentes de terceiros

Este documento reúne os créditos, os termos e as fontes dos componentes
incluídos. Consulte também [autoria e âmbito das licenças](COPYRIGHT.md).

## Minerva Operating System 1.98a1

Minerva Operating System  
Copyright (C) yyyy Laurence Reeves

A Minerva é software livre: pode ser redistribuída e/ou modificada nos termos
da GNU General Public License publicada pela Free Software Foundation, versão 2
ou, por opção do destinatário, qualquer versão posterior.

A Minerva é distribuída sem qualquer garantia, incluindo garantias implícitas
de comercialização ou adequação a um fim específico. Consulte a
[GNU GPL versão 2](LICENSE) para conhecer os termos completos.

O aviso acima aplica-se a todos os ficheiros da Minerva, mesmo quando estes não
o repetem individualmente. Foi preservado a partir do
[aviso publicado por Laurence Reeves](https://sinclairql.net/djw/qlrom/min_copyright.txt).

Este componente não altera a licença do código original do emulador. A relação
completa entre binário, código-fonte e proveniência está documentada em
[`third_party/minerva/SOURCE.md`](third_party/minerva/SOURCE.md).

## SingleStepTests/m68000

A amostra de vetores em `tests/fixtures/m68000-v1.json` deriva do corpus
SingleStepTests/m68000, Copyright (c) 2024 SingleStepTests, disponibilizado sob
a licença MIT. A licença integral e a proveniência da versão fixada encontram-se
em [`third_party/m68000-single-step/`](third_party/m68000-single-step/).

## Software da biblioteca

- **SkyQL 1.1** (`local-software/SkyQL.mdv`): © 2026 Luis Cunha,
  código MIT. Segundo o ficheiro `credits` incluído, o catálogo adaptado HYG
  v3.8 é de David Nash / Astronomy Nexus e as figuras de constelações provêm
  da equipa Stellarium (cultura ocidental, v0.22.2). Os dados adaptados são
  CC BY-SA 4.0, com o aviso Free Art License de origem também preservado.
  A fonte font8x8, de Daniel Hepper, é de domínio público; as fórmulas
  astronómicas referenciam Paul Schlyter. A imagem fornecida pelo utilizador
  conserva integralmente os créditos, as transformações descritas e os avisos
  de licença no cartucho.
- **Psion Quill 2.35**, **Abacus 2.35**, **Easel 2.35** e **Archive 2.38**
  (`qui235m.zip`, `aba235m.zip`, `eas235m.zip`, `arc238m.zip`, em `local-software/`):
  © Psion. Cópia gratuita para utilizadores QL, sem fins lucrativos, com
  copyright conservado, segundo o
  [arquivo QL de Dilwyn Jones](https://sinclairql.net/djw/psions/index.html).
  Versões britânicas para Microdrive; os ZIPs fornecidos são preservados.

- **Psion Chess** (`local-software/PsionChess.qlpak`): Richard Lang;
  © 1984 Psion Ltd. — posteriormente disponibilizado pela Psion como freeware.
- **Psion Chess, edição executável** (`local-software/chess_mk.zip`): edição
  atribuída a Jochen Hassler, com correção 3D de Marcel Kilgus, publicada no
  [arquivo QL de Dilwyn Jones](https://sinclairql.net/djw/games/index.html).
  É esta a edição apresentada na biblioteca; conserva os termos próprios do jogo.
- **Spook** (`local-software/Spook.zip`): © 1985 Damon Chaplin — domínio público.
- **Electric Dreams** (`local-software/Electric_Dreams_Melody_QL.mdv`): composição de
  Philip Oakey e Giorgio Moroder; MIDI original sequenciado por Roger St louis,
  (c)1993HM. Imagem preservada sem alterações, incluindo a adaptação da melodia,
  as fontes e o `readme_txt`. Segundo os créditos internos, o leitor e o programa
  de arranque são CC0-1.0; a música e o MIDI conservam os seus direitos existentes.

Autoria e termos de Psion Chess e Spook segundo [QL software, de Daniele Terdina](https://www.terdina.net/ql/software.html),
consultada em 19 de setembro de 2026. Os pacotes são incluídos sem alterações e
conservam estes termos próprios, independentemente da GPL do código do emulador.

## Imagens e marcas

As seis imagens PNG do equipamento em `assets/` foram produzidas com assistência
de IA. As referências, o inventário por ficheiro e as condições de reutilização
são documentados em [assets/PROVENANCE.md](assets/PROVENANCE.md), separadamente
da licença do código.

Referência identificada do teclado: **«Sinclair QL Top.jpg», EWX; retoques de
Ubcule**, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sinclair_QL_Top.jpg),
[CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/).
Foi utilizada para transformação/geração assistida por IA; o resultado não é a
fotografia original. A atribuição não implica aprovação pelos autores.
A licença das adaptações e as permissões das referências do monitor continuam
em revisão no registo visual.

Este é um projeto independente. Os nomes e elementos visuais de Sinclair/QL e
de outros produtos identificam os equipamentos e serviços referidos, sem
afiliação ou aprovação pelos respetivos titulares.

## Referências técnicas e pedagógicas

As seguintes referências são documentadas pela arquitetura do projeto como
fontes de comportamento/formato ou comparação, não como código incorporado:

- *QL Technical Guide* e manual do QL, publicados pela Sinclair Research Ltd.;
  os manuais não são redistribuídos aqui. O guia inclui explicações e exemplos
  SuperBASIC do projeto.
- Manuais Motorola da família MC68000, para o conjunto de instruções.
- MAME, sQLux e núcleo QL do MiSTer, para comparação de comportamento.
- [QLAY2](https://github.com/xXorAa/qlay2) e
  [MicroPicoDrive](https://github.com/gusmanb/micropicodrive), para o formato MDV.
- [Sinclair QL sound pitch and frequency](https://www.kameli.net/marq/?p=1177),
  publicado no sítio de Marq, para medições de som.

O contexto de utilização destas referências está descrito na
[arquitetura](docs/ARCHITECTURE.md). Os componentes efetivamente incluídos têm
registos de origem e licença próprios, identificados acima.
