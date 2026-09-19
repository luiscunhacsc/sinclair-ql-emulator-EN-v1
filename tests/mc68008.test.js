import assert from "node:assert/strict";
import test from "node:test";
import { QLBus, QL_MEMORY } from "../src/core/bus.js";
import { AddressError, MC68008, M68K_SR, M68K_VECTOR } from "../src/core/mc68008.js";

const RAM = QL_MEMORY.internalRamStart;

function put32(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function createCpu({ pc = RAM, sp = RAM + 0x1000 } = {}) {
  const bus = new QLBus();
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  put32(rom, 0, sp);
  put32(rom, 4, pc);
  bus.loadRom(rom);
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("RESET obtém SSP e PC nos vetores iniciais e entra em supervisor", () => {
  const { cpu } = createCpu({ pc: 0x23456, sp: 0x3fff0 });
  assert.equal(cpu.a[7], 0x3fff0);
  assert.equal(cpu.ssp, 0x3fff0);
  assert.equal(cpu.pc, 0x23456);
  assert.equal(cpu.sr, 0x2700);
  assert.equal(cpu.cycles, 32);
});

test("NOP avança uma palavra e demora oito clocks no barramento de 8 bits", () => {
  const { bus, cpu } = createCpu();
  bus.loadRam(RAM, Uint8Array.of(0x4e, 0x71));
  const cycles = cpu.step();
  assert.equal(cpu.pc, RAM + 2);
  assert.equal(cycles, 8);
});

test("MOVEQ faz extensão de sinal e atualiza NZVC sem alterar X", () => {
  const { bus, cpu } = createCpu();
  bus.loadRam(RAM, Uint8Array.of(0x74, 0x80, 0x76, 0x00)); // MOVEQ #-128,D2; MOVEQ #0,D3
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY | M68K_SR.OVERFLOW;

  cpu.step();
  assert.equal(cpu.d[2], 0xffff_ff80);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
  assert.equal(cpu.sr & (M68K_SR.ZERO | M68K_SR.CARRY | M68K_SR.OVERFLOW), 0);

  cpu.step();
  assert.equal(cpu.d[3], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
});

test("BRA aceita deslocamentos curtos positivos e negativos", () => {
  const { bus, cpu } = createCpu();
  bus.loadRam(RAM, Uint8Array.of(0x60, 0x04));
  assert.equal(cpu.step(), 10);
  assert.equal(cpu.pc, RAM + 6);

  bus.loadRam(RAM + 6, Uint8Array.of(0x60, 0xfc));
  cpu.step();
  assert.equal(cpu.pc, RAM + 4);
});

test("BRA.W calcula o deslocamento a partir da palavra de extensão", () => {
  const { bus, cpu } = createCpu();
  bus.loadRam(RAM, Uint8Array.of(0x60, 0x00, 0x00, 0x08)); // BRA.W +8

  cpu.step();
  assert.equal(cpu.pc, RAM + 10);
});

test("Bcc consulta corretamente os códigos de condição", () => {
  const { bus, cpu } = createCpu();
  bus.loadRam(RAM, Uint8Array.of(0x67, 0x06)); // BEQ +6
  cpu.sr |= M68K_SR.ZERO;
  cpu.step();
  assert.equal(cpu.pc, RAM + 8);
});

test("BSR guarda o endereço de retorno e RTS recupera-o", () => {
  const { bus, cpu } = createCpu();
  const initialSp = cpu.a[7];
  bus.loadRam(RAM, Uint8Array.of(0x61, 0x04));
  bus.loadRam(RAM + 6, Uint8Array.of(0x4e, 0x75));

  cpu.step();
  assert.equal(cpu.pc, RAM + 6);
  assert.equal(cpu.a[7], initialSp - 4);
  assert.equal(bus.read32(initialSp - 4), RAM + 2);

  cpu.step();
  assert.equal(cpu.pc, RAM + 2);
  assert.equal(cpu.a[7], initialSp);
});

test("BSR.W usa bases distintas para o destino e o endereço de retorno", () => {
  const { bus, cpu } = createCpu();
  const initialSp = cpu.a[7];
  bus.loadRam(RAM, Uint8Array.of(0x61, 0x00, 0x00, 0x08)); // BSR.W +8
  bus.loadRam(RAM + 10, Uint8Array.of(0x4e, 0x75));

  cpu.step();
  assert.equal(cpu.pc, RAM + 10);
  assert.equal(bus.read32(initialSp - 4), RAM + 4);

  cpu.step();
  assert.equal(cpu.pc, RAM + 4);
});

test("ILLEGAL entra pelo vetor de instrução ilegal", () => {
  const { bus, cpu } = createCpu();
  const handler = RAM + 0x200;
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  put32(rom, 0, cpu.a[7]);
  put32(rom, 4, RAM);
  put32(rom, M68K_VECTOR.ILLEGAL_INSTRUCTION * 4, handler);
  bus.loadRom(rom);
  cpu.reset();
  const initialSp = cpu.a[7];
  bus.loadRam(RAM, Uint8Array.of(0x4a, 0xfc));

  cpu.step();
  assert.equal(cpu.pc, handler);
  assert.equal(cpu.a[7], initialSp - 6);
  assert.equal(bus.read16(cpu.a[7]), 0x2700);
  assert.equal(bus.read32(cpu.a[7] + 2), RAM);
  assert.deepEqual(cpu.lastException, { vector: M68K_VECTOR.ILLEGAL_INSTRUCTION, pc: RAM });
});

test("acessos a palavras em endereços ímpares são identificados", () => {
  const { cpu } = createCpu();
  assert.throws(() => cpu.read16(RAM + 1), AddressError);
  assert.throws(() => cpu.write32(RAM + 1, 0), AddressError);
});

test("a mudança entre supervisor e utilizador preserva USP e SSP", () => {
  const { cpu } = createCpu({ sp: RAM + 0x1000 });
  cpu.usp = RAM + 0x800;
  cpu.setStatusRegister(cpu.sr & ~M68K_SR.SUPERVISOR);
  assert.equal(cpu.a[7], RAM + 0x800);
  cpu.a[7] -= 4;
  cpu.setStatusRegister(cpu.sr | M68K_SR.SUPERVISOR);
  assert.equal(cpu.usp, RAM + 0x7fc);
  assert.equal(cpu.a[7], RAM + 0x1000);
});
