import assert from "node:assert/strict";
import test from "node:test";
import { QLBus, QL_MEMORY } from "../src/core/bus.js";
import { MC68008, M68K_SR } from "../src/core/mc68008.js";

const RAM = QL_MEMORY.internalRamStart;

function put32(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function createCpu(program) {
  const bus = new QLBus();
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  put32(rom, 0, RAM + 0x1800);
  put32(rom, 4, RAM);
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("MOVEP.W guarda a palavra baixa em bytes alternados", () => {
  const { bus, cpu } = createCpu([0x01, 0x88, 0x00, 0x20]); // MOVEP.W D0,(32,A0)
  cpu.a[0] = RAM + 0x400;
  cpu.d[0] = 0x1234_abcd;
  bus.write8(RAM + 0x421, 0x55);
  const sr = cpu.sr | M68K_SR.EXTEND | M68K_SR.ZERO;
  cpu.sr = sr;
  cpu.step();
  assert.equal(bus.read8(RAM + 0x420), 0xab);
  assert.equal(bus.read8(RAM + 0x421), 0x55);
  assert.equal(bus.read8(RAM + 0x422), 0xcd);
  assert.equal(cpu.sr, sr);
});

test("MOVEP.L guarda os quatro bytes do registo por ordem big-endian", () => {
  const { bus, cpu } = createCpu([0x0f, 0xcf, 0x00, 0x10]); // MOVEP.L D7,(16,A7)
  cpu.a[7] = RAM + 0x400;
  cpu.d[7] = 0x1234_abcd;
  cpu.step();
  assert.deepEqual(
    [0, 2, 4, 6].map((offset) => bus.read8(RAM + 0x410 + offset)),
    [0x12, 0x34, 0xab, 0xcd],
  );
  assert.equal(cpu.a[7], RAM + 0x400);
});

test("MOVEP.W carrega a palavra e preserva a metade superior de Dn", () => {
  const { bus, cpu } = createCpu([0x03, 0x09, 0x00, 0x20]); // MOVEP.W (32,A1),D1
  cpu.a[1] = RAM + 0x400;
  cpu.d[1] = 0x1234_5678;
  bus.write8(RAM + 0x420, 0x9a);
  bus.write8(RAM + 0x422, 0xbc);
  cpu.step();
  assert.equal(cpu.d[1], 0x1234_9abc);
});

test("MOVEP.L reúne quatro bytes alternados no registo", () => {
  const { bus, cpu } = createCpu([0x05, 0x4a, 0x00, 0x10]); // MOVEP.L (16,A2),D2
  cpu.a[2] = RAM + 0x400;
  bus.write8(RAM + 0x410, 0x89);
  bus.write8(RAM + 0x412, 0xab);
  bus.write8(RAM + 0x414, 0xcd);
  bus.write8(RAM + 0x416, 0xef);
  cpu.step();
  assert.equal(cpu.d[2], 0x89ab_cdef);
});

test("MOVEP aceita deslocamentos negativos", () => {
  const { bus, cpu } = createCpu([0x07, 0x0b, 0xff, 0xf0]); // MOVEP.W (-16,A3),D3
  cpu.a[3] = RAM + 0x420;
  cpu.d[3] = 0xaaaa_0000;
  bus.write8(RAM + 0x410, 0x12);
  bus.write8(RAM + 0x412, 0x34);
  cpu.step();
  assert.equal(cpu.d[3], 0xaaaa_1234);
});

test("MOVEP pode começar num endereço ímpar por usar acessos byte", () => {
  const { bus, cpu } = createCpu([0x09, 0x8c, 0x00, 0x01]); // MOVEP.W D4,(1,A4)
  cpu.a[4] = RAM + 0x400;
  cpu.d[4] = 0xbeef;
  assert.doesNotThrow(() => cpu.step());
  assert.equal(bus.read8(RAM + 0x401), 0xbe);
  assert.equal(bus.read8(RAM + 0x403), 0xef);
});
