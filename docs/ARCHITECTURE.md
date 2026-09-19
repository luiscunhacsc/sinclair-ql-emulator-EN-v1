# Emulator architecture

## Principles

1. Documented hardware behaviour is the primary source.
2. MAME, sQLux and the MiSTer core are used for comparison, not copied.
3. CPU, bus and devices are independent of the graphical interface.
4. Every instruction and device should have deterministic tests.
5. Timing is accounted for in main clock cycles.

## Layers

- `src/core`: MC68008, bus, memory, interrupts and clock.
- `src/devices`: ZX8301, ZX8302, IPC 8049, Microdrives and ports.
- `src/ui`: Canvas, keyboard, audio and browser controls.
- `tests`: unit tests, diagnostic programs and regressions.

## CPU and RAM timing

DBcc cycles follow table 7-10 of the
[Motorola manual, 8-bit timing](https://www.nxp.com/docs/en/reference-manual/MC68000UM.pdf):
18 when the loop continues, 20 when the condition is true and 26 when the
counter expires. These include bus accesses and preserve software delays used,
for example, in Spook’s introduction, music and gameplay. The integration test
also covers the interval between the first notes.

ZX8301 shares internal RAM with the CPU. Each 480-cycle line has 32 slots of
12 cycles: eight for video/refresh and four for the CPU, followed by 96 cycles
of unrestricted access. The bus makes each CPU RAM access wait for a complete
four-cycle window. ROM and peripherals retain their own accesses; renderer
reads do not consume machine time. Refresh continues during blanking and in
both RAM areas. The model follows
[Nasta’s published hardware measurements](https://theqlforum.com/viewtopic.php?start=50&t=1780).
Tests cover window boundaries, reading/writing, Spook’s introduction and
Minerva/Psion Chess startup. No per-title speed multiplier or cartridge
software modification is applied.

## Initial map

| Range | Function |
| --- | --- |
| `0x00000–0x0BFFF` | Internal ROM, 48 KiB |
| `0x0C000–0x0FFFF` | ROM cartridge, 16 KiB |
| `0x10000–0x17FFF` | ROM/expansions |
| `0x18000–0x1FFFF` | Devices and reserved space |
| `0x20000–0x3FFFF` | Internal RAM, 128 KiB |
| `0x40000–0xFFFFF` | Expansion RAM and peripherals |

Device decoding will be refined as ZX8301 and ZX8302 implementation develops.
The CPU exposes 20 address lines, so all addresses are normalised to 20 bits.

### First ZX8301 block

The bus routes mapped addresses to independent devices. ZX8301 initially
implements the write-only MC_STAT register (`0x18063`): bit 1 for blanking,
bit 3 for MODE 8 and bit 7 to select the display RAM bank at `0x20000` or
`0x28000`. The active 32 KiB bank is converted to a 512 × 256 RGBA frame,
including MODE 8 horizontal duplication and flash state reset on each line.

This follows sections 10.2 and 10.3 of the original
[QL Technical Guide](https://8bit-wiki.de/Sinclair/QL/DOKUMENTATIONEN/QL%20Technical%20Guide.pdf),
published by Sinclair Research Ltd.

### First ZX8302/IPC block

ZX8302 decodes control/transmit registers (`0x18002`/`0x18003`) and
read/interrupt registers (`0x18020`/`0x18021`). The IPC link interprets
commands and replies bit by bit, including keyboard buffer status and reading.

IPC command $9 reads the current state of a keyboard matrix row independently
of the text buffer. The browser maintains that state between keydown and keyup,
including simultaneous keys and modifiers. Losing focus or switching off
releases keys. Games such as Spook can therefore poll arrow keys continuously
without relying on browser repeat.

IPC commands $A and $B start and stop sound. The first decodes the 64-bit block
into two pitches, interval, duration, gradient, wrap, randomness and fuzziness;
the second stops it immediately. Duration and the sound status bit advance
with emulated cycles. An independent generator produces the square wave and
modulation, while an AudioWorklet delivers it to Web Audio without blocking
the interface. AudioContext is created only after user interaction; pausing
emulation also freezes sound.

The format follows section 13.0 of the
[QL Technical Guide](https://8bit-wiki.de/Sinclair/QL/DOKUMENTATIONEN/QL%20Technical%20Guide.pdf)
and the actual order emitted by the included Minerva source. The 72 µs units
and parameter semantics follow BEEP documentation; pitch conversion was
calibrated against measurements in
[Sinclair QL sound pitch and frequency](https://www.kameli.net/marq/?p=1177).

Serial commands not yet implemented return inactive status, keeping the stream
synchronised.

The interface maps KeyboardEvent.code to the physical English QL matrix and
delivers up to seven definitions per rdkb command. Shift, Control and Alt use
the modifier nibble expected by Minerva’s translation routine.

The block accumulates processor cycles and raises pc.intrf at 50 Hz. The bus
aggregates device interrupt levels and presents this source as MC68008 level 2;
writing pc.intrf to pc_intr acknowledges and clears it.

With no cartridge, GAP stays high. Enabling pc.maskg therefore raises pc.intrg;
while the mask stays active, acknowledgement requests it again. This lets
Minerva’s Microdrive server detect missing media and end its search for
boot/mdv1_boot.

### Microdrive reading and writing

`src/devices/microdrive.js` validates and encapsulates QLAY .mdv images.
Each has 255 sectors of 686 bytes: preamble/header, preamble/QDOS record, then
physical padding bytes. ZX8302 exposes the 16 header bytes and 612 record bytes
at track addresses `0x18022`/`0x18023`, signalling GAP and read buffer at
`0x18020`.

Registers and signals follow the QL Technical Guide. Image layout was also
compared with formats published by [QLAY2](https://github.com/xXorAa/qlay2)
and the MIT [MicroPicoDrive](https://github.com/gusmanb/micropicodrive) project.

Writes to the same addresses reproduce pc.erase, pc.write, preambles, headers
and physical records emitted by the ROM. Starting a complete header write
(FORMAT) changes a writable cartridge to a 254-sector track with a small
internal unwritable splice. This lets FORMAT detect the discontinuity expected
on real tape instead of rejecting an artificially perfect track. The same
preparation applies to imported/exported images; mounting or ordinary file
writes do not change geometry or erase sectors. Formatting starts at a
deterministic position so the allocation map avoids the splice. An integration
test boots Minerva, runs FORMAT mdv1_test, creates a program with SAVE mdv1_demo
and reads it back with LOAD from the exported image.

Daisy-chain selection supports only the two internal drives and follows the
falling COMMS clock edge independently of write/erase bits. Each drive retains
its position when deselected. Byte consumption determines header/record ends;
repeated polling does not truncate data still being read. Ignored regions
still expire through polling: transport remains an approximation, not an
electrical simulation with exact timing.

The service interval is now 31.76 ms per sector: two 2.84 ms gaps and 652 bytes
at 40 µs, following included Minerva md/read.asm, md/write.asm and md/formt.asm.
The previous 5 ms interval stopped the motor too early: DELETE could update
the directory only in RAM. The copy-back-then-DELETE test checks the image
change without another DIR command forcing a later write.

Case and library lights reflect motor selection, without artificial periodic
animation. The library blocks export, replacement of existing cartridges and
protection changes during an operation. Insertion into an empty, unselected
drive remains possible while the other is busy. microdriveActionBlockReason
shares this rule between buttons and handlers, including revalidation after
asynchronous file reading. Pausing freezes motors; the library can resume.
RESET clears selection.

ROM tests check two-drive COPY, executable contents/metadata, uncached
LOAD/LRUN after export and reformatting. The library in src/main.js mounts
and ejects both drives; cartridges survive RESET. Mounting copies the image,
so the chosen file is never modified. Imported images are write-protected.
Blank cartridges are writable in memory, report pending changes and can be
downloaded as a new .mdv. Continuous persistence and timing fidelity at the
two-track level remain future milestones.

### QLPAK/ZIP import

`src/formats/zip.js` reads the safe classic ZIP subset used by QDOS archives:
stored/Deflate entries without encryption, multiple volumes or ZIP64.
Sizes and CRC-32 are checked before conversion, with limits against excessive
decompression.

`src/formats/ql-package.js` recognises .QCF configuration, PakDir1, the inline
`]!QDOS File Header` and ZIP QDOS field `0xFB4A`. Metadata becomes 64-byte
QDOS directory headers. For FLP packages, only BOOT is adapted from flp1_ to
the chosen mdv1_ or mdv2_. The two-drive limit is shared by device, importer
and interface; extra ROM deselection pulses do not activate nonexistent drives.

`src/ui/software-library.js` centralises supported-file identification,
sorting and display. The interface keeps references to selected File objects
and reads bytes only on mounting. Choosing another folder replaces the list;
adding or dragging files merges them without duplicating path/size/modification
date combinations.

`src/formats/microdrive-builder.js` builds the directory, allocation map,
512-byte blocks, preambles and checksums of a QLAY image in memory. Conversion
is limited to real cartridge capacity; larger packages will need a future disc
or WIN device. Capacity errors show sectors/KiB per cartridge, explain that
two units do not combine their space and show QCF RAM/video/disc configuration
when present. They neither remove components nor split package files.

## Milestones

1. Bus, ROM, RAM and endianness tests.
2. MC68008: exceptions, instructions, addressing modes and cycles.
3. ROM startup to the first hardware access.
4. Video and frame interrupt.
5. IPC, keyboard, sound, ports and clock.
6. Microdrives, persistent images and saved states.
7. Compatibility suite and tuning against real hardware.

<a id="validação-do-mc68008"></a>
## MC68008 validation

The instruction set is implemented from Motorola manuals. Alongside small,
readable unit tests, CI runs a pinned sample of
[SingleStepTests/m68000](https://github.com/SingleStepTests/m68000), which holds
complete before/after instruction states. The current sample has 56 NOP,
MOVEQ, ADD.B, ABCD, Bcc, CLR.W and BTST cases selected deterministically from
commit `64b253116a3de04aaac4346c43680960dc9b67e5`. Provenance and licence are in
[`third_party/m68000-single-step/`](../third_party/m68000-single-step/).

`tools/m68000-single-step.mjs` reads .json.bin directly, reconstructs sparse
24-bit memory, adapts corpus prefetch PC to the core’s architectural PC and
compares registers, SR, PC, stacks and every observable RAM byte. Any corpus
file or group can be run locally:

```sh
node scripts/run-m68000-conformance.mjs /path/to/m68000/v1/NOP.json.bin
```

The initial milestone excludes trace-bit cases because the generator’s single
operation boundary does not enter the post-instruction exception modelled by
MC68008.step(). It also excludes address-error transactions (re/we) dependent
on MC68000 prefetch queue state. The comparator currently checks architectural
state, not transaction lists or duration. MC68000/MC68008 bus differences will
be checked separately. Initially each QL byte transfer occupies four clocks;
a word read needs two transfers.

The first extended run found two discrepancies. In ABCD decimal correction,
a lower-nibble adjustment could be mistaken for full-byte decimal carry with
invalid BCD operands. Also, BTST Dn,#immediate decoding rejected immediate EA
before testing the bit. The core now accepts this encoding; eight dedicated
vectors from each group keep both fixes covered in CI. The comparator ignores
only N/V for BCD and N/Z on division overflow, as those flags are undefined.

### Implemented modes

- Data and address registers.
- Indirect, post-increment and pre-decrement.
- 16-bit displacement and brief 8-bit index.
- Short and long absolute.
- Plain and indexed PC-relative.
- Immediate.

Functional handling of these modes is separate from final cycle tuning.
ZX8301 memory contention belongs in the bus layer when video is operational.

The 16-bit BRA/Bcc/BSR displacements use the extension word’s address as the
base, as on MC68000. BSR.W’s return address remains the PC after the extension;
this distinction is needed for Minerva to enter SB_START/ini_disp correctly.
