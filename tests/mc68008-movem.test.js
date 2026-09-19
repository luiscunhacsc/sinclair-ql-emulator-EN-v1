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

test("MOVEM.L guarda registos em memória pela ordem D0-D7, A0-A7", () => {
  const { bus, cpu } = createCpu([0x48, 0xd0, 0x02, 0x05]); // MOVEM.L D0/D2/A1,(A0)
  cpu.a[0] = RAM + 0x400;
  cpu.d[0] = 0x1111_1111;
  cpu.d[2] = 0x2222_2222;
  cpu.a[1] = 0x3333_3333;
  const sr = cpu.sr;
  cpu.step();
  assert.equal(bus.read32(RAM + 0x400), 0x1111_1111);
  assert.equal(bus.read32(RAM + 0x404), 0x2222_2222);
  assert.equal(bus.read32(RAM + 0x408), 0x3333_3333);
  assert.equal(cpu.a[0], RAM + 0x400);
  assert.equal(cpu.sr, sr);
});

test("MOVEM.W guarda apenas a palavra baixa de cada registo", () => {
  const { bus, cpu } = createCpu([0x48, 0x90, 0x02, 0x01]); // MOVEM.W D0/A1,(A0)
  cpu.a[0] = RAM + 0x400;
  cpu.d[0] = 0x1234_abcd;
  cpu.a[1] = 0x5678_ef01;
  cpu.step();
  assert.equal(bus.read16(RAM + 0x400), 0xabcd);
  assert.equal(bus.read16(RAM + 0x402), 0xef01);
});

test("MOVEM.L pré-decrementado inverte a máscara e a ordem de transferência", () => {
  const { bus, cpu } = createCpu([0x48, 0xe0, 0x40, 0x21]); // MOVEM.L D1/A2/A7,-(A0)
  cpu.a[0] = RAM + 0x500;
  cpu.d[1] = 0x1111_1111;
  cpu.a[2] = 0x2222_2222;
  cpu.a[7] = 0x7777_7777;
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x4f4);
  assert.equal(bus.read32(RAM + 0x4f4), 0x1111_1111);
  assert.equal(bus.read32(RAM + 0x4f8), 0x2222_2222);
  assert.equal(bus.read32(RAM + 0x4fc), 0x7777_7777);
});

test("MOVEM pré-decrementado guarda o valor inicial do registo base no MC68008", () => {
  const { bus, cpu } = createCpu([0x48, 0xa0, 0x00, 0x80]); // MOVEM.W A0,-(A0)
  cpu.a[0] = RAM + 0x600;
  cpu.step();
  assert.equal(cpu.a[0], RAM + 0x5fe);
  assert.equal(bus.read16(RAM + 0x5fe), (RAM + 0x600) & 0xffff);
});

test("MOVEM.L carrega registos a partir de memória sem alterar a base", () => {
  const { bus, cpu } = createCpu([0x4c, 0xd0, 0x04, 0x02]); // MOVEM.L (A0),D1/A2
  cpu.a[0] = RAM + 0x400;
  bus.write32(RAM + 0x400, 0x1234_5678);
  bus.write32(RAM + 0x404, 0x89ab_cdef);
  cpu.step();
  assert.equal(cpu.d[1], 0x1234_5678);
  assert.equal(cpu.a[2], 0x89ab_cdef);
  assert.equal(cpu.a[0], RAM + 0x400);
});

test("MOVEM.W estende o sinal ao carregar registos de dados e endereço", () => {
  const { bus, cpu } = createCpu([0x4c, 0x90, 0x02, 0x01]); // MOVEM.W (A0),D0/A1
  cpu.a[0] = RAM + 0x400;
  bus.write16(RAM + 0x400, 0x8001);
  bus.write16(RAM + 0x402, 0x7fff);
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_8001);
  assert.equal(cpu.a[1], 0x0000_7fff);
});

test("MOVEM pós-incrementado ignora a carga do registo base e conserva o endereço final", () => {
  const { bus, cpu } = createCpu([0x4c, 0xd8, 0x01, 0x02]); // MOVEM.L (A0)+,D1/A0
  cpu.a[0] = RAM + 0x400;
  bus.write32(RAM + 0x400, 0x1111_1111);
  bus.write32(RAM + 0x404, 0xdead_beef);
  cpu.step();
  assert.equal(cpu.d[1], 0x1111_1111);
  assert.equal(cpu.a[0], RAM + 0x408);
});

test("MOVEM aceita endereçamento relativo ao PC ao carregar registos", () => {
  const { bus, cpu } = createCpu([0x4c, 0xba, 0x00, 0x01, 0x01, 0x00]); // MOVEM.W (256,PC),D0
  bus.write16(RAM + 0x104, 0xfffe);
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_fffe);
  assert.equal(cpu.pc, RAM + 6);
});

test("MOVEM rejeita pós-incremento na direção registos para memória", () => {
  const { cpu } = createCpu([0x48, 0xd8, 0x00, 0x01]); // MOVEM.L D0,(A0)+ (inválido)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
});

test("MOVEM rejeita pré-decremento na direção memória para registos", () => {
  const { cpu } = createCpu([0x4c, 0xe0, 0x00, 0x01]); // MOVEM.L -(A0),D0 (inválido)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
});
