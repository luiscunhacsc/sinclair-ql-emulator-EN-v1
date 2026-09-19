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
  put32(rom, M68K_VECTOR.ILLEGAL_INSTRUCTION * 4, RAM + 0x800);
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("NEG calcula sinal, overflow, carry e extend", () => {
  const { cpu } = createCpu([0x44, 0x00]); // NEG.B D0
  cpu.d[0] = 0x1234_5680;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5680);
  assert.equal(
    cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.OVERFLOW | M68K_SR.CARRY | M68K_SR.EXTEND),
    M68K_SR.NEGATIVE | M68K_SR.OVERFLOW | M68K_SR.CARRY | M68K_SR.EXTEND,
  );
});

test("NEG de zero limpa carry e extend e define zero", () => {
  const { cpu } = createCpu([0x44, 0x40]); // NEG.W D0
  cpu.sr |= M68K_SR.CARRY | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), 0);
});

test("NEGX inclui X no operando e conserva a regra cumulativa de Z", () => {
  const { cpu } = createCpu([0x40, 0x00]); // NEGX.B D0
  cpu.d[0] = 0xff;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("NEGX limpa Z num resultado não nulo e não volta a defini-lo", () => {
  const { cpu } = createCpu([0x40, 0x00, 0x40, 0x01]); // NEGX.B D0; NEGX.B D1
  cpu.d[0] = 1;
  cpu.d[1] = 0;
  cpu.sr |= M68K_SR.ZERO;
  cpu.step();
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  cpu.sr &= ~M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[1], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
});

test("NOT preserva X e os bits superiores de Dn", () => {
  const { cpu } = createCpu([0x46, 0x40]); // NOT.W D0
  cpu.d[0] = 0x1234_ffff;
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY | M68K_SR.OVERFLOW;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_0000);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.OVERFLOW), 0);
});

test("NOT suporta destinos em memória", () => {
  const { bus, cpu } = createCpu([0x46, 0x10]); // NOT.B (A0)
  cpu.a[0] = RAM + 0x400;
  bus.write8(cpu.a[0], 0x0f);
  cpu.step();
  assert.equal(bus.read8(cpu.a[0]), 0xf0);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("EXT.W estende o byte sem tocar na palavra superior", () => {
  const { cpu } = createCpu([0x48, 0x80]); // EXT.W D0
  cpu.d[0] = 0x1234_5680;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_ff80);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("EXT.L estende a palavra a 32 bits", () => {
  const { cpu } = createCpu([0x48, 0xc0]); // EXT.L D0
  cpu.d[0] = 0x1234_8001;
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_8001);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("SWAP troca as duas palavras e calcula flags sobre 32 bits", () => {
  const { cpu } = createCpu([0x48, 0x40]); // SWAP D0
  cpu.d[0] = 0x0001_8000;
  cpu.sr |= M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0x8000_0001);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
});

test("NEG não aceita um registo de endereço como destino", () => {
  const { cpu } = createCpu([0x44, 0x48]); // NEG.W A0 (inválido)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
  assert.equal(cpu.pc, RAM + 0x800);
});
