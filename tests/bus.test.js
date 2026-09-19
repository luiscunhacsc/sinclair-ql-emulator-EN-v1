import assert from "node:assert/strict";
import test from "node:test";
import { QLBus, QL_MEMORY } from "../src/core/bus.js";

test("carrega apenas uma ROM interna de 48 KiB", () => {
  const bus = new QLBus();
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  rom[0] = 0x12;
  rom[rom.length - 1] = 0x34;
  bus.loadRom(rom);

  assert.equal(bus.read8(0), 0x12);
  assert.equal(bus.read8(rom.length - 1), 0x34);
  assert.throws(() => bus.loadRom(new Uint8Array(64)), RangeError);
});

test("a ROM é só de leitura", () => {
  const bus = new QLBus();
  bus.loadRom(new Uint8Array(QL_MEMORY.internalRomSize));
  bus.write8(0x100, 0xaa);
  assert.equal(bus.read8(0x100), 0);
});

test("lê e escreve RAM em big-endian", () => {
  const bus = new QLBus();
  const address = QL_MEMORY.internalRamStart;

  bus.write32(address, 0x1234_abcd);
  assert.deepEqual([...bus.ram.slice(0, 4)], [0x12, 0x34, 0xab, 0xcd]);
  assert.equal(bus.read16(address), 0x1234);
  assert.equal(bus.read32(address), 0x1234_abcd);
});

test("normaliza endereços para as 20 linhas do MC68008", () => {
  const bus = new QLBus();
  bus.write8(0x12_0000, 0x5a);
  assert.equal(bus.read8(0x20_000), 0x5a);
});

test("áreas ainda não mapeadas simulam barramento aberto", () => {
  const bus = new QLBus();
  assert.equal(bus.read8(0x18_000), 0xff);
});
