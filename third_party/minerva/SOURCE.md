# Corresponding source code for Minerva 1.98a1

This directory accompanies the image distributed in
[`roms/minerva/minerva-1.98a1.bin`](../../roms/minerva/minerva-1.98a1.bin).

## Pinned source

| Field | Value |
| --- | --- |
| Project | Minerva Sinclair QL operating system |
| Identified author/rights holder | Laurence Reeves |
| Maintenance and publication | Marcel Kilgus |
| Upstream repository | <https://github.com/MarcelKilgus/Minerva> |
| Exact commit | `29e5365f6c0333d47410160a75f66fda3532ff1c` |
| Commit date | 2021-06-30 |
| Local archive | `minerva-source-29e5365.tar.gz` |
| Archive SHA-256 | `895de8f2c016db9331bfe4b8fb12ac846afd96effb014b56cacf0d112b084389` |
| Licence | GPL-2.0-or-later |

`minerva-source-29e5365.tar.gz` is a complete `git archive` of that commit,
including assembly files, build scripts, maps, reference binaries and the
original licence. Corresponding sources therefore remain available in the
same repository and revision that distributes the ROM.

To inspect the sources:

```sh
tar -xzf third_party/minerva/minerva-source-29e5365.tar.gz
```

You can also check the upstream version:

```sh
git clone https://github.com/MarcelKilgus/Minerva.git
git -C Minerva checkout 29e5365f6c0333d47410160a75f66fda3532ff1c
```

## Original build

The sources use QMAC/QLINK/Make tools from the QL ecosystem. The original
process links `ROM/link`, produces the binary and pads it to 48 KiB.
The [historical build instructions](https://sinclairql.net/djw/qlrom/HowTo.txt)
describe a free toolchain available with the SMSQ/E sources.

The official distributed file was checked against the intermediate
`ROM/1.98a1.bin` stored in the commit: the first 48,828 bytes are identical
and the remaining space contains 324 zero bytes.

## Updates

A ROM update must be accompanied in the same change by the exact corresponding
source revision, all new hashes, applicable notices and an updated automated
verifier. A link to moving sources does not replace the local archive.
