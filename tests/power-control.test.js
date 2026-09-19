import test from "node:test";
import assert from "node:assert/strict";
import { PowerControl, powerOffMachine } from "../src/ui/power-control.js";
import { readFile } from "node:fs/promises";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { qlLineEditorActive } from "../src/ui/ql-text-input.js";

class Button extends EventTarget {
  attributes = {};
  status = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector() { return this.status; }
  closest() { return this.dialog; }
  click() { this.dispatchEvent(new Event("click")); }
}

function harness() {
  const toggle = new Button();
  const actions = [new Button(), new Button(), new Button()];
  const state = { enabled: true, running: false, started: false };
  const calls = [];
  const control = new PowerControl({
    toggle, actions, state: () => state,
    start: () => { calls.push("start"); state.running = state.started = true; control.update(); },
    stop: () => { calls.push("stop"); state.running = state.started = false; control.update(); },
    focusScreen: () => calls.push("focus"),
  });
  control.update();
  return { toggle, actions, state, calls, control };
}

test("switch cuts power even when the CPU has halted, and reflects a fresh startup", () => {
  const { toggle, state, calls, control } = harness();
  assert.equal(toggle.attributes["aria-checked"], "false");
  toggle.click();
  assert.equal(toggle.attributes["aria-checked"], "true");
  state.running = false;
  control.update();
  assert.equal(toggle.attributes["aria-checked"], "true", "a halted CPU is still powered on");
  toggle.click();
  assert.equal(toggle.attributes["aria-checked"], "false");
  assert.equal(state.started, false);
  assert.equal(toggle.status.textContent, "Desligado");
  toggle.click();
  assert.deepEqual(calls, ["start", "stop", "start"]);
  // Other reset paths must also update the power state.
  state.running = state.started = false;
  control.update();
  assert.equal(toggle.attributes["aria-checked"], "false");
  assert.equal(toggle.status.textContent, "Desligado");
});

test("instruction shortcuts are idempotent and leave a modal before focusing the QL", () => {
  const { actions, calls, toggle } = harness();
  actions[0].click();
  actions[1].click();
  actions[2].dialog = { close() { calls.push("close"); } };
  actions[2].click();
  assert.deepEqual(calls, ["start", "focus", "focus", "close", "focus"]);
  assert.equal(toggle.attributes["aria-checked"], "true");
  toggle.click();
  actions[0].click();
  assert.deepEqual(calls.slice(-3), ["stop", "start", "focus"]);
});

test("all power actions remain unavailable until a ROM is ready", () => {
  const { toggle, actions, state, calls, control } = harness();
  state.enabled = false;
  control.update();
  for (const button of [toggle, ...actions]) {
    assert.equal(button.disabled, true);
    button.click();
  }
  assert.deepEqual(calls, []);
  state.enabled = true;
  control.update();
  for (const button of [toggle, ...actions]) assert.equal(button.disabled, false);
});

test("power off stops immediately, drains cancelled input and cold-boots Minerva with no previous RAM or I/O", async () => {
  const io = new ZX8302();
  const video = new ZX8301();
  const bus = new QLBus({ devices: [video, io] });
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  const cpu = new MC68008(bus);
  cpu.reset();
  const bootCycles = cpu.cycles;
  const bootPc = cpu.pc;
  cpu.cycles += 50_000;
  cpu.d[0] = 123;
  bus.ram.fill(0x7f);
  io.enqueueKey(57);
  io.serialOpen[0] = true;
  io.serialReceive[0].push(42);
  let release;
  const order = [];
  const loading = new Promise((resolve) => { release = resolve; }).then(() => {
    order.push("loader finished");
    bus.ram[0] = 1;
  });
  const shutdown = powerOffMachine({
    stop() { order.push("stop CPU/audio"); },
    bridge: { stop() { order.push("abort AI"); } },
    cancelLoading() { order.push("cancel input"); },
    loading,
    reset() { order.push("reset"); bus.resetRam(); bus.resetDevices(); cpu.reset(); },
  });
  assert.deepEqual(order, ["stop CPU/audio", "abort AI", "cancel input"]);
  release();
  await shutdown;
  assert.deepEqual(order.slice(-2), ["loader finished", "reset"]);
  assert.ok(bus.ram.every((byte) => byte === 0));
  assert.equal(io.keyboardQueue.length, 0);
  assert.equal(io.serialOpen[0], false);
  assert.equal(io.serialReceive[0].length, 0);
  assert.equal(cpu.cycles, bootCycles);
  assert.equal(cpu.pc, bootPc);
  assert.equal(cpu.d[0], 0);
  // ON after OFF and Reiniciar both execute this same clean boot.
  io.enqueueKey(57);
  for (let n = 0; n < 2_000_000; n++) {
    bus.tick(cpu.step());
    cpu.setInterruptLevel(bus.interruptLevel);
  }
  assert.equal(qlLineEditorActive(bus), true);
  assert.equal(io.serialOpen[0], false);
});

test("a failed loader cannot prevent power off from clearing the machine", async () => {
  let reset = false;
  await powerOffMachine({ stop() {}, cancelLoading() {},
    loading: Promise.reject(new Error("cancelled loader")),
    reset() { reset = true; },
  });
  assert.equal(reset, true);
});
