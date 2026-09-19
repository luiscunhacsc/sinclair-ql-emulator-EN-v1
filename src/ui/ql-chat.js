import { markdownToQlText, wrapQlText, limitQlReply } from "./ql-chat-format.js";

// The first terminal uses the shared printable ASCII subset of the QL charset.
// QL byte 96 is pound sterling, not the ASCII grave accent. Extended bytes
// are deliberately not decoded as UTF-8 or Latin-1.
export function decodeQlText(bytes) {
  return Array.from(bytes, (byte) => byte === 96 ? "£"
    : byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "?").join("");
}

export function encodeQlText(text) {
  const replacements = { "£": "GBP", "€": "EUR", "œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE", "ß": "ss", "ø": "o", "Ø": "O", "…": "...", "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "`": "'" };
  const plain = String(text).replace(/\r\n?/g, "\n")
    .replace(/[£€œŒæÆßøØ…‘’“”–—`]/g, (c) => replacements[c])
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/\t/g, "  ").replace(/[^\x20-\x7e\n]/g, "?");
  return new TextEncoder().encode(plain);
}

export function chatTerminalExample(provider = "demo") {
  const label = provider === "gemini" ? "GEMINI 3.5 FLASH-LITE" : "LOCAL DEMO - NO AI";
  return {
    kind: "program", title: "QL Chat", inputDelay: { character: 20, line: 500 }, code: [
      "100 MODE 4",
      "102 BORDER #0,0 : BORDER #1,0 : BORDER #2,0",
      "104 WINDOW #2,512,256,0,0 : PAPER #2,0 : CLS #2",
      "110 WINDOW #0,504,30,4,222 : PAPER #0,0 : INK #0,4 : CSIZE #0,0,0 : CLS #0",
      "120 WINDOW #1,504,200,4,20 : PAPER #1,0 : INK #1,7 : CSIZE #1,0,0 : CLS #1",
      "130 WINDOW #2,504,16,4,2 : PAPER #2,0 : INK #2,4 : CSIZE #2,0,0 : CLS #2",
      `140 PRINT #2,"QL CHAT | ${label} | /new /quit"`,
      '150 PRINT #1,"English recommended for best character compatibility."',
      "160 OPEN #3,ser1ir",
      '165 PRINT #3,CHR$(2);',
      "170 REPeat conversation",
      '180   CLS #0 : INPUT #0,"> "; question$',
      '190   IF question$ = "" THEN NEXT conversation',
      "200   PRINT #3,question$",
      '210   IF question$ = "/quit" THEN EXIT conversation',
      '220   INK #1,4 : PRINT #1,"YOU: ";question$',
      '230   CLS #0 : PRINT #0,"THINKING..."',
      '240   INK #1,7 : PRINT #1,"QL: ";',
      "250   REPeat answer",
      "260     LET ch$ = INKEY$(#3,-1)",
      "270     IF ch$ = CHR$(3) THEN EXIT answer",
      "280     PRINT #1,ch$;",
      "290   END REPeat answer",
      "300   PRINT #1 : PRINT #1",
      "310 END REPeat conversation",
      "320 CLOSE #3 : CLS #0",
      '330 PRINT #0,"Chat closed. Restart the QL to restore its normal windows."',
    ].join("\n"),
  };
}

// LF delimits requests; ETX ends replies. Only this bridge can emit ETX.
// Replies remain data, including quotes, BASIC commands and control characters.
export class QLChatBridge {
  constructor({ device, reply, onStatus = () => {}, onMessage = () => {} }) {
    this.device = device;
    this.reply = reply;
    this.onStatus = onStatus;
    this.onMessage = onMessage;
    this.active = true;
    this.ready = false;
    this.line = [];
    this.overflow = false;
    this.controller = null;
  }

  stop() {
    this.active = false;
    this.ready = false;
    this.controller?.abort();
    this.line = [];
    this.device.serialReceive[0].length = 0;
  }

  transmit({ port, byte }) {
    if (!this.active || port !== 1) return;
    // STX is emitted by the BASIC program after OPEN; it never reaches the LLM.
    if (byte === 2 && !this.ready && this.line.length === 0) { this.ready = true; return; }
    if (byte === 13) return;
    if (byte !== 10) {
      if (this.line.length < 1024) this.line.push(byte);
      else this.overflow = true;
      return;
    }
    const prompt = decodeQlText(this.line);
    const overflow = this.overflow;
    this.line = [];
    this.overflow = false;
    if (prompt === "/quit") { this.stop(); this.onStatus("Chat fechado."); return; }
    if (this.controller) return; // The terminal sends one request at a time.
    this.onMessage({ role: "user", text: prompt });
    void this.respond(prompt, overflow);
  }

  async respond(prompt, overflow) {
    const controller = new AbortController();
    this.controller = controller;
    this.onStatus("O QL está à espera da resposta do host…");
    let text;
    try {
      text = overflow ? "Message too long (maximum 1024 characters)."
        : await this.reply(prompt, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      text = error.message || "Host unavailable. Please try again.";
    } finally {
      if (this.controller === controller) this.controller = null;
    }
    if (!this.active || controller.signal.aborted) return;
    // Measure after transliteration (e.g. £ becomes GBP). Format only the
    // display copy; the model keeps its original conversation contents.
    const plain = new TextDecoder().decode(encodeQlText(markdownToQlText(text)));
    const bytes = new TextEncoder().encode(limitQlReply(wrapQlText(plain)));
    const framed = new Uint8Array(bytes.length + 1);
    framed.set(bytes);
    framed[bytes.length] = 3;
    if (!this.device.receiveSerial(1, framed)) {
      this.onStatus("O terminal deixou de aceitar dados. Reinicie o chat.");
    } else {
      this.onMessage({ role: "assistant", text: new TextDecoder().decode(bytes) });
      this.onStatus("Resposta entregue ao QL.");
    }
  }
}

export function localDemoReply(prompt) {
  if (prompt === "/new") return "New conversation. Local demo: no API calls are made.";
  return `The QL sent your message through SER1:\n${prompt}\n\nThis is a local connection test, not an AI reply. Choose Google AI Studio in the chat settings to connect a model.`;
}
