# Example software

| File | Authorship | Terms stated by the source |
| --- | --- | --- |
| `SkyQL.mdv` — SkyQL 1.1, planetarium | © 2026 Luis Cunha; data: David Nash / Astronomy Nexus and the Stellarium team | MIT code; adapted data CC BY-SA 4.0; full notices in the cartridge’s `credits` file |
| `qui235m.zip` — Quill 2.35, word processor | © Psion | Free copying for QL users on a non-profit basis; copyright retained |
| `aba235m.zip` — Abacus 2.35, spreadsheet | © Psion | Same terms |
| `eas235m.zip` — Easel 2.35, data graphics | © Psion | Same terms |
| `arc238m.zip` — Archive 2.38, database | © Psion | Same terms |
| `PsionChess.qlpak` | Richard Lang; © 1984 Psion Ltd. | Freeware, later made available by Psion |
| `chess_mk.zip` | Psion Chess: Richard Lang, © 1984 Psion Ltd.; executable edition attributed to Jochen Hassler; 3D fix by Marcel Kilgus | Freeware game edition published in the QL archive |
| `Spook.zip` | © 1985 Damon Chaplin | Public domain |
| `Electric_Dreams_Melody_QL.mdv` | Composition: Philip Oakey and Giorgio Moroder; original MIDI: Roger St louis, (c)1993HM | Player and boot program CC0-1.0; music and MIDI retain existing rights. Credits in `readme_txt` |

Source for Psion Chess and Spook:
[QL software, Daniele Terdina](https://www.terdina.net/ql/software.html),
consulted on 19 September 2026. Files were supplied by the user and are included
unchanged. They retain the terms above; the emulator code’s GPL does not
relicense them.

The four office programs are the British Microdrive versions, supplied by
the user and preserved unchanged. Authorship, versions and copying terms are
listed on [QL Psion Software, by Dilwyn Jones](https://sinclairql.net/djw/psions/index.html).
The library lists Quill, Abacus, Easel and Archive before the games.
**Load and boot** starts the program in MDV1; a writable cartridge in MDV2 can
hold documents and data created on the QL.

The library presents `chess_mk.zip`, obtained from
[Dilwyn Jones’s QL archive](https://sinclairql.net/djw/games/index.html)
on 19 September 2026. The ZIP is unchanged:
SHA-256 `290c832a7b2ccfc77a742151475e0a85a8e465d4668e6c0a51030500b519a403`.
The executable boots without a master cartridge. Importing adds only a BOOT
to the generated Microdrive image, preserving the executable’s bytes.

**Electric Dreams** appears last. The user-supplied cartridge is preserved
byte for byte, including the music player, data, sources and internal credits.
**Load and boot** starts it in MDV1. Enable emulator sound; Esc stops playback.
At the next prompt, R repeats the melody and Q returns to SuperBASIC.

**SkyQL** appears first. The user-supplied image is preserved unchanged,
including `readme` and `credits`. **Load and boot** starts the planetarium in
MDV1. Use arrow keys to move the view, +/− to zoom, F to find an object and Q
to return to SuperBASIC.
