import { QL_KEYBOARD } from "./ql-keyboard.js";

const KEY = QL_KEYBOARD.keyrowByCode;

const DIRECT_CHARACTERS = Object.freeze({
  " ": ["Space"],
  "\n": ["Enter"],
  "0": ["Digit0"],
  "1": ["Digit1"],
  "2": ["Digit2"],
  "3": ["Digit3"],
  "4": ["Digit4"],
  "5": ["Digit5"],
  "6": ["Digit6"],
  "7": ["Digit7"],
  "8": ["Digit8"],
  "9": ["Digit9"],
  "-": ["Minus"],
  "=": ["Equal"],
  "[": ["BracketLeft"],
  "]": ["BracketRight"],
  ";": ["Semicolon"],
  "'": ["Quote"],
  ",": ["Comma"],
  ".": ["Period"],
  "/": ["Slash"],
  "\\": ["Backslash"],
});

const SHIFTED_CHARACTERS = Object.freeze({
  "!": "Digit1",
  "@": "Digit2",
  "#": "Digit3",
  "$": "Digit4",
  "%": "Digit5",
  "^": "Digit6",
  "&": "Digit7",
  "*": "Digit8",
  "(": "Digit9",
  ")": "Digit0",
  "_": "Minus",
  "+": "Equal",
  "{": "BracketLeft",
  "}": "BracketRight",
  ":": "Semicolon",
  '"': "Quote",
  "<": "Comma",
  ">": "Period",
  "?": "Slash",
  "|": "Backslash",
  "~": "Backquote",
});

function keyEvent(code, { shift = false, control = false, pauseAfter = 14 } = {}) {
  const keyrow = KEY[code];
  if (keyrow === undefined) throw new Error(`The key ${code} does not exist in the QL matrix.`);
  return { keyrow, shift, control, alt: false, pauseAfter };
}

export function qlKeyForCharacter(character) {
  if (character === "\r") return null;
  if (/^[a-z]$/u.test(character)) return keyEvent(`Key${character.toUpperCase()}`);
  if (/^[A-Z]$/u.test(character)) return keyEvent(`Key${character}`, { shift: true });
  const direct = DIRECT_CHARACTERS[character];
  if (direct) {
    return keyEvent(direct[0], { pauseAfter: character === "\n" ? 90 : 14 });
  }
  const shifted = SHIFTED_CHARACTERS[character];
  if (shifted) return keyEvent(shifted, { shift: true });
  throw new Error(`The character ${JSON.stringify(character)} cannot yet be typed on the QL.`);
}

export function qlTextEvents(text) {
  return [...String(text)].flatMap((character) => {
    const event = qlKeyForCharacter(character);
    return event ? [event] : [];
  });
}

// QDOS/Minerva job 0 may be suspended inside the console line editor. BREAK
// releases that I/O with err.nc ("not complete"); Escape finishes the edit
// normally and discards the unfinished line instead. Inspect the QDOS job and
// channel headers, without depending on ROM instruction addresses.
export function qlLineEditorActive(bus) {
  const inRam = (address, size) => Number.isInteger(address) && address % 2 === 0
    && address >= 0x28000 && address + size <= 0x20000 + bus.ram.length;
  if (!bus.romLoaded || bus.read16(0x28000) !== 0xd254) return false;
  const table = bus.read32(0x28068); // sv_jbbas
  if (!inRam(table, 4)) return false;
  const job = bus.read32(table);
  if (!inRam(job, 0x18) || bus.read16(job + 0x14) === 0) return false;
  const held = bus.read32(job + 0x0c); // jb_hold -> ch_stat
  const channel = held - 0x12;
  return inRam(channel, 0x18) && bus.read8(held) !== 0
    && bus.read8(channel + 0x13) === 4 // io.edlin
    && bus.read32(channel + 0x14) === 0; // ch_jobwt: job 0
}

export function guideExampleEvents(example, { run = false, editingLine = false } = {}) {
  if (!example || !["command", "program"].includes(example.kind)) {
    throw new TypeError("The example must be a SuperBASIC command or program.");
  }

  const source = String(example.code).replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd();
  const events = [editingLine
    ? keyEvent("Escape", { pauseAfter: 280 })
    : keyEvent("Space", { control: true, pauseAfter: 280 })];

  if (example.kind === "program") {
    events.push(...qlTextEvents("NEW\n"));
    events.push(...qlTextEvents(`${source}\n`));
    if (run) events.push(...qlTextEvents("RUN\n"));
  } else {
    events.push(...qlTextEvents(source));
    if (run) events.push(...qlTextEvents("\n"));
  }
  // Long terminal programs need time for Minerva's editor to redraw each line.
  if (example.inputDelay) {
    for (const event of events) {
      event.pauseAfter = Math.max(event.pauseAfter,
        event.keyrow === KEY.Enter ? example.inputDelay.line : example.inputDelay.character);
    }
  }
  return events;
}
