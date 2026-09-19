import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { guideExampleEvents } from "../src/ui/ql-text-input.js";
import { qlTextEvents } from "../src/ui/ql-text-input.js";
import { chatTerminalExample, QLChatBridge, localDemoReply } from "../src/ui/ql-chat.js";
import { waitForQlCycles, waitForSuperBasic, waitForChatReady } from "../src/ui/ql-program-loader.js";
import { restartWithoutChat } from "../src/ui/original-ql-mode.js";
import { qlLineEditorActive } from "../src/ui/ql-text-input.js";

test("Minerva sends and receives a line over the virtual SER1 cable", async () => {
  const sent = [];
  const io = new ZX8302({ onSerial: ({ port, byte }) => {
    assert.equal(port, 1);
    sent.push(byte);
    if (byte === 10 && sent.length === 6) {
      assert.equal(io.receiveSerial(1, new TextEncoder().encode("WORLD\n")), true);
    }
  } });
  const bus = new QLBus({ devices: [new ZX8301(), io] });
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  const cpu = new MC68008(bus);
  cpu.reset();
  const step = () => { bus.tick(cpu.step()); cpu.setInterruptLevel(bus.interruptLevel); };
  io.enqueueKey(57);
  for (let n = 0; n < 2_000_000; n++) step();
  const code = '100 OPEN #3,ser1ir\n110 PRINT #3,"HELLO"\n120 INPUT #3,a$\n130 PRINT #3,a$\n140 CLOSE #3';
  for (const e of guideExampleEvents({ kind: "program", code }, { run: true })) io.enqueueKey(e.keyrow, e);
  for (let n = 0; n < 8_000_000 && sent.length < 12; n++) step();
  assert.equal(new TextDecoder().decode(Uint8Array.from(sent)), "HELLO\nWORLD\n");
});

test("Gemini terminal confirms startup on Minerva, exchanges a local reply and restarts in demo mode", async () => {
  let bridge;
  const sent = [];
  const io = new ZX8302({ onSerial: (event) => { sent.push(event.byte); bridge.transmit(event); } });
  const video = new ZX8301();
  const bus = new QLBus({ devices: [video, io] });
  bridge = new QLChatBridge({ device: io, reply: localDemoReply });
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  const cpu = new MC68008(bus);
  cpu.reset();
  function advance(count = 2_000_000) {
    for (let n = 0; n < count; n++) { bus.tick(cpu.step()); cpu.setInterruptLevel(bus.interruptLevel); }
  }
  const signal = new AbortController().signal;
  let ticks = 0;
  const delay = async () => {
    // Browser frames make uneven progress; use the same pacing as the UI.
    const target = cpu.cycles + (++ticks % 3 === 0 ? 150_000 : 45_000);
    while (cpu.cycles < target) { bus.tick(cpu.step()); cpu.setInterruptLevel(bus.interruptLevel); }
  };
  async function loadTerminal(provider) {
    await waitForSuperBasic({ bus, device: io, signal, delay });
    assert.equal(qlLineEditorActive(bus), true, "BASIC must be ready before the first program key");
    const initialFrame = video.renderFrame(bus).slice();
    let typed = 0;
    for (const e of guideExampleEvents(chatTerminalExample(provider), { run: true })) {
      io.enqueueKey(e.keyrow, e);
      await waitForQlCycles(e.pauseAfter, { cpu, hz: 7_500_000, signal, delay });
      if (++typed === 150) {
        assert.notDeepEqual(video.renderFrame(bus), initialFrame, "the QL must visibly echo the program while it is being typed");
        assert.equal(bridge.ready, false, "this is visible typing, before RUN starts the terminal");
      }
    }
    await waitForChatReady({ bridge, signal, delay });
  }
  await loadTerminal("gemini");
  assert.equal(io.serialOpen[0], true, "terminal must reach OPEN SER1");
  assert.equal(bridge.ready, true, "BASIC must send the startup marker");
  for (const e of qlTextEvents("hello\n")) io.enqueueKey(e.keyrow, e);
  advance();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(new TextDecoder().decode(Uint8Array.from(sent)), "\x02hello\n");
  advance(5_000_000);
  assert.equal(io.serialReceive[0].length, 0);
  // Opening a new chat while the old BASIC terminal is at its prompt must work.
  bridge.stop();
  bridge = new QLChatBridge({ device: io, reply: localDemoReply });
  await loadTerminal("demo");
  assert.equal(io.serialOpen[0], true);
  for (const e of qlTextEvents("/quit\n")) io.enqueueKey(e.keyrow, e);
  advance();
  assert.equal(new TextDecoder().decode(Uint8Array.from(sent)), "\x02hello\n\x02/quit\n");
  assert.equal(io.serialOpen[0], false);
  assert.equal(bridge.active, false);
  assert.equal(video.mode, 4);
  // Even after /quit, reboot must remove the chat program and restore the
  // native machine. F1 then reaches the ordinary SuperBASIC command prompt.
  await restartWithoutChat({ bridge, cancelLoading() {},
    reset() { bus.resetRam(); bus.resetDevices(); cpu.reset(); },
    start() {},
  });
  assert.equal(io.serialOpen[0], false);
  assert.equal(bridge.active, false);
  assert.equal(io.keyboardQueue.length, 0);
  assert.equal(bus.ram.every((byte) => byte === 0), true);
  const sentBeforeBoot = sent.length;
  io.enqueueKey(57);
  advance();
  assert.equal(qlLineEditorActive(bus), true, "the restarted QL must accept native SuperBASIC input");
  assert.equal(io.serialOpen[0], false, "the chat serial channel must remain closed");
  assert.equal(sent.length, sentBeforeBoot, "native startup must not talk to the chat bridge");
});
