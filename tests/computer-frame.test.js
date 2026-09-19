import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COMPUTER_FRAME_ASSETS,
  computerFrameSource,
} from "../src/ui/computer-frame.js";

test("mostra o QL sem cartuchos quando ambas as unidades estão vazias", () => {
  assert.equal(computerFrameSource(false, false), COMPUTER_FRAME_ASSETS.empty);
});

test("mostra apenas o cartucho inserido em MDV1", () => {
  assert.equal(computerFrameSource(true, false), COMPUTER_FRAME_ASSETS.mdv1);
});

test("mostra apenas o cartucho inserido em MDV2", () => {
  assert.equal(computerFrameSource(false, true), COMPUTER_FRAME_ASSETS.mdv2);
});

test("mostra os dois cartuchos quando MDV1 e MDV2 estão montados", () => {
  assert.equal(computerFrameSource(true, true), COMPUTER_FRAME_ASSETS.both);
});

test("as quatro composições são imagens PNG RGBA de 1536 por 1024", async () => {
  for (const source of Object.values(COMPUTER_FRAME_ASSETS)) {
    const bytes = await readFile(new URL(`../${source.slice(2)}`, import.meta.url));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", source);
    assert.equal(bytes.readUInt32BE(16), 1536, source);
    assert.equal(bytes.readUInt32BE(20), 1024, source);
    assert.equal(bytes[24], 8, source);
    assert.equal(bytes[25], 6, `${source} deve conter um canal alfa`);
  }
});
