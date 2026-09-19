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

function createCpu(program, { sp = RAM + 0x1000 } = {}) {
  const bus = new QLBus();
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  put32(rom, 0, sp);
  put32(rom, 4, RAM);
  put32(rom, 16, RAM + 0x800); // Vetor 4: instrução ilegal.
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("MOVE imediato suporta byte, palavra e palavra longa", () => {
  const { cpu } = createCpu([
    0x10, 0x3c, 0x00, 0xab,                         // MOVE.B #$AB,D0
    0x32, 0x3c, 0x12, 0x34,                         // MOVE.W #$1234,D1
    0x24, 0x3c, 0x89, 0xab, 0xcd, 0xef,             // MOVE.L #$89ABCDEF,D2
  ]);

  cpu.step();
  cpu.step();
  cpu.step();
  assert.equal(cpu.d[0], 0x0000_00ab);
  assert.equal(cpu.d[1], 0x0000_1234);
  assert.equal(cpu.d[2], 0x89ab_cdef);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("MOVE preserva os bits superiores de Dn nas operações byte e word", () => {
  const { cpu } = createCpu([0x10, 0x3c, 0x00, 0x55, 0x30, 0x3c, 0xaa, 0xbb]);
  cpu.d[0] = 0x1234_5678;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5655);
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_aabb);
});

test("MOVEA.W faz extensão de sinal sem alterar os códigos de condição", () => {
  const { cpu } = createCpu([0x30, 0x7c, 0xff, 0xfe]); // MOVEA.W #$FFFE,A0
  cpu.sr |= M68K_SR.ZERO | M68K_SR.EXTEND;
  const flags = cpu.sr;
  cpu.step();
  assert.equal(cpu.a[0], 0xffff_fffe);
  assert.equal(cpu.sr, flags);
});

test("(An)+ e -(An) tratam A7 por palavras mesmo em acessos byte", () => {
  const stack = RAM + 0x300;
  const { bus, cpu } = createCpu([0x10, 0x1f, 0x1f, 0x00]); // MOVE.B (A7)+,D0; MOVE.B D0,-(A7)
  cpu.a[7] = stack;
  bus.write8(stack, 0x5a);

  cpu.step();
  assert.equal(cpu.d[0], 0x5a);
  assert.equal(cpu.a[7], stack + 2);
  cpu.step();
  assert.equal(cpu.a[7], stack);
  assert.equal(bus.read8(stack), 0x5a);
});

test("endereçamento com deslocamento e índice calcula o endereço efetivo", () => {
  const { bus, cpu } = createCpu([
    0x34, 0x28, 0x00, 0x04,                         // MOVE.W 4(A0),D2
    0x47, 0xf0, 0x10, 0x04,                         // LEA 4(A0,D1.W),A3
  ]);
  cpu.a[0] = RAM + 0x100;
  cpu.d[1] = 2;
  bus.write16(cpu.a[0] + 4, 0xbeef);

  cpu.step();
  assert.equal(cpu.d[2], 0xbeef);
  cpu.step();
  assert.equal(cpu.a[3], RAM + 0x106);
});

test("LEA absoluto longo não altera os códigos de condição", () => {
  const { cpu } = createCpu([0x43, 0xf9, 0x00, 0x03, 0x45, 0x60]); // LEA $34560.L,A1
  cpu.sr |= M68K_SR.CARRY | M68K_SR.ZERO;
  const flags = cpu.sr;
  cpu.step();
  assert.equal(cpu.a[1], 0x34560);
  assert.equal(cpu.sr, flags);
});

test("CLR e TST atualizam NZVC mas preservam X", () => {
  const { cpu } = createCpu([0x42, 0x00, 0x4a, 0x81]); // CLR.B D0; TST.L D1
  cpu.d[0] = 0x1234_56ab;
  cpu.d[1] = 0x8000_0000;
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY | M68K_SR.OVERFLOW;

  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5600);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);

  cpu.step();
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
});

test("ADD deteta carry e overflow para operandos byte", () => {
  const { cpu } = createCpu([0xd0, 0x01, 0xd0, 0x01]); // ADD.B D1,D0 (duas vezes)
  cpu.d[0] = 0x7f;
  cpu.d[1] = 1;
  cpu.step();
  assert.equal(cpu.d[0], 0x80);
  assert.equal(cpu.sr & M68K_SR.OVERFLOW, M68K_SR.OVERFLOW);
  assert.equal(cpu.sr & M68K_SR.CARRY, 0);

  cpu.d[0] = 0xff;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
});

test("SUB define borrow e CMP preserva X e o operando de destino", () => {
  const { cpu } = createCpu([0x90, 0x01, 0xb0, 0x81]); // SUB.B D1,D0; CMP.L D1,D0
  cpu.d[0] = 0;
  cpu.d[1] = 1;
  cpu.step();
  assert.equal(cpu.d[0], 0xff);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);

  cpu.d[0] = 1;
  const before = cpu.d[0];
  cpu.step();
  assert.equal(cpu.d[0], before);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
});

test("ADDA.W e SUBA.L operam em 32 bits e não alteram flags", () => {
  const { cpu } = createCpu([
    0xd0, 0xfc, 0xff, 0xff,                         // ADDA.W #$FFFF,A0
    0x91, 0xc1,                                     // SUBA.L D1,A0
  ]);
  cpu.a[0] = 0x1000;
  cpu.d[1] = 0x10;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.CARRY;
  const flags = cpu.sr;
  cpu.step();
  assert.equal(cpu.a[0], 0x0fff);
  cpu.step();
  assert.equal(cpu.a[0], 0x0fef);
  assert.equal(cpu.sr, flags);
});

test("ADD Dn,(An) escreve através do modo de destino em memória", () => {
  const { bus, cpu } = createCpu([0xd1, 0x10]); // ADD.B D0,(A0)
  cpu.a[0] = RAM + 0x200;
  cpu.d[0] = 3;
  bus.write8(cpu.a[0], 4);
  cpu.step();
  assert.equal(bus.read8(cpu.a[0]), 7);
});

test("um modo efetivo inválido entra pelo vetor de instrução ilegal", () => {
  const { cpu } = createCpu([0x4a, 0x48]); // TST.W A0 não existe no MC68000.
  cpu.step();
  assert.equal(cpu.lastException.vector, 4);
  assert.equal(cpu.pc, RAM + 0x800);
});

test("MOVE inválido não aplica efeitos laterais ao operando de origem", () => {
  // MOVE.B (A0)+,A1 é inválido porque MOVEA não aceita byte.
  const { bus, cpu } = createCpu([0x12, 0x58]);
  cpu.a[0] = RAM + 0x300;
  bus.write8(cpu.a[0], 0xaa);
  const sourceAddress = cpu.a[0];
  cpu.step();
  assert.equal(cpu.a[0], sourceAddress);
  assert.equal(cpu.lastException.vector, 4);
});
