import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createChatService, GEMINI_MODEL } from "../scripts/chat-service.mjs";

const id = "test-session-0001";
const secret = "test-only-placeholder";
test("a configured Free project is available without making calls during setup or /new", async () => {
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true,
    fetchImpl() { assert.fail("configuration and /new must not call the provider"); },
  });
  assert.equal(chat.enabled, true);
  assert.equal(await chat.reply(id, "/new"), "New conversation. Ready.");
});
const answer = () => Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [
  { text: "private reasoning", thought: true }, { text: "Hello " }, { text: "QL!" },
] } }] });

test("Gemini is disabled unless both a key and host Free confirmation exist", async () => {
  for (const options of [{}, { apiKey: secret }, { freePlanConfirmed: true }, { apiKey: "gen-lang-client-0733568918", freePlanConfirmed: true }]) {
    const chat = createChatService({ ...options, fetchImpl() { assert.fail("must not call provider"); } });
    assert.equal(chat.enabled, false);
    await assert.rejects(chat.reply(id, "hello"), /disabled/);
  }
});

test("Gemini uses the fixed model, bounded history, and /new makes no API call", async () => {
  const calls = [];
  let clock = 1_000_000;
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true, now: () => clock,
    fetchImpl: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return answer(); },
  });
  for (let i = 0; i < 6; i++) {
    assert.equal(await chat.reply(id, `message ${i}`), "Hello QL!");
    clock += 16_000;
  }
  assert.equal(GEMINI_MODEL, "gemini-3.5-flash-lite");
  assert.equal(calls[0].url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
  assert.equal(calls[0].body.generationConfig.maxOutputTokens, 1024);
  assert.equal(calls[0].body.generationConfig.candidateCount, 1);
  assert.equal(calls[0].body.tools, undefined);
  assert.equal(calls[0].body.cachedContent, undefined);
  assert.equal(calls[0].body.systemInstruction, undefined);
  assert.deepEqual(calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: "MINIMAL", includeThoughts: false });
  assert.equal(calls[0].body.generationConfig.responseMimeType, undefined);
  assert.equal(calls[0].body.generationConfig.responseSchema, undefined);
  // Advanced settings are not visible in the user's screenshot: retain API defaults.
  assert.equal(calls[0].body.generationConfig.temperature, undefined);
  assert.equal(calls[0].body.generationConfig.topP, undefined);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers["x-goog-api-key"], secret);
  assert.deepEqual(calls[1].body.contents[1], { role: "model", parts: [{ text: "Hello QL!" }] });
  assert.equal(calls.at(-1).body.contents.length, 7);
  await chat.reply(id, "/new");
  assert.equal(calls.length, 6);
  await chat.reply(id, "fresh");
  assert.equal(calls.at(-1).body.contents.length, 1);
});

test("provider limit/payment/access responses latch the host off without retry", async () => {
  for (const status of [400, 401, 402, 403, 404, 429]) {
    let calls = 0;
    const chat = createChatService({ apiKey: secret, freePlanConfirmed: true,
      fetchImpl: async () => { calls++; return new Response(secret, { status }); },
    });
    await assert.rejects(chat.reply(id, "hello"), /no automatic retry/);
    await assert.rejects(chat.reply(id, "again"), /paused/);
    assert.equal(chat.enabled, false);
    assert.equal(chat.paused, true);
    await chat.reply(id, "/new");
    await assert.rejects(chat.reply(id, "still blocked"), /paused/);
    assert.equal(calls, 1);
  }
});

test("quota stop survives server recreation without exposing provider secrets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ql-gemini-stop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stopFile = join(root, ".env.gemini-paused");
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true, stopFile,
    fetchImpl: async () => new Response(secret, { status: 429 }),
  });
  await assert.rejects(chat.reply(id, "hello"), /paused/);
  assert.equal((await readFile(stopFile, "utf8")).includes(secret), false);
  const restarted = createChatService({ apiKey: secret, freePlanConfirmed: true, stopFile,
    fetchImpl() { assert.fail("must stay stopped after restart"); },
  });
  assert.equal(restarted.enabled, false);
  await assert.rejects(restarted.reply(id, "hello"), /paused/);
});

test("unreadable stop state fails closed before a provider call", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ql-gemini-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true, stopFile: root,
    fetchImpl() { assert.fail("must not call provider"); },
  });
  assert.equal(chat.enabled, false);
  await assert.rejects(chat.reply(id, "hello"), /paused/);
});

test("blocked replies and thought-only responses never enter the conversation", async () => {
  for (const body of [
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "hidden" }] } }] },
    { candidates: [{ content: { parts: [{ text: "private reasoning", thought: true }] } }] },
  ]) {
    const chat = createChatService({ apiKey: secret, freePlanConfirmed: true, fetchImpl: async () => Response.json(body) });
    await assert.rejects(chat.reply(id, "hello"), /display|displayable/);
  }
});

test("host throttles requests and enforces its daily cap before calling Gemini", async () => {
  let clock = Date.UTC(2026, 8, 16);
  let calls = 0;
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true, now: () => clock,
    fetchImpl: async () => { calls++; return answer(); },
  });
  await assert.rejects(chat.reply(id, "x".repeat(1025)), /Invalid message/);
  for (let i = 0; i < 100; i++) {
    await chat.reply(id, "hello");
    await assert.rejects(chat.reply(id, "too soon"), /LOCAL LIMIT/);
    clock += 16_000;
  }
  await assert.rejects(chat.reply(id, "over cap"), /LOCAL LIMIT/);
  assert.equal(calls, 100);
});

test("network errors never return provider secrets and concurrent calls are refused", async () => {
  let fail;
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true,
    fetchImpl: () => new Promise((resolve, reject) => { fail = reject; }),
  });
  const pending = chat.reply(id, "hello");
  await assert.rejects(chat.reply(id, "concurrent"), /LOCAL LIMIT/);
  fail(new Error(secret));
  await assert.rejects(pending, (error) => !error.message.includes(secret) && /No automatic retry/.test(error.message));
});

test("Google server failures retain HTTP status, hide raw bodies, and never retry or pause Free quota", async () => {
  for (const status of [500, 502, 503, 504]) {
    let calls = 0;
    const chat = createChatService({ apiKey: secret, freePlanConfirmed: true,
      fetchImpl: async () => { calls++; return new Response(secret, { status }); },
    });
    await assert.rejects(chat.reply(id, "hello"), (error) =>
      error.message.includes(`Google HTTP ${status}`) && !error.message.includes(secret) && /No automatic retry/.test(error.message));
    assert.equal(calls, 1);
    assert.equal(chat.paused, false);
  }
});

test("Google timeout is distinct from a browser disconnect and releases the busy request", async () => {
  let calls = 0;
  let clock = 1_000_000;
  const chat = createChatService({ apiKey: secret, freePlanConfirmed: true, timeoutMs: 10, now: () => clock,
    fetchImpl: (url, { signal }) => {
      calls++;
      if (calls > 1) return Promise.resolve(answer());
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
  });
  await Promise.all([
    assert.rejects(chat.reply(id, "hello"), (error) => error.status === 504 && /GEMINI TIMEOUT/.test(error.message)),
    delay(30),
  ]);
  assert.equal(calls, 1);
  clock += 16_000;
  assert.equal(await chat.reply(id, "a later manual message"), "Hello QL!");
});
