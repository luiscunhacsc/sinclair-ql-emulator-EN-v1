import assert from "node:assert/strict";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";

test("ZX8301 reserves video/refresh slots and lets a complete CPU byte access fit", () => {
  const video = new ZX8301();
  for (const [phase, wait] of [
    [0, 8], [4, 4], [8, 0], [9, 11], [12, 8],
    [380, 0], [381, 3], [383, 1], [384, 0],
    [476, 0], [477, 11], [479, 9], [480, 8],
  ]) {
    assert.equal(video.ramWaitCycles(phase), wait, `phase ${phase}`);
    assert.equal(video.ramWaitCycles(phase + 480 * 280), wait, "refresh continues in vertical blanking");
  }
  video.write8(0x18063, 0x8a);
  assert.equal(video.ramWaitCycles(0), 8, "blanking, MODE 8 and the other screen bank retain refresh");
});

test("RAM contention applies to both internal banks, not ROM, I/O or unmapped memory", () => {
  const bus = new QLBus({ devices: [new ZX8301()] });
  for (const address of [0x20000, 0x28000, 0x30000, 0x3ffff, 0x120000]) {
    assert.equal(bus.cpuAccessCycles(address, 0), 12);
  }
  for (const address of [0, 0xbfff, 0x18020, 0x18063, 0x1ffff, 0x40000]) {
    assert.equal(bus.cpuAccessCycles(address, 0), 4);
  }
  assert.equal(new QLBus().cpuAccessCycles(0x20000, 0), 4, "a standalone CPU bus has no video contention");
});

test("CPU reads and writes use 56 byte slots per scanline; host RAM reads do not advance time", () => {
  const video = new ZX8301();
  const bus = new QLBus({ devices: [video] });
  const cpu = new MC68008(bus);
  for (const operation of [() => cpu.read8(0x30000), () => cpu.write8(0x30000, 0x5a)]) {
    cpu.cycles = 0;
    let bytes = 0;
    while (cpu.cycles < 480) { operation(); bytes++; }
    assert.equal(bytes, 56);
    assert.equal(cpu.cycles, 480);
  }
  assert.equal(bus.read8(0x30000), 0x5a);
  video.renderFrame(bus);
  assert.equal(cpu.cycles, 480);
});
