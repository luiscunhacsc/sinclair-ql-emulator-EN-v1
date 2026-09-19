import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  decodeSingleStepBinary,
  runSingleStepTest,
  singleStepSkipReason,
} from "../tools/m68000-single-step.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/m68000-v1.json", import.meta.url), "utf8"),
);

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function stateBlock({ pc, ram = [] }) {
  const registers = Array.from({ length: 19 }, () => 0);
  registers[18] = pc;
  return Buffer.concat([
    u32(0),
    u32(0x01234567),
    ...registers.map(u32),
    u32(0x4e71),
    u32(0xabcd),
    u32(ram.length),
    ...ram.flatMap(([address, word]) => {
      const value = Buffer.alloc(6);
      value.writeUInt32LE(address);
      value.writeUInt16LE(word, 4);
      return [value];
    }),
  ]);
}

test("decodes the upstream binary container without the Python converter", () => {
  const name = Buffer.from("binary smoke test");
  const binary = Buffer.concat([
    u32(0x1a3f5d71),
    u32(1),
    u32(0),
    u32(0xabc12367),
    u32(0),
    u32(0x89abcdef),
    u32(name.length),
    name,
    stateBlock({ pc: 0x1004, ram: [[0x1000, 0x4e71]] }),
    stateBlock({ pc: 0x1006, ram: [[0x1000, 0x4e71]] }),
    u32(0),
    u32(0x456789ab),
    u32(4),
    u32(1),
    Buffer.from([0]),
    u32(2),
  ]);

  const [decoded] = decodeSingleStepBinary(binary);
  assert.equal(decoded.name, "binary smoke test");
  assert.equal(decoded.initial.pc, 0x1004);
  assert.deepEqual(decoded.initial.ram, [[0x1000, 0x4e], [0x1001, 0x71]]);
  assert.deepEqual(decoded.transactions, [["n", 2]]);
  assert.equal(decoded.length, 4);
});

test("pinned M68000 SingleStepTests cases match the MC68008 core", async (context) => {
  assert.equal(fixture.tests.length, 56);
  for (const vector of fixture.tests) {
    await context.test(`${vector.source}: ${vector.name}`, () => {
      assert.equal(singleStepSkipReason(vector), null);
      assert.deepEqual(runSingleStepTest(vector), []);
    });
  }
});
