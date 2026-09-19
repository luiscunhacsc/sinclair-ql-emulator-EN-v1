# Sinclair QL Emulator — English (UK)

<a id="contacto-e-respeito-pela-comunidade"></a>
## Contact and respect for the community

> **Contact the author: luis.luiscunha[at]gmail.com**
>
> **Rights and requests to remove components or content**
>
> This project grew out of admiration for the Sinclair QL and the community
> that keeps its history alive. In preparing it, every effort has been made to
> meet the applicable legal and ethical requirements, respecting the rights,
> licences and work of the authors and organisations involved.
>
> If any person or company considers that an included component or item of
> content infringes their rights, or would prefer an element they created or
> own not to be part of the emulator, please contact me, identifying the
> element and the reason for the request. Each case will be considered
> carefully, respectfully and in good faith; following that consideration,
> the elements concerned will be removed from the project.
>
> **Luís Simões da Cunha · author of the emulator**
>
> To write, replace `[at]` with `@`. Thank you for helping preserve this
> history with respect for those who made it possible.
>
> In the application, choose **Contact the author**, beside the credits and licences.

---

A Sinclair QL emulator for the browser, written in JavaScript with no runtime
dependencies. Explore SuperBASIC, write your own programs and rediscover classic
software with two Microdrives. As an optional extra, QL Chat lets you chat
through the QL itself, using a local demo or Gemini with your own personal key.

This edition uses British English for the interface, accessibility labels,
guide, examples, messages and project documentation. Original licence texts,
copyright notices, third-party software, ROMs and source archives are preserved.
Existing lesson identifiers and browser storage keys are retained so that saved
progress, projects and lesson links remain compatible.

The project preserves its components’ credits and licences, ships Minerva with
its source code and verifies distributed file integrity. Cartridges are processed
in the browser; personal Gemini settings stay on the user’s computer.

See [authorship and licences](COPYRIGHT.md), [privacy](PRIVACY.md) and
[in-app credits](legal.html). Sources, checks and matters under review are in the
[distribution record](docs/LEGAL_REVIEW.md).

## Aim

The first target configuration is a Sinclair QL Issue 6:

- MC68008 at 7.5 MHz;
- 128 KiB RAM;
- 48 KiB internal ROM, including the free Minerva ROM distributed by the project;
- ZX8301 and both original video modes;
- ZX8302, Intel 8049/IPC, keyboard, joysticks, sound and RTC;
- two Microdrives using `.mdv` images;
- timing accurate enough to run original software.

The project includes English **Minerva 1.98a1**, under GPL-2.0-or-later, with a
complete, immutable copy of its corresponding source code. Non-free
QDOS/Sinclair ROMs remain deliberately excluded. See [ROMs and licences](roms/README.md)
and [third-party notices](THIRD_PARTY_NOTICES.md).

## Run

Node.js 20.12 or later is required only for the local server and tests.

```sh
npm start
```

When ready, the server opens `http://localhost:8080` in the default browser on
Windows, macOS or Linux. If it does not open, open that address manually.
To start only the server:

```sh
npm run start:server
```

