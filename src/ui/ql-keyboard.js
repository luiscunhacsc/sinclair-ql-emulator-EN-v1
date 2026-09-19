const KEYROW_BY_CODE = Object.freeze({
  KeyX: 3,
  KeyV: 4,
  Slash: 5,
  KeyN: 6,
  Comma: 7,
  Digit8: 8,
  Digit2: 9,
  Digit6: 10,
  KeyQ: 11,
  KeyE: 12,
  Digit0: 13,
  KeyT: 14,
  KeyU: 15,
  Digit9: 16,
  KeyW: 17,
  KeyI: 18,
  Tab: 19,
  KeyR: 20,
  Minus: 21,
  KeyY: 22,
  KeyO: 23,
  KeyL: 24,
  Digit3: 25,
  KeyH: 26,
  Digit1: 27,
  KeyA: 28,
  KeyP: 29,
  KeyD: 30,
  KeyJ: 31,
  BracketLeft: 32,
  CapsLock: 33,
  KeyK: 34,
  KeyS: 35,
  KeyF: 36,
  Equal: 37,
  KeyG: 38,
  Semicolon: 39,
  BracketRight: 40,
  KeyZ: 41,
  Period: 42,
  KeyC: 43,
  KeyB: 44,
  Backquote: 45,
  KeyM: 46,
  Quote: 47,
  Enter: 48,
  ArrowLeft: 49,
  ArrowUp: 50,
  Escape: 51,
  ArrowRight: 52,
  Backslash: 53,
  Space: 54,
  ArrowDown: 55,
  F4: 56,
  F1: 57,
  Digit5: 58,
  F2: 59,
  F3: 60,
  F5: 61,
  Digit4: 62,
  Digit7: 63,
});

const MODERN_KEY_ALIASES = Object.freeze({
  Backspace: Object.freeze({ code: "ArrowLeft", control: true }),
});

export function qlKeyDefinition(event) {
  const alias = MODERN_KEY_ALIASES[event.code];
  const keyrow = KEYROW_BY_CODE[alias?.code ?? event.code];
  if (keyrow === undefined || event.metaKey) return null;
  return {
    keyrow,
    shift: Boolean(event.shiftKey),
    control: Boolean(alias?.control || event.ctrlKey),
    alt: Boolean(event.altKey),
  };
}

export const QL_KEYBOARD = Object.freeze({ keyrowByCode: KEYROW_BY_CODE });

const MODIFIER_KEYCODES = Object.freeze({
  ShiftLeft: 0, ShiftRight: 0,
  ControlLeft: 1, ControlRight: 1,
  AltLeft: 2, AltRight: 2,
});

// Keep physical key state separate from the buffered keystrokes used by QDOS.
// Games can poll IPC command 9 repeatedly without consuming a held direction.
export class QlKeyboardInput {
  constructor(device) {
    this.device = device;
    this.held = new Map();
  }

  keyDown(event) {
    if (event.metaKey) {
      this.releaseAll();
      return false;
    }
    const key = qlKeyDefinition(event);
    const modifier = MODIFIER_KEYCODES[event.code];
    if (!key && modifier === undefined) return false;
    this.held.set(event.code, {
      keycode: key?.keyrow ?? modifier,
      controlAlias: Boolean(MODERN_KEY_ALIASES[event.code]?.control),
    });
    this.updateMatrix(event);
    // Preserve browser key-repeat and the existing text/editor input path.
    if (key) this.device.enqueueKey(key.keyrow, key);
    return true;
  }

  keyUp(event) {
    const tracked = this.held.delete(event.code);
    const recognised = tracked || MODIFIER_KEYCODES[event.code] !== undefined;
    if (recognised || this.held.size) this.updateMatrix(event);
    return recognised;
  }

  updateMatrix(event) {
    const keys = [...this.held.values()].map((key) => key.keycode);
    if (event.shiftKey) keys.push(0);
    if (event.ctrlKey || [...this.held.values()].some((key) => key.controlAlias)) keys.push(1);
    if (event.altKey) keys.push(2);
    this.device.setKeyboardState(keys);
  }

  releaseAll() {
    this.held.clear();
    this.device.setKeyboardState([]);
  }
}
