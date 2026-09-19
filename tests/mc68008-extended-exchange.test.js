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

test("ADDX inclui X e calcula overflow antes de limpar X", () => {
  const { cpu } = createCpu([0xd1, 0x01]); // ADDX.B D1,D0
  cpu.d[0] = 0x1234_567f;
  cpu.d[1] = 0;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5680);
  assert.equal(cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.OVERFLOW), M68K_SR.NEGATIVE | M68K_SR.OVERFLOW);
  assert.equal(cpu.sr & (M68K_SR.ZERO | M68K_SR.CARRY | M68K_SR.EXTEND), 0);
});

test("ADDX conserva Z num zero multiprecisão e limpa-o depois", () => {
  const { cpu } = createCpu([0xd1, 0x01, 0xd5, 0x03]); // ADDX.B D1,D0; ADDX.B D3,D2
  cpu.d[0] = 0xff;
  cpu.d[1] = 0;
  cpu.d[2] = 1;
  cpu.d[3] = 0;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
  cpu.step();
  assert.equal(cpu.d[2], 2);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
});

test("ADDX em memória pré-decrementa duas vezes o mesmo registo", () => {
  const { bus, cpu } = createCpu([0xd1, 0x48]); // ADDX.W -(A0),-(A0)
  cpu.a[0] = RAM + 0x404;
  bus.write16(RAM + 0x400, 2);
  bus.write16(RAM + 0x402, 1);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x400);
  assert.equal(bus.read16(RAM + 0x400), 3);
  assert.equal(bus.read16(RAM + 0x402), 1);
});

test("ADDX.B usa passos de dois bytes para A7", () => {
  const { bus, cpu } = createCpu([0xdf, 0x08]); // ADDX.B -(A0),-(A7)
  cpu.a[0] = RAM + 0x501;
  cpu.a[7] = RAM + 0x602;
  bus.write8(RAM + 0x500, 1);
  bus.write8(RAM + 0x600, 2);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x500);
  assert.equal(cpu.a[7], RAM + 0x600);
  assert.equal(bus.read8(RAM + 0x600), 3);
});

test("SUBX inclui X e define borrow e resultado negativo", () => {
  const { cpu } = createCpu([0x91, 0x81]); // SUBX.L D1,D0
  cpu.d[0] = 0;
  cpu.d[1] = 0;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_ffff);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  assert.equal(
    cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.CARRY | M68K_SR.EXTEND),
    M68K_SR.NEGATIVE | M68K_SR.CARRY | M68K_SR.EXTEND,
  );
});

test("SUBX trata source + X que transborda sem perder o borrow", () => {
  const { cpu } = createCpu([0x91, 0x81]); // SUBX.L D1,D0
  cpu.d[0] = 0;
  cpu.d[1] = 0xffff_ffff;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("ADD.L e SUB.L normalizam operandos de 32 bits ao calcular carry e borrow", () => {
  const { cpu } = createCpu([0xd0, 0x81, 0x90, 0x82]); // ADD.L D1,D0; SUB.L D2,D0
  cpu.d[0] = 0xffff_ffff;
  cpu.d[1] = 1;
  cpu.d[2] = 1;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_ffff);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("SUBX em memória usa o operando fonte antes do destino", () => {
  const { bus, cpu } = createCpu([0x91, 0x08]); // SUBX.B -(A0),-(A0)
  cpu.a[0] = RAM + 0x404;
  bus.write8(RAM + 0x403, 1);
  bus.write8(RAM + 0x402, 5);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x402);
  assert.equal(bus.read8(RAM + 0x402), 4);
  assert.equal(bus.read8(RAM + 0x403), 1);
});

test("CMPM compara fonte e destino, incrementa ambos e preserva X", () => {
  const { bus, cpu } = createCpu([0xb1, 0x49]); // CMPM.W (A1)+,(A0)+
  cpu.a[0] = RAM + 0x400;
  cpu.a[1] = RAM + 0x500;
  bus.write16(cpu.a[0], 5);
  bus.write16(cpu.a[1], 7);
  cpu.sr |= M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x402);
  assert.equal(cpu.a[1], RAM + 0x502);
  assert.equal(bus.read16(RAM + 0x400), 5);
  assert.equal(cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.NEGATIVE | M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("CMPM com o mesmo registo lê posições consecutivas", () => {
  const { bus, cpu } = createCpu([0xb1, 0x08]); // CMPM.B (A0)+,(A0)+
  cpu.a[0] = RAM + 0x400;
  bus.write8(RAM + 0x400, 1);
  bus.write8(RAM + 0x401, 2);
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x402);
  assert.equal(cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.ZERO | M68K_SR.CARRY), 0);
});

test("CMPM.B incrementa A7 duas vezes em passos de dois bytes", () => {
  const { bus, cpu } = createCpu([0xbf, 0x0f]); // CMPM.B (A7)+,(A7)+
  cpu.a[7] = RAM + 0x400;
  bus.write8(RAM + 0x400, 3);
  bus.write8(RAM + 0x402, 3);
  cpu.step();
  assert.equal(cpu.a[7], RAM + 0x404);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
});

test("EXG troca dois registos de dados sem alterar SR", () => {
  const { cpu } = createCpu([0xc1, 0x41]); // EXG D0,D1
  cpu.d[0] = 0x1234_5678;
  cpu.d[1] = 0x89ab_cdef;
  const sr = cpu.sr;
  cpu.step();
  assert.equal(cpu.d[0], 0x89ab_cdef);
  assert.equal(cpu.d[1], 0x1234_5678);
  assert.equal(cpu.sr, sr);
});

test("EXG troca dois registos de endereço", () => {
  const { cpu } = createCpu([0xc1, 0x49]); // EXG A0,A1
  cpu.a[0] = 0x1111_1111;
  cpu.a[1] = 0x2222_2222;
  cpu.step();
  assert.equal(cpu.a[0], 0x2222_2222);
  assert.equal(cpu.a[1], 0x1111_1111);
});

test("EXG troca um registo de dados e um de endereço", () => {
  const { cpu } = createCpu([0xc1, 0x89]); // EXG D0,A1
  cpu.d[0] = 0x3333_3333;
  cpu.a[1] = 0x4444_4444;
  cpu.step();
  assert.equal(cpu.d[0], 0x4444_4444);
  assert.equal(cpu.a[1], 0x3333_3333);
});