Choose **Full screen** for the emulator’s full screen view. On Windows, **F11**
toggles full screen for the whole browser, keeping the interface available.
The page does not force this at startup: the
[Fullscreen API requires user interaction](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen#security_considerations).
Keep the terminal open while using the emulator; **Ctrl+C** stops the server.

Minerva loads automatically. Set the **OFF / ON** switch to **ON** to power up.
**OFF** cuts the emulated power, clears memory, ends chat and leaves a black
screen. **Restart** performs the same off/on cycle, returning to F1/F2 startup.
Cartridges stay inserted and keep contents already written; programs and
variables held only in RAM are lost. Status appears beside the switch.

In the instructions, **Switch on QL** is also a clickable, underlined shortcut
with a power symbol: it starts or resumes the QL and focuses the screen without
switching off an already running machine. The controls work with Tab, Enter
or Space. **Restart** and sound are beside the main controls. **Advanced controls**
contains single-instruction execution, **Load another ROM** and CPU diagnostics.

Click the screen to send browser keyboard input to the QL. Backspace maps to
Ctrl+left arrow; Ctrl+right arrow deletes under the cursor. **Sound on/off**
controls the emulated speaker; audio starts only after page interaction.
ROMs are processed only in the browser.

**Screen**, **Monitor** and **Full QL** fit the window without distorting
proportions. Full QL shows the cartridges actually mounted in MDV1 and MDV2:
neither, left only, right only or both. The image updates on ejection.

## Interactive guide

During chat, opening **SuperBASIC guide** or the software/Microdrive tools shows
**Back to the classic QL**. Continue chatting or confirm a restart to use the
original machine without AI. Confirmation cancels a pending reply and terminal
loading, clears the program in memory and opens the selected tool. Cartridges
and Gemini settings are kept. Press **F1** at startup to enter SuperBASIC.
The prompt also appears after `/quit` while the terminal program remains in
memory. In normal mode the tools open without restarting.

**SuperBASIC guide**, under **More to explore**, opens beside the emulator on
wide screens or as a compact overlay in smaller windows. Its 32 lessons cover
the manual’s 16 chapters and support search, sequential navigation and direct
links such as `#guia/estrela-de-cores`. Progress is saved locally in the browser.

Each example offers **Load into QL** or **Load and run**. Code is sent gradually
through the emulated IPC keyboard with flow control, visible progress and
cancellation. The guide asks before replacing the SuperBASIC program in memory.
Examples that write to Microdrives show a warning naming the destination
(`mdv1_` or `mdv2_`); FORMAT warns that it erases the cartridge.

The guide covers MDV2 preparation, both directories, LOAD/LRUN, copying in both
directions, DELETE and transferring data through two open channels. Its original
explanations and examples follow the QL manual’s teaching progression without
reproducing its editorial content.

## QL Chat — a terminal with intelligence on the host

Instructions are in **QL Chat**:

1. Use **Switch on QL**, or let chat handle startup automatically.
2. Open **QL Chat** and choose **Google AI Studio**, or the local demo without AI.
3. Choose **Load and start chat** and confirm replacement of the program in
   memory. The window closes so you can watch the SuperBASIC program being typed
   line by line. The loader first enters SuperBASIC, including F1 at startup,
   and checks that the editor is ready. Only then does it send code and advance
   the percentage. Wait for **Terminal ready**.
4. Click the screen, type after `>` and press **Enter**. History is below the monitor.

For Gemini, keep `npm start` running. Visible keyboard loading is always retained.

QL Chat runs a real SuperBASIC terminal: MODE 4, 84 columns, green title, white
text and a separate input area. Minerva uses `ser1ir`; the ZX8302 delivers
messages to the host and receives replies as data. Received text is never
executed as BASIC. Microdrives are not changed. Replacing the previous program
requires confirmation. If SuperBASIC is not ready, loading stops with an error
instead of sending code to the startup screen.

**Local demo** is selected by default and needs no AI, key or provider access.
Keyboard loading takes several tens of seconds; progress is beside the history.
Typing during loading does not interrupt or alter the program; **Restart**
cancels it. **Terminal ready** appears only after SuperBASIC acknowledges startup.
Then use **Type in QL**, type after `>` and press Enter. Failed startup shows
an error and **Try again**. You can choose F1 before opening chat if still at
the Minerva startup screen.

`/new` clears history sent to the model while keeping visible text; `/quit`
closes the connection. **Restart** cancels pending requests, clears memory and
returns to startup; press F1 for SuperBASIC. Backspace retains its QL mapping.

English is recommended. This version decodes the printable ASCII-compatible
subset and the QL’s £ symbol; other input becomes `?`. Accents and Unicode
punctuation in replies become plain text and control characters are filtered.
This is not a complete QL character set conversion. Complete replies are shown
up to 6,000 bytes, without token streaming. Local formatting removes Markdown
heading, bold and italic markers, uses simple lists and preserves code block
contents and indentation. Lines wrap between words with room for `QL:`; only
words or addresses longer than a line are split. Overlong replies end with
`[Reply truncated]`. Formatting does not alter model history or settings.

### Optional Google AI Studio, Free only, on the local server

> The connection is available when configured, without enabling billing.
> Use and availability follow the provider’s conditions in the
> [distribution record](docs/LEGAL_REVIEW.md#optional-gemini).

The fixed model is `gemini-3.5-flash-lite` through the Gemini Developer API.
The [Google pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
lists free input and output on the Free Tier (checked on 16 September 2026).
The project uses **Minimal** thinking, with no additional system instructions,
structured output, code execution, function calling, Google Maps or URL context.
The old companion prompt preferring English and 150-word replies was removed
to match the empty Playground field. QL character conversion stays local.

**Difference from the Playground:** Google Search grounding is disabled.
The same pricing table lists it as unavailable on this model’s API Free Tier,
although it can be tried in AI Studio. The project does not reproduce that
option under its zero-cost requirement. Without search, replies are not
verified on the web and can contain factual errors; removing the prompt does
not guarantee these disappear. The local 1,024-token limit and short history
remain. Temperature and top-p use API defaults because none were specified
in the advanced settings panel. Compare questions using `/new` and a fresh
Playground conversation. Restart `npm start` after updating the server.

Each user needs their own account and key. **Do not publish a shared key on
GitHub, in browser JavaScript or through a public endpoint.** The static page
offers the demo; Gemini requires the local Node server.

To avoid charges, check in AI Studio that **the key’s project is on the Free
plan with billing disabled**, and keep it that way.
[Billing is per project](https://ai.google.dev/gemini-api/docs/billing);
`generateContent` cannot force Free on a paid account. The host cannot verify
this from the key alone and does not change billing. **Local limits and
`confirmed` do not guarantee zero spending on a paid project.** Do not enable
the integration while the plan is uncertain.

**Dialogue setup (recommended):** run `npm start` and open
`http://localhost:8080`. The first-visit introduction explains that chat is
optional. **Continue to the emulator** needs no key: program in SuperBASIC,
load software and try the demo. Reopen **Set up optional Gemini** at the top
or **Set up my Gemini key** in QL Chat.

1. Open [Google AI Studio](https://aistudio.google.com/api-keys) and sign in with
   your own account. Choose **Create API key**, selecting or creating a project
   ([Google instructions](https://ai.google.dev/gemini-api/docs/api-key)).
2. Check the **Free** plan and disabled billing.
3. Paste the key into the protected field, tick the confirmation and choose
   **Save on this computer**. Saving makes no request to Google.

**The project ID is not the API key.** `gen-lang-client-…` identifies a project.
Copy the **API key** value, not the project name, number or ID.

The dialogue writes `GEMINI_API_KEY` and `QL_GEMINI_FREE_ONLY=confirmed` to
**`.env` in the project root**, alongside `package.json`, preserving other
variables and comments. Startup reads the same file. `.gitignore` excludes
`.env` and temporary `.env.*` files from normal Git additions; only the empty
`.env.example` should be versioned. Do not use `git add -f .env`, share the
file or include it in ZIPs or uploads. `.gitignore` does not protect tracked
files. The server blocks HTTP access to `.env`. It is a private text file,
not an encrypted vault. On POSIX it is created with `0600` permissions.

Changes take effect without restarting. Unticking confirmation and saving
empties `QL_GEMINI_FREE_ONLY` and disables Gemini. A blank field keeps the
existing key; **Remove key** empties both variables. This does not revoke the
key at Google. The old `~/.config/sinclair-ql-emulator/.env` is no longer read
or changed; save through the dialogue again to configure this project.
Saving does not remove a quota/configuration suspension. The browser never
stores the key in localStorage or receives it back from the server. The field
is cleared after saving or closing. Only the introduction-seen preference
is saved in the browser.

On a public/static page, key entry is unavailable: setup requires the local
server. There is no shared key or transmission to the author’s server.

**Manual alternative**, alongside `package.json`:

1. If `.env` does not exist, copy `.env.example` to **`.env`**.
2. Obtain your Free project’s API key, not its project ID, and paste it after
   `GEMINI_API_KEY=`.
3. After checking Free and disabled billing, enter `confirmed`:

```dotenv
GEMINI_API_KEY=put_your_private_key_here
QL_GEMINI_FREE_ONLY=confirmed
```

Edit only `.env`; the public template must stay free of keys. On Windows,
check the filename is `.env`, not `.env.txt`. The server blocks HTTP access
to these files. `confirmed` is your declaration, not Google verification or
a billing lock. Old `GROQ_API_KEY` and `QL_GROQ_FREE_ONLY` variables are unused.

Start with `npm start`. The project-root `.env` does not override system
environment values. Restart after manual edits. Without it, or with empty
fields, the emulator and demo work with Gemini disabled. System variables and
`node --env-file=... scripts/serve.mjs` take priority; the dialogue is then
read-only so it cannot falsely report a save.

Open **QL Chat → Google AI Studio** and start. Only messages and short history
go to Google; QL memory and cartridges do not. The key goes from the dialogue
only to the local server, which saves it and authenticates Google requests.
The server listens on loopback, validates Origin and Host, and serves only
public application assets. Do not expose it through a public proxy.

The host permits one request at a time, at least 15 seconds apart, up to 100
requests per UTC day and eight sessions. It keeps at most three recent
message pairs, trimming beyond 6,000 characters while retaining the latest
pair. Counters and history are in memory and disappear on server restart.
Actual quota depends on the project and model; see
[Google rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

**Quota exhausted: stop.** HTTP 429 and other 4xx errors, including key,
permission, billing or unavailable-model errors, block new requests.
`.env.gemini-paused` stores the block, is never published or served over HTTP,
and survives restart. `/new` does not remove it. To unlock, stop the server,
check quota recovery, Free and disabled billing, then manually remove the
file and restart. There are no automatic retries, model switches, alternative
providers, Google Search, paid caching or external tools. Each request
produces at most 1,024 reply tokens. No paid call is made to test the plan.

If chat reports a connection error:

- **Google HTTP 500/503/504:** provider failure, unavailability or delay.
  The HTTP code appears in the terminal; try manually later. These errors
  are not treated as quota exhaustion.
- **LOCAL SERVER DISCONNECTED:** check `npm start` is running; keep its window open.
- **LOCAL SESSION EXPIRED:** the server restarted. Reopen **QL Chat** for a
  new session; that message did not reach Google.
- **GEMINI TIMEOUT / LOCAL SERVER TIMEOUT:** the server waits 45 seconds for
  Google and the browser 55 seconds for the server. Cancellation delivers
  the end-of-reply marker so the QL returns to its prompt.

No automatic resend occurs because Google may already have received a request
when the network fails. Errors never expose internal details or the key.

Serial transport is a virtual byte connection with timed transmission and
batched IPC reception. It does not electrically simulate RS-232, parity or
8049 receive timing. The terminal sends STX after opening SER1 to acknowledge
startup; it never reaches the model. Framing uses LF for requests and ETX for
reply completion. References are the included Minerva sources:
`inc/pc`, `inc/ipcmd`, `ip/int.asm` and `od/ser.asm`.

## Load software

**Software**, under **More to explore**, opens the library. Choose a folder,
add files or drag them into the panel. Only supported formats appear.
**Load and boot** inserts into MDV1, restarts and sends F1. **Choose drive…**
offers **Insert into MDV1** or **Insert into MDV2** without restarting, then
opens the drive manager. **Manage MDV1/MDV2** opens it directly; **New cartridge**
creates and inserts a blank cartridge. Each drive shows its full cartridge
name, activity and brief instructions, with access to the guide.

The library includes these titles from `local-software/`, in this order:

- **SkyQL:** planetarium, © 2026 Luis Cunha. MIT code; catalogue and constellation
  data CC BY-SA 4.0, with credits on the cartridge.
- **Psion Quill 2.35:** word processor.
- **Psion Abacus 2.35:** spreadsheet.
- **Psion Easel 2.35:** data graphics.
- **Psion Archive 2.38:** database.
- **Psion Chess:** Richard Lang; © 1984 Psion Ltd. — freeware.
- **Spook:** © 1985 Damon Chaplin — public domain.
- **Electric Dreams:** music player; composition by Philip Oakey and Giorgio
  Moroder, original MIDI sequenced by Roger St louis. Sources and credits are
  included. Enable sound; Esc stops playback, then R repeats or Q quits.

The office programs are © Psion: free copying for QL users on a non-profit
basis with copyright retained, according to
[Dilwyn Jones’s archive](https://sinclairql.net/djw/psions/index.html).
These Microdrive editions start in MDV1; use writable MDV2 for documents/data.
Game terms follow [QL software, by Daniele Terdina](https://www.terdina.net/ql/software.html).
User-supplied files are unchanged with their [credits](local-software/README.md).

Chess uses `chess_mk.zip` from the [QL archive](https://sinclairql.net/djw/games/index.html):
Jochen Hassler’s executable edition with Marcel Kilgus’s 3D fix. It boots
without a master cartridge; press a key to start, F2 to toggle 3D. The original
`PsionChess.qlpak` is kept but retains the original cartridge mechanism.
The server permits only explicitly listed example files.

The importer preserves ZIP QDOS metadata. For a package with one executable,
it adds a small BOOT to the generated image for the selected drive without
changing the archive. Chess was checked with Minerva and empty MDV2, including
3D view and demo mode.

Supported formats, initially write-protected:

- QLAY `.mdv` images of 174,930 bytes;
- Q-emuLator `.qlpak` packages;
- `.zip` archives, including QDOS executable type and data-space extra fields.

**Allow writing / Protect** controls the mounted cartridge without discarding
earlier changes. The choice is remembered by contents, including exported
copies, not by filename. If storage is unavailable it lasts only for the
session. New cartridges start writable; empty drives omit this control.
**Unsaved changes** is independent: you can export a changed cartridge after
protecting it again.

QLPAK/ZIP decompression and conversion happen locally. In `FLP1` packages,
`BOOT` references adapt to the selected drive; other files are unchanged.
Packages exceeding one cartridge’s capacity are rejected. Conversion does not
support `WIN` disc formats or unimplemented hardware. Errors show per-cartridge
capacity and any QCF RAM/video/disc settings. Two drives do not provide SMSQ/E,
Q60 video or several MiB of RAM.

**Microdrives — start here** prepares MDV1 with FORMAT before saving.
**mdv_ commands** groups preparation/listing, BASIC save/load/merge,
copy/delete, data channels and binaries/executables. It covers `FORMAT`,
`DIR`, `SAVE`, `LOAD`, `LRUN`, `MERGE`, `MRUN`, `COPY`, `COPY_N`,
`DELETE`, `OPEN`, `OPEN_IN`, `OPEN_NEW`, `PRINT`, `INPUT`, `EOF`,
`CLOSE`, `EXEC`, `EXEC_W`, `SBYTES`, `LBYTES` and `SEXEC`.
Advanced examples are reference only; that lesson executes only `DIR mdv1_`.
The sequence covers both drives, copying before loading, exporting and error
recovery. The two-channel exercise checks EOF before reading and closes both
files. The library’s **Microdrive guide** opens the start directly.
ROM and extension commands are distinguished, with links to the
[QL manual](https://www.sinclairql.net/djw/docs/ebooks/olqlug/index.html) and
[SuperBASIC manual](https://superbasic-manual.readthedocs.io/en/latest/).

Click a drive slot in Full QL or the keyboard-accessible **MDV1 / MDV2** buttons
in any view. The manager identifies the drive and lets you switch units;
choosing a cartridge inserts it directly. QL commands still need `mdv1_` or
`mdv2_`. The menu offers **New cartridge**, **My projects**, **Software library**
(files imported this session), **Open from computer…** and, when mounted,
**Save project**, **Export .mdv**, **Protect / Allow writing**, **Eject**.
MDV1 also offers **Restart and boot from MDV1**. **Open software library**
adds files/folders and exits full screen when necessary. Drive slots highlight
on hover/focus and a hint explains access.

**Create and prepare in QL (FORMAT)** creates a blank cartridge and sends FORMAT
through the keyboard. First enter SuperBASIC (F1); it interrupts a running
program. Wait for the motor to stop and check DIR. **Create blank — format
later** allows manual preparation. Existing cartridges require confirmation
before replacement.

**Save project** stores a new complete browser-local copy including protection
and geometry. **My projects** survives reload at the same address in the same
browser. Removing a saved copy does not eject inserted cartridges. Full or
unavailable storage reports failure and keeps previous versions; use
**Export .mdv**. Clearing browser data removes projects.

Prepare a new writable cartridge with:

```basic
FORMAT mdv1_work
SAVE mdv1_program
DIR mdv1_
LOAD mdv1_program
```

A small physical splice lets Minerva FORMAT measure and validate the cartridge
like real tape. Changes remain in memory until exported or saved as a project.
Replacing/ejecting a changed cartridge asks for confirmation; closing the page
shows the browser’s normal warning.

**Restart and boot from MDV1** restarts, sends F1 and looks for `mdv1_boot`.
Inserting does not restart, so you can prepare both units first. Contents stay
in the browser; selected folders/files are never uploaded or modified.

For two cartridges, mount a protected source in MDV1 and writable destination
in MDV2. Only if blank or disposable, use `FORMAT mdv2_work` — it erases it.
With `guide` saved on MDV1, run each command and wait for completion:

```basic
DIR mdv1_ : DIR mdv2_
COPY mdv1_guide TO mdv2_guide
LOAD mdv2_guide
LIST
RUN
```

COPY preserves the QDOS header; COPY_N removes it. To copy back, make MDV1
writable and use `COPY mdv2_guide TO mdv1_guide_copy`, with no existing
destination. Repeat for all files, including BOOT/data. The base ROM has no
whole-cartridge wildcard copy. Use `LRUN mdv1_name` for BASIC and
`EXEC_W mdv1_name` for machine code with a QDOS header.

Red lights follow selected motors, including sector search and ROM-controlled
stopping, as in the [service manual, section 7](https://www.sinclairql.net/srv/qlsm1.html).
QDOS alternates units during copying; two mounted cartridges do not keep both
lights on. Saving/replacing/protecting existing cartridges is temporarily
unavailable while a motor runs, protecting pending writes. An empty, stopped
drive can still receive a new cartridge. **Resume QL to finish the operation**
resumes without closing the library. Pausing freezes motors too; resume so
QDOS can finish, then export every changed drive.

If loading fails, check DIR and **Boot software and recognise errors**.
Do not format software to fix read errors. Toolkit II, other ROMs, discs or
more than 128 KiB RAM may still be required by incompatible software.

## Browse QL Chat

**Chat history** appears below the monitor. **Hide conversation ▲ / Show
conversation ▼** toggles it without losing messages. Outside chat the area
is hidden and takes no space: at startup, after `/quit`, restarting or loading
a guide example. Starting chat opens it again. Separate loading/error messages
keep **Try again** accessible. Under **More to explore**, book and cartridge
icons identify the guide and software, with descriptions and supported formats.

Use mouse wheel, trackpad or swipe. **↑ / ↓** moves one line; **⇈ / ⇊** moves
one page with a line of overlap. When focused, arrows, **Page Up / Page Down**
and **Home / End** also work. Smooth scrolling respects reduced-motion settings.
New replies keep your position while reading older messages. **Latest** shows
the unread count and returns to automatic following. **Type in QL** focuses
the terminal. History holds sent text and delivered replies, including long
ones, in page memory. Leaving hides it; a new terminal or reload clears it.

## Tests

```sh
npm test
npm run test:conformance
```

The first also checks ROM size/hashes, corresponding sources and required
licence notices. The second runs 56 deterministic complete states from
`SingleStepTests/m68000`: NOP, MOVEQ, ADD.B, ABCD, Bcc, CLR.W and BTST, including
register, memory and immediate addressing. Original binaries can be tested:

```sh
node scripts/run-m68000-conformance.mjs /path/to/m68000/v1/NOP.json.bin
```

See [CPU validation](docs/ARCHITECTURE.md#mc68008-validation) for the corpus
revision and comparator limitations.

## Licence

> **Rights or removal requests? Contact the author: luis.luiscunha[at]gmail.com**
>
> If you consider that a component infringes your rights, or would prefer an
> element you created or own not to be included, please contact me. The request
> will be considered carefully, respectfully and in good faith; following that
> consideration, the elements concerned will be removed from the project.
> See the [contact and community notice](#contact-and-respect-for-the-community).
> Replace `[at]` with `@` when writing.

Emulator code is Copyright (C) 2026 Luís Simões da Cunha, under
[GNU GPL version 2 only](LICENSE). Minerva is an independent component by
Laurence Reeves under GPL version 2 or later; its terms, provenance and sources
are identified in [`third_party/minerva/`](third_party/minerva/).

## Status

The project includes the framework, 20-bit bus, initial ROM/RAM map, automatic
Minerva loading and first ZX8301 video block: MC_STAT, blanking, MODE 4/8,
two screen banks and a 512 × 256 RGBA canvas. ZX8302 supplies registers,
bit-serial IPC, virtual SER1/SER2, keyboard, IPC/8049 sound via Web Audio and
the periodic interrupt needed for interactive SuperBASIC.

Both drives support QLAY images, daisy-chain selection, GAP, headers, records
and physical writes through ZX8302. Imported media have adjustable initial
write protection; SuperBASIC can format/write blank cartridges for export.
QLPAK/ZIP packages that fit convert locally with known QDOS metadata preserved.

MC68008 support includes reset, registers, supervisor/user stacks, aligned
access, illegal-instruction exceptions, line A/F emulation, trace, autovectored
interrupts, privilege violations and condition codes. Instructions include
NOP, MOVEQ, MOVE/MOVEA, LEA, CLR, TST, NEG/NEGX, NOT, EXT, SWAP, TAS, SR/CCR/USP
transfers, ADD/ADDA, SUB/SUBA, CMP/CMPA, ADDQ/SUBQ, ADDX/SUBX, ABCD/SBCD/NBCD,
CMPM, MOVEM, MOVEP, MULU/MULS, DIVU/DIVS, CHK, OR, AND, EOR, EXG, bit operations,
shifts/rotates, immediate variants, BRA/Bcc, BSR, DBcc, Scc, JMP, JSR, PEA,
LINK/UNLK, TRAP/TRAPV, RESET, STOP, RTS, RTR and RTE, plus the main MC68000
addressing modes. Coverage will grow against SingleStepTests/m68000; a pinned
56-case sample is already automated.

---

## Contact the author

**Luís Simões da Cunha · luis.luiscunha[at]gmail.com**

For rights, content or removal requests, identify the element and reason.
Each case will be considered carefully, respectfully and in good faith;
following that consideration, the elements concerned will be removed.

Replace `[at]` with `@`. See the
[contact and community notice](#contact-and-respect-for-the-community).
Thank you for preserving QL history with respect for its authors and community.
