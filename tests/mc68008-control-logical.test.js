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

function createCpu(program, { sp = RAM + 0x1800 } = {}) {
  const bus = new QLBus();
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  put32(rom, 0, sp);
  put32(rom, 4, RAM);
  put32(rom, M68K_VECTOR.ILLEGAL_INSTRUCTION * 4, RAM + 0x800);
  put32(rom, M68K_VECTOR.PRIVILEGE_VIOLATION * 4, RAM + 0x820);
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("JSR guarda o retorno depois das extensões e RTS regressa", () => {
  const target = RAM + 0x20;
  const { bus, cpu } = createCpu([
    0x4e, 0xb9, 0x00, 0x02, 0x00, 0x20,             // JSR $20020.L
  ]);
  bus.loadRam(target, Uint8Array.of(0x4e, 0x75));
  const initialSp = cpu.a[7];

  cpu.step();
  assert.equal(cpu.pc, target);
  assert.equal(cpu.a[7], initialSp - 4);
  assert.equal(bus.read32(cpu.a[7]), RAM + 6);
  cpu.step();
  assert.equal(cpu.pc, RAM + 6);
  assert.equal(cpu.a[7], initialSp);
});

test("JMP transfere o controlo sem modificar a pilha", () => {
  const { cpu } = createCpu([0x4e, 0xf9, 0x00, 0x02, 0x03, 0x00]);
  const initialSp = cpu.a[7];
  cpu.step();
  assert.equal(cpu.pc, RAM + 0x300);
  assert.equal(cpu.a[7], initialSp);
});

test("PEA coloca o endereço efetivo na pilha", () => {
  const { bus, cpu } = createCpu([0x48, 0x79, 0x00, 0x03, 0x45, 0x60]);
  const initialSp = cpu.a[7];
  cpu.step();
  assert.equal(cpu.a[7], initialSp - 4);
  assert.equal(bus.read32(cpu.a[7]), 0x34560);
});

test("LINK e UNLK criam e desfazem um frame de pilha", () => {
  const { bus, cpu } = createCpu([
    0x4e, 0x52, 0xff, 0xf0,                         // LINK A2,#-16
    0x4e, 0x5a,                                     // UNLK A2
  ]);
  const initialSp = cpu.a[7];
  cpu.a[2] = 0x1234_5678;

  cpu.step();
  assert.equal(cpu.a[2], initialSp - 4);
  assert.equal(cpu.a[7], initialSp - 20);
  assert.equal(bus.read32(initialSp - 4), 0x1234_5678);
  cpu.step();
  assert.equal(cpu.a[2], 0x1234_5678);
  assert.equal(cpu.a[7], initialSp);
});

test("ADDI e SUBI alteram o destino e calculam flags", () => {
  const { cpu } = createCpu([
    0x06, 0x00, 0x00, 0x01,                         // ADDI.B #1,D0
    0x04, 0x40, 0x00, 0x02,                         // SUBI.W #2,D0
  ]);
  cpu.d[0] = 0x7f;
  cpu.step();
  assert.equal(cpu.d[0], 0x80);
  assert.equal(cpu.sr & M68K_SR.OVERFLOW, M68K_SR.OVERFLOW);
  cpu.step();
  assert.equal(cpu.d[0], 0x7e);
  assert.equal(cpu.sr & M68K_SR.CARRY, 0);
});

test("CMPI compara sem escrever e preserva X", () => {
  const { cpu } = createCpu([
    0x0c, 0x80, 0x00, 0x00, 0x00, 0x10,             // CMPI.L #$10,D0
  ]);
  cpu.d[0] = 0x10;
  cpu.sr |= M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 0x10);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
});

test("ORI, ANDI e EORI funcionam sobre registos de dados", () => {
  const { cpu } = createCpu([
    0x00, 0x00, 0x00, 0x0f,                         // ORI.B #$0F,D0
    0x02, 0x40, 0x00, 0xf0,                         // ANDI.W #$00F0,D0
    0x0a, 0x80, 0x00, 0x00, 0x00, 0xa0,             // EORI.L #$A0,D0
  ]);
  cpu.d[0] = 0x1234_5600;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_560f);
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_0000);
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_00a0);
});

test("OR, AND e EOR suportam operações entre registos", () => {
  const { cpu } = createCpu([
    0x80, 0x01,                                     // OR.B D1,D0
    0xc0, 0x41,                                     // AND.W D1,D0
    0xb3, 0x80,                                     // EOR.L D1,D0
  ]);
  cpu.d[0] = 0x1234_00f0;
  cpu.d[1] = 0x0000_0f0f;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_00ff);
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_000f);
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_0f00);
});

test("operações lógicas com destino em memória preservam X", () => {
  const { bus, cpu } = createCpu([0x81, 0x10, 0xc1, 0x10]); // OR.B D0,(A0); AND.B D0,(A0)
  cpu.a[0] = RAM + 0x400;
  cpu.d[0] = 0x0f;
  cpu.sr |= M68K_SR.EXTEND;
  bus.write8(cpu.a[0], 0xf0);
  cpu.step();
  assert.equal(bus.read8(cpu.a[0]), 0xff);
  cpu.step();
  assert.equal(bus.read8(cpu.a[0]), 0x0f);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
});

test("ORI, ANDI e EORI podem modificar apenas o CCR", () => {
  const { cpu } = createCpu([
    0x00, 0x3c, 0x00, 0x15,                         // ORI #$15,CCR
    0x02, 0x3c, 0x00, 0x11,                         // ANDI #$11,CCR
    0x0a, 0x3c, 0x00, 0x01,                         // EORI #$01,CCR
  ]);
  cpu.step();
  assert.equal(cpu.sr & 0x1f, 0x15);
  cpu.step();
  assert.equal(cpu.sr & 0x1f, 0x11);
  cpu.step();
  assert.equal(cpu.sr & 0x1f, 0x10);
  assert.equal(cpu.sr & 0xff00, 0x2700);
});

test("ANDI para SR respeita os bits implementados", () => {
  const { cpu } = createCpu([0x02, 0x7c, 0xf8, 0xff]); // ANDI #$F8FF,SR
  cpu.step();
  assert.equal(cpu.sr, 0x2000);
  assert.equal(cpu.supervisor, true);
});

test("alterar SR em modo utilizador provoca violação de privilégio", () => {
  const { cpu } = createCpu([0x00, 0x7c, 0x07, 0x00]); // ORI #$0700,SR
  cpu.usp = RAM + 0x1000;
  cpu.setStatusRegister(cpu.sr & ~M68K_SR.SUPERVISOR);
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.PRIVILEGE_VIOLATION);
  assert.equal(cpu.pc, RAM + 0x820);
  assert.equal(cpu.supervisor, true);
});
