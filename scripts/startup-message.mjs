import { EMULATOR_URL } from "./open-browser.mjs";

export function startupMessage({ enabled, paused }, { autoOpenBrowser = true } = {}) {
  const chatStatus = enabled ? "Gemini chat: ready."
    : paused ? "Gemini chat: paused. See README before unlocking."
    : "Gemini chat: optional setup is available in the browser.";

  return `
  SINCLAIR QL EMULATOR
  The QL you remember. The conversation you imagined.
  ------------------------------------------------------------

  ${autoOpenBrowser ? "Opening your default browser:" : "Open in your browser:"} ${EMULATOR_URL}
  Fullscreen: choose "Ecrã inteiro" in the emulator.
  On Windows, F11 toggles fullscreen for the whole browser.

  YOUR QL, READY TO EXPLORE
  Use it as a regular QL: write programs, play games and explore.
  The built-in SuperBASIC guide helps you learn by trying examples
  on the emulated machine, from your first commands to Microdrives.

  Load compatible games and programs from:
    .mdv    QLAY Microdrive images
    .qlpak  Q-emuLator software packages
    .zip    QDOS software archives

  AND, IF YOU LIKE, TALK TO THE QL
  In 1985, some of us were twelve and imagined that using a computer
  meant typing a question and getting an answer. We learned BASIC,
  but never quite forgot that idea.

  With optional Gemini-powered QL Chat, that conversation can begin
  on the QL screen. Bring a question. Follow a thought. Be twelve
  again, with a whole new world to ask about.

  The emulator, SuperBASIC guide and software library need no AI
  or API key. Chat is an extra possibility; the QL is yours to use.

  ${chatStatus}
  Keep this terminal open while using the emulator.
  Press Ctrl+C here to stop the emulator server.
`;
}
