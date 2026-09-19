# Licences, provenance and distribution

Documentation updated on 19 September 2026.

This record collects sources, distribution precautions and checks for Sinclair
QL Emulator, an independent open-source project. Components retain their own
credits and terms, identified in [COPYRIGHT.md](../COPYRIGHT.md) and
[third-party notices](../THIRD_PARTY_NOTICES.md).

## Documented components

| Component | Measures taken | Record |
| --- | --- | --- |
| Original code and documentation | Authorship identified; GPL-2.0-only included; JavaScript served without minification | [Authorship](../COPYRIGHT.md), [licence](../LICENSE) |
| Minerva 1.98a1 | Original notice preserved; ROM accompanied by source archive pinned to a revision; integrity checked by hashes | [Sources and build](../third_party/minerva/SOURCE.md) |
| MC68000 vectors | Upstream revision pinned; sample transformation documented; full MIT licence included | [Test provenance](../third_party/m68000-single-step/SOURCE.md) |
| Quill, Abacus, Easel, Archive, Psion Chess and Spook | Packages included unchanged, with authorship and availability conditions attributed to sources | [Example software](../local-software/README.md) |
| Equipment illustrations | Keyboard references and credit recorded; per-file SHA-256 inventory | [Visual provenance](../assets/PROVENANCE.md) |
| User data | Local cartridge processing; storage described; personal key separate from distributed code | [Privacy](../PRIVACY.md) |

The Minerva source archive accompanies the distributed binary. The verifier
compares that binary with the one in the reference archive; rebuilding with
QMAC/QLINK is a separate procedure described in the component documentation.
Original notices, including the literal `yyyy` field, are preserved.

## Technical references and identity

The [architecture](ARCHITECTURE.md) documents references used to implement
hardware behaviour and compare results. Cited historical manuals are not part
of the distribution. The guide contains the project’s own explanations and
SuperBASIC examples. Included external components have separate origin,
revision and licence records.

The Sinclair QL name identifies the emulated machine. The interface presents
the project as independent emulation without affiliation or endorsement by
the trade mark holders. Minerva is the included ROM; proprietary QDOS/Sinclair
ROMs are not part of the package.

Sounds are synthesised by code and fonts come from the system. The project
has no npm runtime dependencies; Node.js and the browser are external prerequisites.

<a id="gemini-opcional"></a>
## Optional Gemini

The emulator and local chat demo work without AI services. Gemini uses a
personal key stored on the local server. It requires confirmation of a Free
project, stops chat on quota exhaustion and neither enables billing nor
automatically switches to a paid option.

The [Gemini API additional terms](https://ai.google.dev/gemini-api/terms),
consulted on 19 September 2026, set conditions for age (18+), professional/business
use and regional availability. Making clients available to users in the EEA,
Switzerland or UK requires Paid Services associated with active billing.
This condition differs from the existence of a free quota and remains to be
reconciled with the project’s Free-only configuration before public availability
of the integration.

Technical configuration and provider conditions are documented separately.
[Privacy](../PRIVACY.md) explains the data sent when the user chooses Gemini.

## Distribution preparation record

The [publication inventory](../legal/publication-review.json) preserves each
area’s status and supporting documentation. Under review:

- Licensing of visual adaptations, monitor-reference permissions and the
  correspondence between sources and final images.
- Visual presentation and trade marks in distribution territories.
- Operator identity and data handling if a hosted service is created.
- Final review of sources, references and package notices.
- The regional Gemini availability condition described above.

These records distinguish documented information from matters still requiring
confirmation. The editorial update retains existing statuses and evidence.
The English (UK) localisation does not expand the scope of the recorded legal
review or resolve its outstanding matters.

## Available checks

| Command | Purpose |
| --- | --- |
| `npm run verify:distribution` | Check package files, hashes, sources and notices |
| `npm test` | Run distribution verification and functional tests |
| `npm run audit:legal` | Check the visual inventory and report matters declared under review |

Automatic checks provide package traceability; permission status is supported
by each component’s records and documents.
