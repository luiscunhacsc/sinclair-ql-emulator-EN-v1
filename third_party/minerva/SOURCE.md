# Código-fonte correspondente da Minerva 1.98a1

Este diretório acompanha a imagem distribuída em
[`roms/minerva/minerva-1.98a1.bin`](../../roms/minerva/minerva-1.98a1.bin).

## Fonte fixada

| Campo | Valor |
| --- | --- |
| Projeto | Minerva Sinclair QL operating system |
| Autor/titular indicado | Laurence Reeves |
| Manutenção e publicação | Marcel Kilgus |
| Repositório original | <https://github.com/MarcelKilgus/Minerva> |
| Commit exato | `29e5365f6c0333d47410160a75f66fda3532ff1c` |
| Data do commit | 2021-06-30 |
| Arquivo local | `minerva-source-29e5365.tar.gz` |
| SHA-256 do arquivo | `895de8f2c016db9331bfe4b8fb12ac846afd96effb014b56cacf0d112b084389` |
| Licença | GPL-2.0-or-later |

`minerva-source-29e5365.tar.gz` é um `git archive` completo do commit indicado,
incluindo os ficheiros de montagem, scripts de construção, mapas, binários de
referência e a licença original. Assim, as fontes correspondentes permanecem
disponíveis no mesmo repositório e na mesma revisão que distribui a ROM.

Para inspecionar as fontes:

```sh
tar -xzf third_party/minerva/minerva-source-29e5365.tar.gz
```

Também é possível confirmar o original:

```sh
git clone https://github.com/MarcelKilgus/Minerva.git
git -C Minerva checkout 29e5365f6c0333d47410160a75f66fda3532ff1c
```

## Construção original

As fontes usam as ferramentas QMAC/QLINK/Make do ecossistema QL. O processo
original liga `ROM/link`, produz o binário e completa-o até 48 KiB. As
[instruções históricas de compilação](https://sinclairql.net/djw/qlrom/HowTo.txt)
indicam uma cadeia de ferramentas livre disponível com as fontes de SMSQ/E.

O ficheiro oficial distribuído foi verificado contra o resultado intermédio
`ROM/1.98a1.bin` guardado no commit: os primeiros 48 828 bytes são idênticos e
o restante espaço contém 324 bytes nulos.

## Atualizações

Uma atualização da ROM deve ser acompanhada, na mesma alteração, pela revisão
exata das fontes correspondentes, todos os novos hashes, os avisos aplicáveis e
uma atualização do verificador automático. Um simples link para fontes móveis
não substitui o arquivo local.
