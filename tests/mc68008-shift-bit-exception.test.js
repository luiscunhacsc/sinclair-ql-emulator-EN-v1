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

test("ADDQ usa oito quando o campo imediato é zero", () => {
  const { cpu } = createCpu([0x50, 0x00]); // ADDQ.B #8,D0
  cpu.d[0] = 0xfa;
  cpu.step();
  assert.equal(cpu.d[0], 0x02);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("SUBQ sobre An opera sempre em 32 bits e não altera flags", () => {
  const { cpu } = createCpu([0x51, 0x88]); // SUBQ.L #8,A0
  cpu.a[0] = 4;
  cpu.sr |= M68K_SR.ZERO | M68K_SR.CARRY;
  const sr = cpu.sr;
  cpu.step();
  assert.equal(cpu.a[0], 0xffff_fffc);
  assert.equal(cpu.sr, sr);
});

test("ADDQ aceita destinos em memória", () => {
  const { bus, cpu } = createCpu([0x52, 0x50]); // ADDQ.W #1,(A0)
  cpu.a[0] = RAM + 0x400;
  bus.write16(cpu.a[0], 0xffff);
  cpu.step();
  assert.equal(bus.read16(cpu.a[0]), 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
});

test("BTST e BCHG usam módulo 32 nos registos", () => {
  const { cpu } = createCpu([0x03, 0x00, 0x03, 0x40]); // BTST D1,D0; BCHG D1,D0
  cpu.d[0] = 0x8000_0000;
  cpu.d[1] = 63;
  cpu.step();
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
});

test("BTST dinâmico aceita um operando imediato", () => {
  const { cpu } = createCpu([0x03, 0x3c, 0x00, 0x02]); // BTST D1,#$02
  cpu.d[1] = 1;
  cpu.step();
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
  assert.equal(cpu.pc, RAM + 4);
});

test("BCLR imediato testa antes de limpar o bit", () => {
  const { cpu } = createCpu([0x08, 0x80, 0x00, 0x1f]); // BCLR #31,D0
  cpu.d[0] = 0x8000_0000;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
});

test("BSET usa módulo 8 quando o destino está em memória", () => {
  const { bus, cpu } = createCpu([0x08, 0xd0, 0x00, 0x09]); // BSET #9,(A0)
  cpu.a[0] = RAM + 0x400;
  bus.write8(cpu.a[0], 0);
  cpu.step();
  assert.equal(bus.read8(cpu.a[0]), 0x02);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
});

test("ASR preserva o sinal e copia o último bit para C e X", () => {
  const { cpu } = createCpu([0xe2, 0x40]); // ASR.W #1,D0
  cpu.d[0] = 0x8001;
  cpu.step();
  assert.equal(cpu.d[0], 0xc000);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("ASL assinala overflow quando o sinal muda", () => {
  const { cpu } = createCpu([0xe3, 0x00]); // ASL.B #1,D0
  cpu.d[0] = 0x40;
  cpu.step();
  assert.equal(cpu.d[0], 0x80);
  assert.equal(cpu.sr & M68K_SR.OVERFLOW, M68K_SR.OVERFLOW);
});

test("LSL pode produzir zero com carry e extend", () => {
  const { cpu } = createCpu([0xe3, 0x08]); // LSL.B #1,D0
  cpu.d[0] = 0x80;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("ROXL usa X como bit de entrada e atualiza X e C", () => {
  const { cpu } = createCpu([0xe3, 0x90]); // ROXL.L #1,D0
  cpu.d[0] = 0x8000_0000;
  cpu.sr |= M68K_SR.EXTEND;
  cpu.step();
  assert.equal(cpu.d[0], 1);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("uma contagem de registo igual a zero preserva X e limpa C", () => {
  const { cpu } = createCpu([0xe3, 0xa8]); // LSL.L D1,D0
  cpu.d[0] = 0x8000_0000;
  cpu.d[1] = 0;
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY;
  cpu.step();
  assert.equal(cpu.d[0], 0x8000_0000);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
  assert.equal(cpu.sr & M68K_SR.CARRY, 0);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("a forma de memória desloca sempre uma palavra uma posição", () => {
  const { bus, cpu } = createCpu([0xe3, 0xd0]); // LSL.W (A0)
  cpu.a[0] = RAM + 0x400;
  bus.write16(cpu.a[0], 0x8001);
  cpu.step();
  assert.equal(bus.read16(cpu.a[0]), 0x0002);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.EXTEND), M68K_SR.CARRY | M68K_SR.EXTEND);
});

test("RTE restaura SR, PC e a pilha de utilizador", () => {
  const { bus, cpu } = createCpu([0x4a, 0xfc]); // ILLEGAL
  const userStack = RAM + 0x1000;
  cpu.usp = userStack;
  cpu.setStatusRegister(0x0004); // utilizador, Z=1
  bus.loadRam(RAM + 0x800, Uint8Array.of(0x4e, 0x73));

  cpu.step();
  assert.equal(cpu.supervisor, true);
  assert.equal(cpu.pc, RAM + 0x800);
  cpu.step();
  assert.equal(cpu.supervisor, false);
  assert.equal(cpu.sr, 0x0004);
  assert.equal(cpu.pc, RAM);
  assert.equal(cpu.a[7], userStack);
});

test("RTE em modo utilizador provoca violação de privilégio", () => {
  const { cpu } = createCpu([0x4e, 0x73]);
  cpu.usp = RAM + 0x1000;
  cpu.setStatusRegister(0);
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.PRIVILEGE_VIOLATION);
  assert.equal(cpu.pc, RAM + 0x820);
});

test("RTR restaura apenas o CCR e o PC", () => {
  const { bus, cpu } = createCpu([0x4e, 0x77]);
  const stack = RAM + 0x600;
  cpu.a[7] = stack;
  bus.write16(stack, 0x0015);
  bus.write32(stack + 2, RAM + 0x700);
  cpu.step();
  assert.equal(cpu.sr, 0x2715);
  assert.equal(cpu.pc, RAM + 0x700);
  assert.equal(cpu.a[7], stack + 6);
});

test("STOP imobiliza a CPU depois de carregar o SR", () => {
  const { cpu } = createCpu([0x4e, 0x72, 0x20, 0x00]);
  cpu.step();
  assert.equal(cpu.stopped, true);
  assert.equal(cpu.sr, 0x2000);
  assert.equal(cpu.step(), 0);
});

test("RESET chama o reset dos dispositivos sem reiniciar a CPU", () => {
  const { bus, cpu } = createCpu([0x4e, 0x70]);
  let resets = 0;
  bus.resetDevices = () => { resets += 1; };
  const pc = cpu.pc;
  cpu.step();
  assert.equal(resets, 1);
  assert.equal(cpu.pc, pc + 2);
});
