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

test("ABCD soma dois bytes BCD compactados", () => {
  const { cpu } = createCpu([0xc1, 0x01]); // ABCD D1,D0
  cpu.d[0] = 0x1234_5645;
  cpu.d[1] = 0x38;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5683);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), 0);
});

test("ABCD inclui X, gera carry decimal e conserva Z cumulativo", () => {
  const { cpu } = createCpu([0xc1, 0x01]); // ABCD D1,D0
  cpu.d[0] = 0x99;
  cpu.d[1] = 0;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("ABCD aplica a correção inferior sem inventar carry em dígitos inválidos", () => {
  const { cpu } = createCpu([0xc3, 0x00]); // ABCD D0,D1
  cpu.d[0] = 0x0d;
  cpu.d[1] = 0x87;
  cpu.step();
  assert.equal(cpu.d[1], 0x9a);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), 0);
});

test("ABCD limpa Z num resultado não nulo e não volta a defini-lo", () => {
  const { cpu } = createCpu([0xc1, 0x01, 0xc5, 0x03]); // ABCD D1,D0; ABCD D3,D2
  cpu.d[0] = 1;
  cpu.d[1] = 1;
  cpu.sr |= M68K_SR.ZERO;
  cpu.step();
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  cpu.d[2] = 0;
  cpu.d[3] = 0;
  cpu.step();
  assert.equal(cpu.d[2], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
});

test("ABCD em memória pré-decrementa duas vezes o mesmo registo", () => {
  const { bus, cpu } = createCpu([0xc1, 0x08]); // ABCD -(A0),-(A0)
  cpu.a[0] = RAM + 0x404;
  bus.write8(RAM + 0x403, 0x12);
  bus.write8(RAM + 0x402, 0x34);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x402);
  assert.equal(bus.read8(RAM + 0x402), 0x46);
  assert.equal(bus.read8(RAM + 0x403), 0x12);
});

test("ABCD em memória usa passos de dois bytes para A7", () => {
  const { bus, cpu } = createCpu([0xcf, 0x08]); // ABCD -(A0),-(A7)
  cpu.a[0] = RAM + 0x501;
  cpu.a[7] = RAM + 0x602;
  bus.write8(RAM + 0x500, 0x11);
  bus.write8(RAM + 0x600, 0x22);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x500);
  assert.equal(cpu.a[7], RAM + 0x600);
  assert.equal(bus.read8(RAM + 0x600), 0x33);
});

test("SBCD subtrai bytes BCD sem borrow", () => {
  const { cpu } = createCpu([0x81, 0x01]); // SBCD D1,D0
  cpu.d[0] = 0x1234_5645;
  cpu.d[1] = 0x18;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5627);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), 0);
});

test("SBCD representa borrow decimal como 99 e define C e X", () => {
  const { cpu } = createCpu([0x81, 0x01]); // SBCD D1,D0
  cpu.d[0] = 0;
  cpu.d[1] = 1;
  cpu.sr |= M68K_SR.ZERO;
  cpu.step();
  assert.equal(cpu.d[0], 0x99);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("SBCD inclui X como borrow de entrada", () => {
  const { cpu } = createCpu([0x81, 0x01]); // SBCD D1,D0
  cpu.d[0] = 0;
  cpu.d[1] = 0;
  cpu.sr |= M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0x99);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("SBCD em memória lê a fonte antes do destino", () => {
  const { bus, cpu } = createCpu([0x81, 0x08]); // SBCD -(A0),-(A0)
  cpu.a[0] = RAM + 0x404;
  bus.write8(RAM + 0x403, 0x12);
  bus.write8(RAM + 0x402, 0x45);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x402);
  assert.equal(bus.read8(RAM + 0x402), 0x33);
});

test("NBCD produz o complemento decimal e preserva a parte alta de Dn", () => {
  const { cpu } = createCpu([0x48, 0x00]); // NBCD D0
  cpu.d[0] = 0x1234_5625;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5675);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("NBCD de zero conserva Z e não gera borrow", () => {
  const { cpu } = createCpu([0x48, 0x00]); // NBCD D0
  cpu.sr |= M68K_SR.ZERO;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), 0);
});

test("NBCD aceita memória e inclui X", () => {
  const { bus, cpu } = createCpu([0x48, 0x18]); // NBCD (A0)+
  cpu.a[0] = RAM + 0x400;
  bus.write8(cpu.a[0], 0);
  cpu.sr |= M68K_SR.EXTEND;
  cpu.step();
  assert.equal(bus.read8(RAM + 0x400), 0x99);
  assert.equal(cpu.a[0], RAM + 0x401);
});

test("NBCD rejeita registos de endereço como destino", () => {
  const { cpu } = createCpu([0x48, 0x08]); // NBCD A0 (inválido)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
});
