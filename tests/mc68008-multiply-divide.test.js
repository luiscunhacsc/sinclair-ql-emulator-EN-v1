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
  put32(rom, M68K_VECTOR.DIVIDE_BY_ZERO * 4, RAM + 0x820);
  put32(rom, M68K_VECTOR.CHK * 4, RAM + 0x840);
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("MULU multiplica as palavras baixas e produz 32 bits", () => {
  const { cpu } = createCpu([0xc0, 0xfc, 0xff, 0xff]); // MULU.W #$FFFF,D0
  cpu.d[0] = 0xaaaa_0002;
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY | M68K_SR.OVERFLOW;
  cpu.step();
  assert.equal(cpu.d[0], 0x0001_fffe);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
  assert.equal(cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.ZERO | M68K_SR.OVERFLOW | M68K_SR.CARRY), 0);
});

test("MULS interpreta ambos os operandos como palavras com sinal", () => {
  const { cpu } = createCpu([0xc1, 0xc1]); // MULS.W D1,D0
  cpu.d[0] = 0x1234_fffe;
  cpu.d[1] = 3;
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_fffa);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("MULU define Z quando o produto é zero", () => {
  const { cpu } = createCpu([0xc0, 0xc1]); // MULU.W D1,D0
  cpu.d[0] = 0xffff;
  cpu.d[1] = 0;
  cpu.step();
  assert.equal(cpu.d[0], 0);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
});

test("MULU rejeita registos de endereço como fonte", () => {
  const { cpu } = createCpu([0xc0, 0xc8]); // MULU.W A0,D0 (inválido)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
});

test("DIVU guarda o resto na palavra alta e o quociente na baixa", () => {
  const { cpu } = createCpu([0x80, 0xfc, 0x00, 0x09]); // DIVU.W #9,D0
  cpu.d[0] = 100;
  cpu.step();
  assert.equal(cpu.d[0], 0x0001_000b);
  assert.equal(cpu.sr & (M68K_SR.NEGATIVE | M68K_SR.ZERO | M68K_SR.OVERFLOW | M68K_SR.CARRY), 0);
});

test("DIVS arredonda para zero e dá ao resto o sinal do dividendo", () => {
  const { cpu } = createCpu([0x81, 0xc1]); // DIVS.W D1,D0
  cpu.d[0] = (-100) >>> 0;
  cpu.d[1] = 9;
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_fff5); // resto -1, quociente -11
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("DIVS conserva um resto positivo com um divisor negativo", () => {
  const { cpu } = createCpu([0x81, 0xc1]); // DIVS.W D1,D0
  cpu.d[0] = 100;
  cpu.d[1] = 0xfff7; // -9
  cpu.step();
  assert.equal(cpu.d[0], 0x0001_fff5); // resto 1, quociente -11
});

test("DIVU com overflow preserva o destino e define apenas V entre V e C", () => {
  const { cpu } = createCpu([0x80, 0xfc, 0x00, 0x01]); // DIVU.W #1,D0
  cpu.d[0] = 0xffff_ffff;
  cpu.sr |= M68K_SR.EXTEND | M68K_SR.CARRY;
  cpu.step();
  assert.equal(cpu.d[0], 0xffff_ffff);
  assert.equal(cpu.sr & M68K_SR.OVERFLOW, M68K_SR.OVERFLOW);
  assert.equal(cpu.sr & M68K_SR.CARRY, 0);
  assert.equal(cpu.sr & M68K_SR.EXTEND, M68K_SR.EXTEND);
});

test("DIVS deteta o overflow especial de -2147483648 dividido por -1", () => {
  const { cpu } = createCpu([0x81, 0xfc, 0xff, 0xff]); // DIVS.W #-1,D0
  cpu.d[0] = 0x8000_0000;
  cpu.step();
  assert.equal(cpu.d[0], 0x8000_0000);
  assert.equal(cpu.sr & M68K_SR.OVERFLOW, M68K_SR.OVERFLOW);
});

test("divisão por zero usa o vetor 5 e preserva o dividendo", () => {
  const { bus, cpu } = createCpu([0x80, 0xfc, 0x00, 0x00]); // DIVU.W #0,D0
  const stack = cpu.a[7];
  cpu.d[0] = 0x1234_5678;
  cpu.step();
  assert.equal(cpu.d[0], 0x1234_5678);
  assert.equal(cpu.lastException.vector, M68K_VECTOR.DIVIDE_BY_ZERO);
  assert.equal(cpu.lastException.pc, RAM + 4);
  assert.equal(cpu.pc, RAM + 0x820);
  assert.equal(bus.read32(stack - 4), RAM + 4);
});

test("CHK deixa prosseguir um valor dentro do intervalo", () => {
  const { cpu } = createCpu([0x41, 0xbc, 0x00, 0x0a]); // CHK.W #10,D0
  cpu.d[0] = 10;
  const sr = cpu.sr;
  cpu.step();
  assert.equal(cpu.pc, RAM + 4);
  assert.equal(cpu.lastException, null);
  assert.equal(cpu.sr, sr);
});

test("CHK usa N para distinguir um valor negativo", () => {
  const { cpu } = createCpu([0x41, 0xbc, 0x00, 0x0a]); // CHK.W #10,D0
  cpu.d[0] = 0xffff;
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.CHK);
  assert.equal(cpu.lastException.pc, RAM + 4);
  assert.equal(cpu.pc, RAM + 0x840);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, M68K_SR.NEGATIVE);
});

test("CHK limpa N quando o valor excede o limite superior", () => {
  const { cpu } = createCpu([0x41, 0xbc, 0x00, 0x0a]); // CHK.W #10,D0
  cpu.d[0] = 11;
  cpu.sr |= M68K_SR.NEGATIVE;
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.CHK);
  assert.equal(cpu.sr & M68K_SR.NEGATIVE, 0);
});

test("CHK rejeita registos de endereço como fonte", () => {
  const { cpu } = createCpu([0x41, 0x88]); // CHK.W A0,D0 (inválido)
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.ILLEGAL_INSTRUCTION);
});
