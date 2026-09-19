import fs from "node:fs";

import { MC68008 } from "../src/core/mc68008.js";

const FILE_MAGIC = 0x1a3f5d71;
const TEST_MAGIC = 0xabc12367;
const NAME_MAGIC = 0x89abcdef;
const STATE_MAGIC = 0x01234567;
const TRANSACTIONS_MAGIC = 0x456789ab;
const ADDRESS_MASK = 0x00ffffff;
const SR_TRACE = 0x8000;
const SR_SUPERVISOR = 0x2000;
const SR_NEGATIVE = 0x0008;
const SR_ZERO = 0x0004;
const SR_OVERFLOW = 0x0002;
const REGISTER_ORDER = [
  "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7",
  "a0", "a1", "a2", "a3", "a4", "a5", "a6",
  "usp", "ssp", "sr", "pc",
];

class BinaryCursor {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset,
      this.bytes.byteLength,
    );
    this.offset = 0;
  }

  ensure(length) {
    if (this.offset + length > this.bytes.byteLength) {
      throw new RangeError(`Unexpected end of corpus at byte ${this.offset}.`);
    }
  }

  u8() {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  u16() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  string(length) {
    this.ensure(length);
    const value = new TextDecoder().decode(
      this.bytes.subarray(this.offset, this.offset + length),
    );
    this.offset += length;
    return value;
  }
}

function expectBlock(cursor, expectedMagic, label) {
  cursor.u32(); // Encoded block size; retained for compatibility with upstream.
  const actualMagic = cursor.u32();
  if (actualMagic !== expectedMagic) {
    throw new Error(
      `Invalid ${label} magic at byte ${cursor.offset - 4}: ` +
      `0x${actualMagic.toString(16)}.`,
    );
  }
}

function decodeName(cursor) {
  expectBlock(cursor, NAME_MAGIC, "name");
  return cursor.string(cursor.u32());
}

function decodeState(cursor) {
  expectBlock(cursor, STATE_MAGIC, "state");
  const state = {};
  for (const register of REGISTER_ORDER) state[register] = cursor.u32();
  state.prefetch = [cursor.u32(), cursor.u32()];

  state.ram = [];
  const wordCount = cursor.u32();
  for (let index = 0; index < wordCount; index += 1) {
    const address = cursor.u32();
    const word = cursor.u16();
    if (address > ADDRESS_MASK) {
      throw new RangeError(
        `Corpus RAM address exceeds 24 bits: 0x${address.toString(16)}.`,
      );
    }
    state.ram.push([address, word >>> 8], [address | 1, word & 0xff]);
  }
  return state;
}

function decodeTransactions(cursor) {
  expectBlock(cursor, TRANSACTIONS_MAGIC, "transactions");
  const length = cursor.u32();
  const count = cursor.u32();
  const transactions = [];

  for (let index = 0; index < count; index += 1) {
    const type = cursor.u8();
    const cycles = cursor.u32();
    if (type === 0) {
      transactions.push(["n", cycles]);
      continue;
    }

    const functionCode = cursor.u32();
    const address = cursor.u32();
    const data = cursor.u32();
    const uds = cursor.u32();
    const lds = cursor.u32();
    const kind = [null, "w", "r", "t", "re", "we"][type];
    if (!kind) throw new Error(`Unknown transaction type ${type}.`);
    transactions.push([
      kind,
      cycles,
      functionCode,
      address,
      uds + lds === 2 ? ".w" : ".b",
      data,
      uds,
      lds,
    ]);
  }
  return { transactions, length };
}

export function decodeSingleStepBinary(bytes) {
  const cursor = new BinaryCursor(bytes);
  const magic = cursor.u32();
  if (magic !== FILE_MAGIC) {
    throw new Error(`Invalid corpus magic: 0x${magic.toString(16)}.`);
  }

  const count = cursor.u32();
  const tests = [];
  for (let index = 0; index < count; index += 1) {
    expectBlock(cursor, TEST_MAGIC, "test");
    const name = decodeName(cursor);
    const initial = decodeState(cursor);
    const final = decodeState(cursor);
    const { transactions, length } = decodeTransactions(cursor);
    tests.push({ name, initial, final, transactions, length });
  }

  if (cursor.offset !== cursor.bytes.byteLength) {
    throw new Error(
      `Corpus has ${cursor.bytes.byteLength - cursor.offset} unexpected trailing bytes.`,
    );
  }
  return tests;
}

