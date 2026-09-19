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

function createCpu(program = [0x4e, 0x71]) {
  const bus = new QLBus();
  const rom = new Uint8Array(QL_MEMORY.internalRomSize);
  put32(rom, 0, RAM + 0x1800);
  put32(rom, 4, RAM);
  for (let level = 1; level <= 7; level += 1) {
    put32(rom, (M68K_VECTOR.AUTOVECTOR_BASE + level) * 4, RAM + 0x800 + level * 0x20);
  }
  bus.loadRom(rom);
  bus.loadRam(RAM, Uint8Array.from(program));
  const cpu = new MC68008(bus);
  cpu.reset();
  return { bus, cpu };
}

test("uma interrupção acima da máscara é aceite antes da instrução seguinte", () => {
  const { bus, cpu } = createCpu();
  const initialSp = cpu.a[7];
  cpu.sr = M68K_SR.SUPERVISOR | 0x0100 | M68K_SR.ZERO;
  cpu.setInterruptLevel(3);
  cpu.step();
  assert.equal(cpu.pc, RAM + 0x860);
  assert.equal(cpu.sr & M68K_SR.INTERRUPT_MASK, 0x0300);
  assert.equal(cpu.sr & M68K_SR.ZERO, M68K_SR.ZERO);
  assert.equal(cpu.a[7], initialSp - 6);
  assert.equal(bus.read16(initialSp - 6), M68K_SR.SUPERVISOR | 0x0100 | M68K_SR.ZERO);
  assert.equal(bus.read32(initialSp - 4), RAM);
  assert.deepEqual(cpu.lastException, {
    vector: M68K_VECTOR.AUTOVECTOR_BASE + 3,
    pc: RAM,
  });
});

test("uma interrupção mascarada fica pendente enquanto a CPU executa", () => {
  const { cpu } = createCpu([0x4e, 0x71, 0x4e, 0x71]);
  cpu.sr = M68K_SR.SUPERVISOR | 0x0300;
  cpu.setInterruptLevel(2);
  cpu.step();
  assert.equal(cpu.pc, RAM + 2);
  assert.equal(cpu.lastException, null);
  cpu.sr &= ~M68K_SR.INTERRUPT_MASK;
  cpu.step();
  assert.equal(cpu.pc, RAM + 0x840);
  assert.equal(cpu.lastException.vector, M68K_VECTOR.AUTOVECTOR_BASE + 2);
});

test("uma interrupção aceite troca a pilha de utilizador pela de supervisor", () => {
  const { bus, cpu } = createCpu();
  const supervisorStack = cpu.a[7];
  const userStack = RAM + 0x1200;
  cpu.usp = userStack;
  cpu.setStatusRegister(0);
  cpu.setInterruptLevel(1);
  cpu.step();
  assert.equal(cpu.supervisor, true);
  assert.equal(cpu.usp, userStack);
  assert.equal(cpu.a[7], supervisorStack - 6);
  assert.equal(bus.read16(supervisorStack - 6), 0);
});

test("uma interrupção não mascarada retira a CPU de STOP", () => {
  const { cpu } = createCpu([0x4e, 0x72, 0x23, 0x00]); // STOP #$2300
  cpu.step();
  assert.equal(cpu.stopped, true);
  cpu.setInterruptLevel(4);
  cpu.step();
  assert.equal(cpu.stopped, false);
  assert.equal(cpu.pc, RAM + 0x880);
  assert.equal(cpu.lastException.vector, M68K_VECTOR.AUTOVECTOR_BASE + 4);
});

test("o nível 7 atravessa a máscara 7 apenas numa nova transição", () => {
  const { cpu } = createCpu();
  cpu.setInterruptLevel(7);
  cpu.step();
  assert.equal(cpu.lastException.vector, M68K_VECTOR.AUTOVECTOR_BASE + 7);
  const handler = cpu.pc;
  const firstStack = cpu.a[7];
  cpu.step();
  assert.equal(cpu.pc, handler + 4);
  assert.equal(cpu.a[7], firstStack);
  cpu.setInterruptLevel(0);
  cpu.setInterruptLevel(7);
  cpu.step();
  assert.equal(cpu.lastException.pc, handler + 4);
  assert.equal(cpu.a[7], firstStack - 6);
  assert.equal(cpu.pc, handler);
});

test("o nível de interrupção só aceita inteiros entre zero e sete", () => {
  const { cpu } = createCpu();
  assert.throws(() => cpu.setInterruptLevel(-1), RangeError);
  assert.throws(() => cpu.setInterruptLevel(8), RangeError);
  assert.throws(() => cpu.setInterruptLevel(1.5), RangeError);
});
