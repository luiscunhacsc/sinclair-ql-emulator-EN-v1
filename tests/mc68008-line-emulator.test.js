import assert from "node:assert/strict";
import test from "node:test";
import { QLBus, QL_MEMORY } from "../src/core/bus.js";
import { MC68008, M68K_VECTOR } from "../src/core/mc68008.js";

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
  put32(rom, M68K_VECTOR.LINE_1010_EMULATOR * 4, RAM + 0x800);
  put32(rom, M68K_VECTOR.LINE_1111_EMULATOR * 4, RAM + 0x900);
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("um opcode da linha A usa o vetor 10 e empilha o endereço da instrução", () => {
  const { bus, cpu } = createCpu([0xa1, 0x23]);
  const initialSp = cpu.a[7];
  const initialSr = cpu.sr;
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.LINE_1010_EMULATOR);
  assert.equal(cpu.pc, RAM + 0x800);
  assert.equal(cpu.a[7], initialSp - 6);
  assert.equal(bus.read16(initialSp - 6), initialSr);
  assert.equal(bus.read32(initialSp - 4), RAM);
});

test("um opcode da linha F usa o vetor 11", () => {
  const { cpu } = createCpu([0xfe, 0xdc]);
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.LINE_1111_EMULATOR);
  assert.equal(cpu.pc, RAM + 0x900);
  assert.equal(cpu.lastException.pc, RAM);
});