export function loadSingleStepFile(filePath) {
  if (filePath.endsWith(".json.bin")) {
    return decodeSingleStepBinary(fs.readFileSync(filePath));
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.tests;
}

export function singleStepSkipReason(test) {
  if (test.initial.sr & SR_TRACE) {
    return "the corpus operation boundary does not enter the post-instruction trace exception";
  }
  if (test.transactions.some(([kind]) => kind === "re" || kind === "we")) {
    return "address-error bus cycles are not modelled by this runner yet";
  }
  return null;
}

class SparseTestBus {
  constructor(ram) {
    this.memory = new Map(
      ram.map(([address, value]) => [address & ADDRESS_MASK, value & 0xff]),
    );
  }

  read8(address) {
    return this.memory.get(address & ADDRESS_MASK) ?? 0;
  }

  write8(address, value) {
    this.memory.set(address & ADDRESS_MASK, value & 0xff);
  }

  resetDevices() {}
}

function hexadecimal(value, width = 8) {
  return `0x${(value >>> 0).toString(16).padStart(width, "0")}`;
}

function compareValue(failures, field, actual, expected, width = 8) {
  if ((actual >>> 0) !== (expected >>> 0)) {
    failures.push(
      `${field}: expected ${hexadecimal(expected, width)}, got ${hexadecimal(actual, width)}`,
    );
  }
}

function statusRegisterMask(test) {
  const opcode = test.initial.prefetch[0];
  const bcdPair =
    (opcode & 0xf1f0) === 0xc100 || (opcode & 0xf1f0) === 0x8100;
  const nbcd = (opcode & 0xffc0) === 0x4800;
  if (bcdPair || nbcd) return 0xffff & ~(SR_NEGATIVE | SR_OVERFLOW);

  const divide = (opcode & 0xf1c0) === 0x80c0 || (opcode & 0xf1c0) === 0x81c0;
  if (divide && (test.final.sr & SR_OVERFLOW)) {
    return 0xffff & ~(SR_NEGATIVE | SR_ZERO);
  }
  return 0xffff;
}

export function runSingleStepTest(test) {
  const bus = new SparseTestBus(test.initial.ram);
  const cpu = new MC68008(bus);

  for (let register = 0; register < 8; register += 1) {
    cpu.d[register] = test.initial[`d${register}`];
  }
  for (let register = 0; register < 7; register += 1) {
    cpu.a[register] = test.initial[`a${register}`];
  }
  cpu.usp = test.initial.usp;
  cpu.ssp = test.initial.ssp;
  cpu.sr = test.initial.sr;
  cpu.a[7] = cpu.sr & SR_SUPERVISOR ? cpu.ssp : cpu.usp;
  // SingleStepTests stores the address of the next prefetch, two words ahead.
  cpu.pc = (test.initial.pc - 4) >>> 0;

  try {
    cpu.step();
  } catch (error) {
    return [`execution threw ${error.name}: ${error.message}`];
  }

  const failures = [];
  for (let register = 0; register < 8; register += 1) {
    compareValue(
      failures,
      `d${register}`,
      cpu.d[register],
      test.final[`d${register}`],
    );
  }
  for (let register = 0; register < 7; register += 1) {
    compareValue(
      failures,
      `a${register}`,
      cpu.a[register],
      test.final[`a${register}`],
    );
  }

  const usp = cpu.sr & SR_SUPERVISOR ? cpu.usp : cpu.a[7];
  const ssp = cpu.sr & SR_SUPERVISOR ? cpu.a[7] : cpu.ssp;
  compareValue(failures, "usp", usp, test.final.usp);
  compareValue(failures, "ssp", ssp, test.final.ssp);
  const srMask = statusRegisterMask(test);
  compareValue(failures, "sr", cpu.sr & srMask, test.final.sr & srMask, 4);
  compareValue(failures, "pc", cpu.pc, (test.final.pc - 4) >>> 0);

  for (const [address, expected] of test.final.ram) {
    const actual = bus.read8(address);
    if (actual !== expected) {
      failures.push(
        `ram[${hexadecimal(address, 6)}]: expected ${hexadecimal(expected, 2)}, ` +
        `got ${hexadecimal(actual, 2)}`,
      );
    }
  }
  return failures;
}
