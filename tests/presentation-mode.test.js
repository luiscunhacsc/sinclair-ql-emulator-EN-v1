import test from "node:test";
import assert from "node:assert/strict";

import {
  adjacentPresentationMode,
  normalizePresentationMode,
  presentationLabel,
} from "../src/ui/presentation-mode.js";

test("normaliza modos de apresentação desconhecidos", () => {
  assert.equal(normalizePresentationMode("screen"), "screen");
  assert.equal(normalizePresentationMode("unknown"), "monitor");
  assert.equal(normalizePresentationMode(null, "computer"), "computer");
});

test("percorre os modos de apresentação em ambas as direções", () => {
  assert.equal(adjacentPresentationMode("screen", 1), "monitor");
  assert.equal(adjacentPresentationMode("computer", 1), "screen");
  assert.equal(adjacentPresentationMode("screen", -1), "computer");
  assert.equal(adjacentPresentationMode("monitor", 4), "computer");
  assert.equal(adjacentPresentationMode("monitor", -4), "screen");
});

test("fornece uma descrição acessível para cada modo", () => {
  assert.equal(presentationLabel("screen"), "Sinclair QL screen only");
  assert.equal(presentationLabel("monitor"), "Screen in the Sinclair QL monitor");
  assert.equal(presentationLabel("computer"), "Full Sinclair QL with monitor");
});
