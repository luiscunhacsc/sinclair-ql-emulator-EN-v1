#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadSingleStepFile,
  runSingleStepTest,
  singleStepSkipReason,
} from "../tools/m68000-single-step.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  inputs.push(path.join(root, "tests/fixtures/m68000-v1.json"));
}

let passed = 0;
let skipped = 0;
const failures = [];

for (const input of inputs) {
  const tests = loadSingleStepFile(path.resolve(input));
  for (const test of tests) {
    const skipReason = singleStepSkipReason(test);
    if (skipReason) {
      skipped += 1;
      continue;
    }
    const differences = runSingleStepTest(test);
    if (differences.length === 0) passed += 1;
    else failures.push({ input, name: test.name, differences });
  }
}

for (const failure of failures.slice(0, 20)) {
  console.error(`FAIL ${failure.input}: ${failure.name}`);
  for (const difference of failure.differences) console.error(`  ${difference}`);
}
if (failures.length > 20) console.error(`...and ${failures.length - 20} more failures.`);

console.log(
  `M68000 conformance: ${passed} passed, ${skipped} skipped, ${failures.length} failed.`,
);
if (failures.length > 0) process.exitCode = 1;
