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

test("Scc escreve $FF ou $00 sem alterar os códigos de condição", () => {
  const { cpu } = createCpu([
    0x56, 0xc0, // SNE D0
    0x57, 0xc1, // SEQ D1
  ]);
  cpu.d[0] = 0x1234_5600;
  cpu.d[1] = 0xabcd_efff;
  const sr = cpu.sr;

  cpu.step();
  assert.equal(cpu.d[0], 0x1234_56ff);
  assert.equal(cpu.sr, sr);
  cpu.step();
  assert.equal(cpu.d[1], 0xabcd_ef00);
  assert.equal(cpu.sr, sr);
});

test("Scc suporta destinos em memória e os seus efeitos laterais", () => {
  const { bus, cpu } = createCpu([0x50, 0xdf]); // ST (A7)+
  cpu.a[7] = RAM + 0x400;
  cpu.step();
  assert.equal(bus.read8(RAM + 0x400), 0xff);
  assert.equal(cpu.a[7], RAM + 0x402);
});

test("DBF usa o endereço da extensão como base do deslocamento", () => {
  const { cpu } = createCpu([0x51, 0xc8, 0xff, 0xfe]); // DBF D0,$20000
  cpu.d[0] = 0x1234_0001;

  assert.equal(cpu.step(), 18);
  assert.equal(cpu.d[0], 0x1234_0000);
  assert.equal(cpu.pc, RAM);
  assert.equal(cpu.step(), 26);
  assert.equal(cpu.d[0], 0x1234_ffff);
  assert.equal(cpu.pc, RAM + 4);
});

test("DBcc não decrementa nem ramifica quando a condição é verdadeira", () => {
  const { cpu } = createCpu([0x56, 0xc8, 0x00, 0x20]); // DBNE D0,$20
  cpu.d[0] = 0xabcd_0003;
  cpu.sr &= ~M68K_SR.ZERO;
  assert.equal(cpu.step(), 20);
  assert.equal(cpu.d[0], 0xabcd_0003);
  assert.equal(cpu.pc, RAM + 4);
});

test("DBcc termina sem ramificar quando o contador passa de zero para -1", () => {
  const { cpu } = createCpu([0x56, 0xc8, 0xff, 0xfe]); // DBNE D0,$20000
  cpu.d[0] = 0xface_0000;
  cpu.sr |= M68K_SR.ZERO;
  assert.equal(cpu.step(), 26);
  assert.equal(cpu.d[0], 0xface_ffff);
  assert.equal(cpu.pc, RAM + 4);
});

test("um destino Scc inválido entra pelo vetor de instrução ilegal", () => {
  const { cpu } = createCpu([0x56, 0xfa]); // SNE (d16,PC)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
  assert.equal(cpu.pc, RAM + 0x800);
});
