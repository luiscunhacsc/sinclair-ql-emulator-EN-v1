# Data and privacy

Updated on 19 September 2026. This document describes local execution of the
emulator through `npm start`.

## Emulator and files

Selected ROMs and cartridges are read in the browser. Their contents are not
sent to the project author or Google. Exporting a cartridge creates a download,
preserving the original file. The application includes no user accounts,
advertising, telemetry, remote fonts or analytics tools.

The browser stores the following data in `localStorage`:

| Key | Contents and purpose |
| --- | --- |
| `sinclair-ql-presentation` | Selected view |
| `sinclair-ql-sound` | Sound preference |
| `sinclair-ql-guide-progress` | Identifiers of lessons tried |
| `sinclair-ql-microdrive-protection` | SHA-256 hash and cartridge protection preference; this record contains neither files nor filenames |
| `sinclair-ql-project:…` | User-saved projects: name, date, complete cartridge contents and image properties |
| `sinclair-ql-welcome-seen` | Whether the introduction has been seen; no secrets |

This data stays in the browser until removed. Projects can be deleted in the
manager; other records can be removed in site data settings. Before clearing
data, export cartridges you want to keep. The application does not transmit
these records and does not use analytics cookies.

## Local conversation and Gemini

The local demo works without AI, an API key or sending messages to providers.
Visible history remains in page memory and disappears on reload. `/new`
starts a new logical conversation while keeping visible history.

Gemini is an additional option selected by the user. When used, it receives
messages and recent context through the local server. The server keeps up to
eight sessions in memory and does not write transcripts to files.
`/new` clears session context; leaving chat does not immediately delete all
sessions held by the process. Restarting the server clears that memory.

Data sent to Google is handled under the
[Gemini API terms](https://ai.google.dev/gemini-api/terms).
Conditions for making the integration available are described in the
[distribution record](docs/LEGAL_REVIEW.md#optional-gemini).

## Personal key and settings

Each user obtains their own key through their account in
[Google AI Studio](https://aistudio.google.com/api-keys). The project does not
distribute a shared key. Setup requires confirmation of a Free project;
it neither enables billing nor automatically falls back to a paid option.

The setup dialogue saves the key and confirmation to `.env` alongside
`package.json`. Configuration is protected by these measures:

- `.gitignore` excludes `.env` from normal Git additions.
- The web server blocks access to the file.
- The key is sent from the protected field to the local server, never returned
  in responses or saved in browser storage.
- The field is cleared when the dialogue is saved or closed.
- Saving does not contact Google; the key is used when the user chooses Gemini chat.

`.env` is an unencrypted local file. Restrict access to the folder and exclude
it from shared archives or copies; Git rules do not filter ZIP files or forced
additions. You can remove the saved key in the same dialogue. Revoking it in
your Google account is a separate operation.

## Scope of a public installation

This description concerns the local server. A publicly hosted installation
must document its operator, contact, providers, access logs and retention
periods. The chat server is designed for use on the user’s computer, not
exposure through a public proxy.

Questions about operation can be raised in the
[project repository](https://github.com/luiscunhacsc/sinclair-ql-emulator-main).
In a public issue, share only necessary technical information, without API
keys or personal data.
