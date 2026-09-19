import assert from "node:assert/strict";
import test from "node:test";
import { QLBus, QL_MEMORY } from "../src/core/bus.js";
import { MC68008, M68K_SR, M68K_VECTOR } from "../src/core/mc68008.js";

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
  put32(rom, M68K_VECTOR.ILLEGAL_INSTRUCTION * 4, RAM + 0x700);
  put32(rom, M68K_VECTOR.TRACE * 4, RAM + 0x800);
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("trace gera o vetor 9 depois de concluir uma instrução", () => {
  const { bus, cpu } = createCpu([0x4e, 0x71]); // NOP
  const initialSp = cpu.a[7];
  cpu.sr |= M68K_SR.TRACE;
  const tracedSr = cpu.sr;
  cpu.step();
  assert.equal(cpu.pc, RAM + 0x800);
  assert.equal(cpu.sr & M68K_SR.TRACE, 0);
  assert.equal(bus.read16(initialSp - 6), tracedSr);
  assert.equal(bus.read32(initialSp - 4), RAM + 2);
  assert.deepEqual(cpu.lastException, { vector: M68K_VECTOR.TRACE, pc: RAM + 2 });
});

test("uma exceção da própria instrução tem precedência sobre trace", () => {
  const { cpu } = createCpu([0x4a, 0xfc]); // ILLEGAL
  cpu.sr |= M68K_SR.TRACE;
  cpu.step();
  assert.equal(cpu.pc, RAM + 0x700);
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
  assert.equal(cpu.a[7], RAM + 0x1800 - 6);
});

test("ativar T através de MOVE para SR só traça a instrução seguinte", () => {
  const { cpu } = createCpu([0x46, 0xfc, 0xa0, 0x00, 0x4e, 0x71]); // MOVE #$A000,SR; NOP
  cpu.step();
  assert.equal(cpu.pc, RAM + 4);
  assert.equal(cpu.lastException, null);
  assert.equal(cpu.sr & M68K_SR.TRACE, M68K_SR.TRACE);
  cpu.step();
  assert.equal(cpu.pc, RAM + 0x800);
  assert.deepEqual(cpu.lastException, { vector: M68K_VECTOR.TRACE, pc: RAM + 6 });
});

test("trace ativo no início de STOP gera a exceção sem deixar a CPU parada", () => {
  const { cpu } = createCpu([0x4e, 0x72, 0x20, 0x00]); // STOP #$2000
  cpu.sr |= M68K_SR.TRACE;
  cpu.step();
  assert.equal(cpu.stopped, false);
  assert.equal(cpu.pc, RAM + 0x800);
  assert.deepEqual(cpu.lastException, { vector: M68K_VECTOR.TRACE, pc: RAM + 4 });
});
