import assert from "node:assert/strict";
import test from "node:test";
import { qlKeyDefinition, QL_KEYBOARD, QlKeyboardInput } from "../src/ui/ql-keyboard.js";
import { ZX8302 } from "../src/devices/zx8302.js";

test("mapeia letras, funções e cursores para a matriz física do QL", () => {
  assert.equal(QL_KEYBOARD.keyrowByCode.KeyA, 28);
  assert.equal(QL_KEYBOARD.keyrowByCode.F1, 57);
  assert.equal(QL_KEYBOARD.keyrowByCode.ArrowLeft, 49);
  assert.deepEqual(qlKeyDefinition({ code: "F2" }), {
    keyrow: 59,
    shift: false,
    control: false,
    alt: false,
  });
});

test("conserva modificadores e ignora teclas alheias à matriz", () => {
  assert.deepEqual(qlKeyDefinition({
    code: "KeyP",
    shiftKey: true,
    ctrlKey: true,
    altKey: true,
    metaKey: false,
  }), { keyrow: 29, shift: true, control: true, alt: true });
  assert.equal(qlKeyDefinition({ code: "F12" }), null);
  assert.equal(qlKeyDefinition({ code: "KeyA", metaKey: true }), null);
});

test("traduz Backspace no equivalente Ctrl+seta esquerda do QL", () => {
  assert.deepEqual(qlKeyDefinition({ code: "Backspace" }), {
    keyrow: QL_KEYBOARD.keyrowByCode.ArrowLeft,
    shift: false,
    control: true,
    alt: false,
  });
});

test("o teclado do navegador conserva pressão, repetição e libertação independentes da fila de texto", () => {
  const io = new ZX8302();
  const keyboard = new QlKeyboardInput(io);
  assert.equal(keyboard.keyDown({ code: "ArrowLeft" }), true);
  keyboard.keyDown({ code: "ArrowLeft", repeat: true });
  keyboard.keyDown({ code: "ArrowUp" });
  assert.equal(io.keyboardMatrix[1], 6);
  assert.deepEqual(io.keyboardQueue.map((key) => key.keyrow), [49, 49, 50]);
  keyboard.keyUp({ code: "ArrowLeft" });
  assert.equal(io.keyboardMatrix[1], 4);
  keyboard.keyUp({ code: "ArrowUp" });
  assert.equal(io.keyboardMatrix[1], 0);
  assert.equal(io.keyboardQueue.length, 3);
});

test("modificadores isolados, ambos os Shift e Backspace são visíveis na matriz sem produzir texto extra", () => {
  const io = new ZX8302();
  const keyboard = new QlKeyboardInput(io);
  keyboard.keyDown({ code: "ShiftLeft", shiftKey: true });
  keyboard.keyDown({ code: "ShiftRight", shiftKey: true });
  keyboard.keyUp({ code: "ShiftLeft", shiftKey: true });
  assert.equal(io.keyboardMatrix[7], 1);
  assert.equal(io.keyboardQueue.length, 0);
  keyboard.keyUp({ code: "ShiftRight" });
  keyboard.keyDown({ code: "Backspace" });
  assert.equal(io.keyboardMatrix[1], 2);
  assert.equal(io.keyboardMatrix[7], 2);
  assert.equal(io.keyboardQueue[0].modifiers, 2);
  keyboard.keyUp({ code: "Backspace" });
  assert.equal(io.keyboardMatrix[7], 0);
  keyboard.keyDown({ code: "KeyA", ctrlKey: true, altKey: true });
  assert.equal(io.keyboardMatrix[7], 6);
  keyboard.keyUp({ code: "ControlLeft", altKey: true });
  assert.equal(io.keyboardMatrix[7], 4);
});

test("perder foco ou desligar liberta todas as teclas sem as restaurar no evento seguinte", () => {
  const io = new ZX8302();
  const keyboard = new QlKeyboardInput(io);
  keyboard.keyDown({ code: "ArrowLeft", shiftKey: true });
  keyboard.releaseAll();
  assert.ok(io.keyboardMatrix.every((row) => row === 0));
  keyboard.keyDown({ code: "ArrowRight" });
  assert.equal(io.keyboardMatrix[1], 16);
  assert.equal(io.keyboardMatrix[7], 0);
  assert.equal(keyboard.keyDown({ code: "KeyA", metaKey: true }), false);
  assert.ok(io.keyboardMatrix.every((row) => row === 0));
  assert.equal(keyboard.keyDown({ code: "F12" }), false);
});
