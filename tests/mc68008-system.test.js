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
  put32(rom, M68K_VECTOR.TRAPV * 4, RAM + 0x840);
  put32(rom, M68K_VECTOR.PRIVILEGE_VIOLATION * 4, RAM + 0x860);
  for (let vector = 0; vector < 16; vector += 1) {
    put32(rom, (M68K_VECTOR.TRAP_BASE + vector) * 4, RAM + 0x900 + vector * 0x10);
  }
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("MOVE from SR não é privilegiado no MC68008", () => {
  const { cpu } = createCpu([0x40, 0xc0]); // MOVE SR,D0
  cpu.d[0] = 0x1234_0000;
  cpu.usp = RAM + 0x1000;
  cpu.setStatusRegister(0x0015);
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_0015);
  assert.equal(cpu.lastException, null);
});

test("MOVE from SR lê a memória antes de a escrever", () => {
  const { bus, cpu } = createCpu([0x40, 0xd8]); // MOVE SR,(A0)+
  cpu.a[0] = RAM + 0x400;
  bus.write16(cpu.a[0], 0xaaaa);
  const cycles = cpu.cycles;
  assert.equal(cpu.step(), 24); // opcode + leitura da palavra + escrita da palavra
  assert.equal(cpu.cycles - cycles, 24);
  assert.equal(bus.read16(RAM + 0x400), 0x2700);
  assert.equal(cpu.a[0], RAM + 0x402);
});

test("MOVE to CCR funciona em modo utilizador e preserva o resto do SR", () => {
  const { cpu } = createCpu([0x44, 0xfc, 0xff, 0x15]); // MOVE #$FF15,CCR
  cpu.usp = RAM + 0x1000;
  cpu.setStatusRegister(0x0100);
  cpu.step();
  assert.equal(cpu.sr, 0x0115);
  assert.equal(cpu.supervisor, false);
});

test("MOVE to SR altera o modo e seleciona a pilha correspondente", () => {
  const { cpu } = createCpu([0x46, 0xfc, 0x00, 0x14]); // MOVE #$0014,SR
  const supervisorStack = cpu.a[7];
  cpu.usp = RAM + 0x1000;
  cpu.step();
  assert.equal(cpu.sr, 0x0014);
  assert.equal(cpu.supervisor, false);
  assert.equal(cpu.a[7], RAM + 0x1000);
  assert.equal(cpu.ssp, supervisorStack);
});

test("MOVE to SR em modo utilizador gera violação antes de ler o operando", () => {
  const { bus, cpu } = createCpu([0x46, 0xfc, 0x12, 0x34]); // MOVE #$1234,SR
  const supervisorStack = cpu.a[7];
  cpu.usp = RAM + 0x1000;
  cpu.setStatusRegister(0);
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.PRIVILEGE_VIOLATION);
  assert.equal(cpu.lastException.pc, RAM);
  assert.equal(cpu.pc, RAM + 0x860);
  assert.equal(bus.read32(supervisorStack - 4), RAM);
});

test("MOVE USP transfere nos dois sentidos sem alterar flags", () => {
  const { cpu } = createCpu([0x4e, 0x61, 0x4e, 0x6a]); // MOVE A1,USP; MOVE USP,A2
  cpu.a[1] = 0x1234_5678;
  const sr = cpu.sr;
  cpu.step();
  assert.equal(cpu.usp, 0x1234_5678);
  cpu.step();
  assert.equal(cpu.a[2], 0x1234_5678);
  assert.equal(cpu.sr, sr);
});

test("MOVE USP é privilegiado", () => {
  const { cpu } = createCpu([0x4e, 0x60]); // MOVE A0,USP
  cpu.usp = RAM + 0x1000;
  cpu.setStatusRegister(0);
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.PRIVILEGE_VIOLATION);
  assert.equal(cpu.pc, RAM + 0x860);
});

test("TAS testa o valor original antes de definir o bit 7", () => {
  const { cpu } = createCpu([0x4a, 0xc0]); // TAS D0
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY | M68K_SR.OVERFLOW;
  cpu.step();
  assert.equal(cpu.d[0], 0x80);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, 0);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
  assert.equal(cpu.sr & (M68K_SR.CARRY | M68K_SR.OVERFLOW), 0);
});

test("TAS suporta memória e calcula N a partir do valor anterior", () => {
  const { bus, cpu } = createCpu([0x4a, 0xd8]); // TAS (A0)+
  cpu.a[0] = RAM + 0x400;
  bus.write8(cpu.a[0], 0x81);
  cpu.step();
  assert.equal(bus.read8(RAM + 0x400), 0x81);
  assert.equal(cpu.a[0], RAM + 0x401);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
  assert.equal(cpu.sr & M68K_SR.ZERO, 0);
});

test("TRAP seleciona um dos dezasseis vetores e empilha o PC seguinte", () => {
  const { bus, cpu } = createCpu([0x4e, 0x43]); // TRAP #3
  const stack = cpu.a[7];
  const oldSr = cpu.sr;
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.TRAP_BASE + 3);
  assert.equal(cpu.pc, RAM + 0x930);
  assert.equal(cpu.a[7], stack - 6);
  assert.equal(bus.read16(stack - 6), oldSr);
  assert.equal(bus.read32(stack - 4), RAM + 2);
});

test("TRAP em modo utilizador muda para a pilha de supervisor", () => {
  const { bus, cpu } = createCpu([0x4e, 0x40]); // TRAP #0
  const supervisorStack = cpu.a[7];
  const userStack = RAM + 0x1000;
  cpu.usp = userStack;
  cpu.setStatusRegister(M68K_SR.ZERO);
  cpu.step();
  assert.equal(cpu.supervisor, true);
  assert.equal(cpu.usp, userStack);
  assert.equal(cpu.a[7], supervisorStack - 6);
  assert.equal(bus.read16(supervisorStack - 6), M68K_SR.ZERO);
  assert.equal(cpu.pc, RAM + 0x900);
});

test("TRAPV só gera a exceção quando V está definido", () => {
  const { cpu } = createCpu([0x4e, 0x76, 0x4e, 0x76]); // TRAPV; TRAPV
  cpu.step();
  assert.equal(cpu.pc, RAM + 2);
  assert.equal(cpu.lastException, null);
  cpu.sr |= M68K_SR.OVERFLOW;
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.TRAPV);
  assert.equal(cpu.lastException.pc, RAM + 4);
  assert.equal(cpu.pc, RAM + 0x840);
});
