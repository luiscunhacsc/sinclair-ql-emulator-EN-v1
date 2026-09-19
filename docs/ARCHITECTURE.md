# Arquitetura do emulador

## Princípios

1. O comportamento documentado do hardware é a fonte principal.
2. MAME, sQLux e o núcleo MiSTer são usados para comparação, não copiados.
3. CPU, barramento e dispositivos não dependem da interface gráfica.
4. Cada instrução e dispositivo deve ter testes determinísticos.
5. A temporização é contabilizada em ciclos do relógio principal.

## Camadas

- `src/core`: MC68008, barramento, memória, interrupções e relógio.
- `src/devices`: ZX8301, ZX8302, IPC 8049, Microdrives e portas.
- `src/ui`: Canvas, teclado, áudio e controlos do navegador.
- `tests`: testes unitários, programas de diagnóstico e regressões.

## Temporização da CPU e RAM

Os ciclos de `DBcc` seguem a tabela 7-10 do
[manual Motorola, temporização de 8 bits](https://www.nxp.com/docs/en/reference-manual/MC68000UM.pdf):
18 quando o ciclo continua, 20 quando a condição é verdadeira e 26 quando o
contador termina. Estes tempos incluem os acessos ao barramento e preservam
as esperas por software usadas, por exemplo, na apresentação, música e jogo
do Spook. O teste de integração cobre também o intervalo entre as primeiras
notas.

O ZX8301 partilha a RAM interna com a CPU. Cada linha de 480 ciclos contém
32 intervalos de 12 ciclos: oito para vídeo/refresh e quatro para a CPU,
seguidos de 96 ciclos de acesso livre. O barramento faz cada acesso da CPU
à RAM aguardar uma janela completa de quatro ciclos. ROM e periféricos
mantêm os seus acessos próprios; as leituras do renderizador não consomem
tempo da máquina. O refresh continua durante o blanking e nas duas áreas
de RAM. O modelo segue as
[medições de hardware publicadas por Nasta](https://theqlforum.com/viewtopic.php?start=50&t=1780).
Os testes cobrem os limites dessas janelas, leitura e escrita, a apresentação
do Spook e o arranque de Minerva e Psion Chess. Não se aplica um multiplicador
de velocidade por título nem se modifica o software dos cartuchos.

## Mapa inicial

| Intervalo | Função |
| --- | --- |
| `0x00000–0x0BFFF` | ROM interna, 48 KiB |
| `0x0C000–0x0FFFF` | cartucho ROM, 16 KiB |
| `0x10000–0x17FFF` | ROM/expansões |
| `0x18000–0x1FFFF` | dispositivos e espaço reservado |
| `0x20000–0x3FFFF` | RAM interna, 128 KiB |
| `0x40000–0xFFFFF` | RAM e periféricos de expansão |

O descodificador de dispositivos será refinado à medida que ZX8301 e ZX8302
forem implementados. A CPU expõe 20 linhas de endereço, pelo que todos os
endereços são normalizados para 20 bits.

### Primeiro bloco do ZX8301

O barramento encaminha endereços mapeados para dispositivos independentes. O
ZX8301 implementa inicialmente o registo write-only `MC_STAT` (`0x18063`): bit
1 para blanking, bit 3 para MODE 8 e bit 7 para selecionar o banco de display
RAM em `0x20000` ou `0x28000`. Os 32 KiB do banco ativo são convertidos num
frame RGBA de 512 × 256, incluindo a duplicação horizontal do MODE 8 e o estado
de flash que reinicia em cada linha.

Esta implementação segue as secções 10.2 e 10.3 do documento original
[QL Technical Guide](https://8bit-wiki.de/Sinclair/QL/DOKUMENTATIONEN/QL%20Technical%20Guide.pdf),
publicado pela Sinclair Research Ltd.

### Primeiro bloco do ZX8302/IPC

O ZX8302 descodifica os registos de controlo/transmissão (`0x18002`/`0x18003`)
e leitura/interrupt (`0x18020`/`0x18021`). A ligação ao IPC interpreta comandos
e respostas bit a bit, incluindo estado e leitura do buffer do teclado.

O comando IPC `$9` lê o estado atual de uma linha da matriz de teclado,
independentemente do buffer de texto. O navegador mantém esse estado entre
`keydown` e `keyup`, incluindo teclas simultâneas e modificadores. Ao perder
o foco ou desligar o QL, liberta as teclas. Assim, jogos como Spook podem
consultar continuamente os cursores sem depender da repetição do navegador.

Os comandos IPC `$A` e `$B` iniciam e param o som. O primeiro descodifica o
bloco de 64 bits em dois pitches, intervalo, duração, gradiente, wrap,
aleatoriedade e fuzziness; o segundo interrompe-o imediatamente. A duração e o
bit de estado do som avançam com os ciclos emulados. Um gerador independente
produz a onda quadrada e as suas modulações, enquanto um `AudioWorklet` a
entrega ao Web Audio sem bloquear a interface. O `AudioContext` é criado apenas
após uma interação do utilizador e a pausa do emulador congela também o som.

O formato do comando segue a secção 13.0 do
[QL Technical Guide](https://8bit-wiki.de/Sinclair/QL/DOKUMENTATIONEN/QL%20Technical%20Guide.pdf)
e a ordem efetivamente emitida pela fonte da Minerva incluída. As unidades de
72 µs e a semântica dos parâmetros seguem a documentação de `BEEP`; a conversão
de pitch foi calibrada pela relação medida publicada em
[Sinclair QL sound pitch and frequency](https://www.kameli.net/marq/?p=1177).

Os comandos de série ainda não implementados devolvem um estado inativo,
mantendo o fluxo sincronizado.

A interface converte `KeyboardEvent.code` na matriz física inglesa do QL e
entrega até sete definições por comando `rdkb`. Shift, Control e Alt seguem no
nibble de modificadores usado pela rotina de tradução da Minerva.

O mesmo bloco acumula ciclos do processador e levanta `pc.intrf` a 50 Hz. O
barramento agrega o nível pedido pelos dispositivos e apresenta esta fonte ao
MC68008 como interrupção de nível 2; uma escrita de `pc.intrf` em `pc_intr`
reconhece e limpa a fonte.

Na configuração inicial sem cartucho, a linha GAP permanece alta. Ativar a
máscara `pc.maskg` levanta por isso `pc.intrg`; enquanto a máscara continuar
ativa, reconhecer a fonte volta a solicitá-la. Este comportamento permite ao
servidor de Microdrive da Minerva detetar a ausência de meio e terminar a
pesquisa por `boot`/`mdv1_boot`.

### Microdrive: leitura e escrita

`src/devices/microdrive.js` valida e encapsula imagens QLAY `.mdv`. Cada imagem
tem 255 setores de 686 bytes: preâmbulo e cabeçalho, preâmbulo e registo QDOS,
seguidos dos bytes físicos de enchimento. O ZX8302 expõe os 16 bytes de cabeçalho
e os 612 bytes do registo nos endereços de pista `0x18022`/`0x18023`, sinalizando
GAP e buffer de leitura em `0x18020`.

O mapa de registos e os sinais seguem o *QL Technical Guide*. A disposição da
imagem foi também confrontada com o formato publicado pelo
[QLAY2](https://github.com/xXorAa/qlay2) e pelo projeto MIT
[MicroPicoDrive](https://github.com/gusmanb/micropicodrive).

A escrita nos mesmos endereços reproduz `pc.erase` e `pc.write`, os preâmbulos,
os cabeçalhos e os registos físicos emitidos pela ROM. Ao iniciar uma escrita
completa de cabeçalhos (FORMAT), o cartucho gravável passa a usar
um percurso de 254 setores com uma pequena emenda interna não gravável: isto
permite à rotina `FORMAT` detetar a descontinuidade que espera numa fita real,
em vez de rejeitar um percurso artificialmente perfeito. A mesma preparação
aplica-se a imagens importadas e exportadas; montar ou escrever ficheiros
normalmente não altera a geometria nem apaga setores. O formato começa numa
posição determinística para que o mapa não coincida com a emenda. Um teste de integração
arranca a Minerva, executa `FORMAT mdv1_test`, cria um programa com
`SAVE mdv1_demo` e volta a lê-lo com `LOAD` a partir da imagem exportada.

A seleção em cadeia suporta apenas as duas unidades internas e segue o flanco descendente do
relógio COMMS, independentemente dos bits de escrita/apagamento. Cada unidade
conserva a sua posição ao ser desselecionada. O consumo de bytes determina o
fim de cabeçalhos/registos; sondagens repetidas não truncam dados ainda em
leitura. Uma região ignorada continua a expirar por sondagens: o transporte
ainda é uma aproximação, não uma simulação elétrica com temporização exata.
O intervalo de serviço usa agora 31,76 ms por setor (dois gaps de 2,84 ms e
652 bytes a 40 µs, segundo as rotinas `md/read.asm`, `md/write.asm` e
`md/formt.asm` da Minerva incluída). Os 5 ms anteriores faziam a ROM parar
o motor cedo demais: DELETE podia deixar o diretório atualizado apenas na RAM.
O teste de cópia de volta seguido de DELETE verifica a alteração na imagem,
sem usar outro comando DIR para forçar uma gravação posterior.

As luzes da caixa e da biblioteca refletem a seleção dos motores, sem animação
periódica artificial. A biblioteca impede exportação, troca de cartuchos existentes
e alteração da proteção enquanto há uma operação em curso. A inserção numa unidade
vazia e não selecionada continua disponível, mesmo com a outra em uso.
`microdriveActionBlockReason` partilha esta regra entre os botões e os handlers,
incluindo a nova validação após a leitura assíncrona do ficheiro. Uma pausa congela
os motores; a biblioteca permite retomar a execução. RESET limpa a seleção.
Testes com a ROM verificam COPY entre duas unidades, preservação de conteúdo e
metadados de executáveis, LOAD/LRUN sem cache após exportação e nova formatação.
A biblioteca em `src/main.js` permite montar e ejetar cada unidade entre
`mdv1_` e `mdv2_`; os cartuchos são conservados durante RESET. A imagem é
copiada ao montar, pelo que o ficheiro escolhido pelo utilizador nunca é
modificado. Imagens importadas são protegidas contra escrita. Cartuchos virgens
ficam graváveis em memória, assinalam alterações pendentes e podem ser
descarregados como uma nova imagem `.mdv`; a persistência contínua e a fidelidade
de temporização ao nível das duas pistas ficam para marcos seguintes.

### Importação QLPAK/ZIP

`src/formats/zip.js` lê o subconjunto seguro do ZIP clássico utilizado pelos
arquivos QDOS: entradas armazenadas ou Deflate, sem encriptação, volumes
múltiplos ou ZIP64. Os tamanhos e CRC-32 são verificados antes da conversão e
existem limites contra arquivos de descompressão excessiva.

`src/formats/ql-package.js` reconhece a configuração `.QCF`, a pasta `PakDir1`,
o cabeçalho inline `]!QDOS File Header` e o campo ZIP QDOS `0xFB4A`. Os
metadados são transformados em cabeçalhos de diretório QDOS de 64 bytes. Quando
o pacote usa o nome de dispositivo `FLP`, apenas o ficheiro `BOOT` é adaptado de
`flp1_` para a unidade `mdv1_` ou `mdv2_` escolhida. O limite de duas unidades
é partilhado pelo dispositivo, pela importação e pela interface; os pulsos
adicionais de desseleção da ROM não ativam unidades inexistentes.

`src/ui/software-library.js` concentra a identificação, ordenação e apresentação
dos ficheiros suportados. A interface mantém apenas referências aos objetos
`File` selecionados pelo utilizador e só lê os respetivos bytes no momento da
montagem. Escolher outra pasta substitui a lista; adicionar ficheiros ou
arrastá-los para o painel combina-os sem duplicar o mesmo caminho, tamanho e
data de alteração.

`src/formats/microdrive-builder.js` constrói em memória o diretório, mapa de
alocação, blocos de 512 bytes, preâmbulos e somas de verificação de uma imagem
QLAY. A conversão fica limitada à capacidade real do cartucho; pacotes maiores
necessitarão futuramente de um dispositivo de disco ou `WIN`.
Os erros de capacidade indicam setores e KiB por cartucho, explicam que duas
unidades não agregam espaço e mostram RAM, vídeo e disco configurados no QCF,
quando presentes. Não removem componentes nem repartem ficheiros do pacote.

## Marcos

1. Barramento, ROM, RAM e testes de endianess.
2. MC68008: exceções, instruções, modos de endereçamento e ciclos.
3. Arranque da ROM até ao primeiro acesso ao hardware.
4. Vídeo e interrupção de frame.
5. IPC, teclado, som, portas e relógio.
6. Microdrives, imagens persistentes e estados guardados.
7. Suite de compatibilidade e afinação em hardware real.

## Validação do MC68008

O conjunto de instruções é implementado a partir dos manuais Motorola. Além dos
testes unitários pequenos e legíveis deste repositório, o CI executa uma amostra
fixada do corpus [`SingleStepTests/m68000`](https://github.com/SingleStepTests/m68000),
que contém estados completos antes e depois de cada instrução. A amostra atual
tem 56 casos de NOP, MOVEQ, ADD.B, ABCD, Bcc, CLR.W e BTST, escolhidos
deterministicamente a partir do commit
`64b253116a3de04aaac4346c43680960dc9b67e5`. A proveniência e a licença estão
em [`third_party/m68000-single-step/`](../third_party/m68000-single-step/).

`tools/m68000-single-step.mjs` lê diretamente o formato binário `.json.bin`,
reconstrói a memória esparsa de 24 bits, adapta o PC de prefetch do corpus ao PC
arquitetural do núcleo e compara registos, SR, PC, pilhas e todos os bytes de RAM
observáveis. Assim, qualquer ficheiro ou conjunto de ficheiros do corpus pode
ser executado localmente:

```sh
node scripts/run-m68000-conformance.mjs /caminho/m68000/v1/NOP.json.bin
```

O marco inicial exclui casos com o bit de trace ativo, pois o limite de uma
operação no gerador não entra na exceção pós-instrução que `MC68008.step()`
modela. Também exclui transações de erro de endereço (`re`/`we`), que dependem
do estado interno da fila de prefetch do MC68000. O comparador valida por
enquanto o estado arquitetural, não a lista de transações nem a duração. As
diferenças de barramento entre MC68000 e MC68008 serão validadas separadamente.
No QL cada transferência de byte ocupa inicialmente quatro clocks, e uma leitura
de palavra exige duas transferências.

A primeira execução alargada revelou duas divergências. Na correção decimal de
`ABCD`, um ajuste do nibble inferior podia ser confundido com o carry decimal
do byte completo quando os operandos não eram BCD válidos. Além disso, na
descodificação de `BTST Dn,#imediato`, o modo efetivo imediato era rejeitado
antes de a operação testar o bit. O núcleo aceita agora essa codificação, e oito
vetores dedicados de cada grupo mantêm ambas as correções cobertas pelo CI. O
comparador ignora apenas `N` e `V` nas operações BCD e `N` e `Z` no overflow de
divisão, pois essas flags ficam indefinidas nesses casos.

### Modos já implementados

- registo de dados e registo de endereço;
- indireto, pós-incremento e pré-decremento;
- deslocamento de 16 bits e índice breve de 8 bits;
- absoluto curto e longo;
- relativo ao PC, simples e indexado;
- imediato.

O tratamento funcional destes modos está separado da afinação final dos ciclos.
A contenção de memória introduzida pelo ZX8301 será acrescentada na camada do
barramento quando o vídeo estiver operacional.

Os deslocamentos de 16 bits de `BRA`, `Bcc` e `BSR` usam como base o endereço
da palavra de extensão, conforme o MC68000. O endereço de retorno de `BSR.W`
continua a ser o PC posterior à extensão; esta distinção é necessária para a
Minerva entrar corretamente em `SB_START/ini_disp`.
