#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  loadSingleStepFile,
  singleStepSkipReason,
} from "../tools/m68000-single-step.mjs";

const [sourceDirectory, outputPath] = process.argv.slice(2);
if (!sourceDirectory || !outputPath) {
  console.error("Usage: node scripts/build-m68000-fixture.mjs CORPUS_V1_DIR OUTPUT.json");
  process.exit(2);
}

const sources = [
  { name: "NOP" },
  { name: "MOVE.q" },
  { name: "ADD.b" },
  { name: "Bcc" },
  { name: "CLR.w" },
  {
    name: "ABCD",
    include: (test) => /^(051|371|472|632|818|1483|2110|2170) /u.test(test.name),
  },
  {
    name: "BTST",
    // Preserve the corpus case that exposed the immediate effective-address operand.
    include: (test) => (test.initial.prefetch[0] & 0x003f) === 0x003c,
  },
];
const tests = [];
for (const source of sources) {
  const filePath = path.join(sourceDirectory, `${source.name}.json.bin`);
  const selected = loadSingleStepFile(filePath)
    .filter((test) => singleStepSkipReason(test) === null)
    .filter((test) => source.include?.(test) ?? true)
    .slice(0, 8)
    .map((test) => ({ source: source.name, ...test }));
  if (selected.length !== 8) {
    throw new Error(`${filePath} supplied only ${selected.length} compatible cases.`);
  }
  tests.push(...selected);
}

const fixture = {
  source: "https://github.com/SingleStepTests/m68000",
  commit: "64b253116a3de04aaac4346c43680960dc9b67e5",
  selection:
    "Eight compatible cases per source; ABCD and BTST retain discovered edge-case regressions.",
  tests,
};
fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
