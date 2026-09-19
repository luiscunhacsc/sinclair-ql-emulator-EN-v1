# Third-party component notices

This document collects credits, terms and sources for included components.
See also [authorship and licence scope](COPYRIGHT.md).

## Minerva Operating System 1.98a1

Minerva Operating System  
Copyright (C) yyyy Laurence Reeves

Minerva is free software: it may be redistributed and/or modified under the
GNU General Public License as published by the Free Software Foundation,
version 2 or, at the recipient’s option, any later version.

Minerva is distributed without any warranty, including implied warranties of
merchantability or fitness for a particular purpose. See
[GNU GPL version 2](LICENSE) for the full terms.

The notice applies to all Minerva files, even where not repeated individually.
The [original notice](third_party/minerva/COPYRIGHT) is preserved from the
[notice published by Laurence Reeves](https://sinclairql.net/djw/qlrom/min_copyright.txt).

This component does not change the licence of the emulator’s original code.
The complete relationship between binary, source and provenance is documented in
[`third_party/minerva/SOURCE.md`](third_party/minerva/SOURCE.md).

## SingleStepTests/m68000

The sample vectors in `tests/fixtures/m68000-v1.json` derive from the
SingleStepTests/m68000 corpus, Copyright (c) 2024 SingleStepTests, under the
MIT licence. The full licence and provenance of the pinned revision are in
[`third_party/m68000-single-step/`](third_party/m68000-single-step/).

## Library software

- **SkyQL 1.1** (`local-software/SkyQL.mdv`): © 2026 Luis Cunha, MIT code.
  According to the included `credits` file, the adapted HYG v3.8 catalogue
  is by David Nash / Astronomy Nexus and the constellation figures are from
  the Stellarium team (Western culture, v0.22.2). Adapted data is CC BY-SA 4.0,
  with the original Free Art License notice also preserved. Daniel Hepper’s
  font8x8 is public domain; astronomical formulae reference Paul Schlyter.
  The user-supplied image fully preserves the credits, described transformations
  and licence notices on the cartridge.
- **Psion Quill 2.35**, **Abacus 2.35**, **Easel 2.35** and **Archive 2.38**
  (`qui235m.zip`, `aba235m.zip`, `eas235m.zip`, `arc238m.zip` in
  `local-software/`): © Psion. Free copying for QL users on a non-profit basis,
  with copyright retained, according to
  [Dilwyn Jones’s QL archive](https://sinclairql.net/djw/psions/index.html).
  British Microdrive versions; the supplied ZIPs are preserved.
- **Psion Chess** (`local-software/PsionChess.qlpak`): Richard Lang;
  © 1984 Psion Ltd. — later made available by Psion as freeware.
- **Psion Chess, executable edition** (`local-software/chess_mk.zip`):
  edition attributed to Jochen Hassler, with Marcel Kilgus’s 3D fix, published in
  [Dilwyn Jones’s QL archive](https://sinclairql.net/djw/games/index.html).
  This is the edition shown in the library; it retains the game’s own terms.
- **Spook** (`local-software/Spook.zip`): © 1985 Damon Chaplin — public domain.
- **Electric Dreams** (`local-software/Electric_Dreams_Melody_QL.mdv`):
  composition by Philip Oakey and Giorgio Moroder; original MIDI sequenced by
  Roger St louis, (c)1993HM. Image preserved unchanged, including the melody
  adaptation, sources and `readme_txt`. According to the internal credits,
  the player and boot program are CC0-1.0; the music and MIDI retain their
  existing rights.

Psion Chess and Spook authorship and terms follow
[QL software, by Daniele Terdina](https://www.terdina.net/ql/software.html),
consulted on 19 September 2026. Packages are included unchanged and retain their
own terms independently of the emulator code’s GPL.

## Images and trade marks

The six equipment PNGs in `assets/` were produced with AI assistance.
References, the per-file inventory and reuse conditions are documented in
[assets/PROVENANCE.md](assets/PROVENANCE.md), separately from the code licence.

Identified keyboard reference: **‘Sinclair QL Top.jpg’, EWX; retouched by
Ubcule**, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sinclair_QL_Top.jpg),
[CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/).
It was used for AI-assisted transformation/generation; the result is not the
original photograph. Attribution does not imply endorsement by the authors.
Licensing of adaptations and permissions for the monitor references remain
under review in the visual record.

This is an independent project. Sinclair/QL and other product names and visual
elements identify the equipment and services mentioned, without affiliation
or endorsement by their respective rights holders.

## Technical and teaching references

The project architecture documents these as sources of behaviour/format or
comparison, not as incorporated code:

- *QL Technical Guide* and QL manual, published by Sinclair Research Ltd.;
  the manuals are not redistributed here. The guide contains the project’s
  own explanations and SuperBASIC examples.
- Motorola MC68000 family manuals, for the instruction set.
- MAME, sQLux and the MiSTer QL core, for behaviour comparison.
- [QLAY2](https://github.com/xXorAa/qlay2) and
  [MicroPicoDrive](https://github.com/gusmanb/micropicodrive), for MDV format.
- [Sinclair QL sound pitch and frequency](https://www.kameli.net/marq/?p=1177),
  published on Marq’s site, for sound measurements.

The context of these references is described in the [architecture](docs/ARCHITECTURE.md).
Actually included components have their own origin and licence records, identified above.
