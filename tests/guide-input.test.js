import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { guideExampleEvents, qlLineEditorActive } from "../src/ui/ql-text-input.js";

async function boot() {
  const keyboard = new ZX8302();
  const bus = new QLBus({ devices: [new ZX8301(), keyboard] });
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  const cpu = new MC68008(bus);
  cpu.reset();
  let output = "";
  function advance(milliseconds) {
    const target = cpu.cycles + milliseconds * 7500;
    while (cpu.cycles < target) {
      // Observe ROM output via QDOS io.sbyte/io.sstrg, including relative A1.
      if (cpu.read16(cpu.pc) === 0x4e43) {
        const action = cpu.d[0] & 0xff;
        if (action === 5) output += String.fromCharCode(cpu.d[1] & 0xff);
        if (action === 7) {
          const job = bus.read32(bus.read32(0x28064)); // sv_jbpnt
          const address = cpu.a[1] + ((bus.read8(job + 0x16) & 0x80) ? cpu.a[6] : 0);
          for (let index = 0; index < (cpu.d[2] & 0xffff); index += 1) {
            output += String.fromCharCode(bus.read8(address + index));
          }
        }
      }
      bus.tick(cpu.step());
      cpu.setInterruptLevel(bus.interruptLevel);
    }
  }
  keyboard.enqueueKey(57);
  advance(12_000);
  output = "";
  return {
    bus,
    get output() { return output; },
    send(example, run = true) {
      for (const event of guideExampleEvents(example, { run, editingLine: qlLineEditorActive(bus) })) {
        keyboard.enqueueKey(event.keyrow, event);
        advance(event.pauseAfter);
      }
      advance(500);
    },
  };
}

test("repeated guide commands and prepared input do not report not complete", async () => {
  const ql = await boot();
  const command = { kind: "command", code: 'PRINT "OLA, SINCLAIR QL"' };
  assert.equal(qlLineEditorActive(ql.bus), true);
  ql.send(command);
  ql.send(command);
  // Match placing a command, then clicking Execute (which sends it again).
  ql.send({ kind: "command", code: 'PRINT "DO NOT EXECUTE"' }, false);
  ql.send(command);
  assert.equal(ql.output, "OLA, SINCLAIR QL\n".repeat(3));
  assert.equal(qlLineEditorActive(ql.bus), true);
});

test("guide can still interrupt a running program and load another", async () => {
  const ql = await boot();
  ql.send({ kind: "program", code: "100 REPeat spin\n110 END REPeat spin" });
  assert.equal(qlLineEditorActive(ql.bus), false);
  ql.send({ kind: "program", code: '100 PRINT "RECOVERED"' });
  assert.match(ql.output, /RECOVERED\n$/);
  assert.equal(qlLineEditorActive(ql.bus), true);
});

test("an unbooted or invalid QDOS job table does not look like an editor", () => {
  const bus = new QLBus();
  assert.equal(qlLineEditorActive(bus), false);
  bus.romLoaded = true;
  bus.write16(0x28000, 0xd254);
  for (const table of [0, 0xffffffff, 0x28001, 0x18000, 0x3fffe]) {
    bus.write32(0x28068, table);
    assert.equal(qlLineEditorActive(bus), false);
  }
});
