import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGeminiKey, geminiKeyProblem } from "../src/ui/gemini-key.js";

test("keys are opaque values: punctuation and length do not imply a project ID", () => {
  for (const key of ["fixture-key-with-hyphens_and_underscores", "fixture.token+with/base64=", "fixture." + "a".repeat(600)]) {
    assert.equal(geminiKeyProblem(key), null);
  }
  assert.equal(normalizeGeminiKey('  "fixture.key/value="\r\n'), "fixture.key/value=");
  assert.equal(normalizeGeminiKey("'fixture-key'"), "fixture-key");
});

test("validation explains the actual problem without echoing the credential", () => {
  const cases = [
    ["gen-lang-client-123456789", /project ID/],
    ["1234567890", /project ID or number/],
    ["fixture…hidden", /shortened/],
    ["fixture...hidden", /shortened/],
    ["fixture***hidden", /masked/],
    ["fixture has spaces", /spaces/],
    ["fixture\nOTHER=value", /line breaks/],
    ["GEMINI_API_KEY=fixture", /only the key value/],
    ["a".repeat(4097), /too long/],
    ...["#", '"', "'", "`", "\\", "\0", "\x7f", "é"].map((char) => [`fixture${char}private`, /characters/]),
  ];
  for (const [key, message] of cases) {
    const problem = geminiKeyProblem(key);
    assert.match(problem, message);
    assert.equal(problem.includes(key), false);
  }
});
