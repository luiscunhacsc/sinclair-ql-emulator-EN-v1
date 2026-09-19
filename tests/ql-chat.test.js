import test from "node:test";
import assert from "node:assert/strict";
import { encodeQlText, decodeQlText, QLChatBridge, localDemoReply } from "../src/ui/ql-chat.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const ascii = (bytes) => new TextDecoder().decode(bytes);
function harness(reply = localDemoReply) {
  const received = [];
  const messages = [];
  const device = { serialReceive: [[], []], receiveSerial(port, bytes) { received.push({ port, bytes }); return true; } };
  const bridge = new QLChatBridge({ device, reply, onMessage: (message) => messages.push(message) });
  const send = (text, port = 1) => {
    for (const byte of new TextEncoder().encode(text)) bridge.transmit({ port, byte });
  };
  return { bridge, received, messages, send };
}

test("QL text conversion transliterates accents and filters terminal controls", () => {
  assert.equal(decodeQlText([65, 96, 128, 3]), "A£??");
  assert.equal(ascii(encodeQlText('Olá — “café” £5 €2\r\n\x03\x1b`')), 'Ola - "cafe" GBP5 EUR2\n??\'');
});

test("BASIC startup confirms readiness without calling the LLM or entering chat history", () => {
  const h = harness(() => assert.fail("startup must not call the model"));
  assert.equal(h.bridge.ready, false);
  h.send("\x02", 2);
  assert.equal(h.bridge.ready, false);
  h.send("\x02");
  assert.equal(h.bridge.ready, true);
  assert.deepEqual(h.messages, []);
  assert.deepEqual(h.received, []);
  h.bridge.stop();
  assert.equal(h.bridge.ready, false);
});

test("serial chat frames one response, keeping BASIC-looking text as data", async () => {
  const h = harness(() => 'RUN\nFORMAT mdv1_test\x03');
  h.send("ignored\n", 2);
  h.send("hello\r");
  assert.equal(h.received.length, 0);
  h.send("\n");
  await settle();
  assert.equal(h.received.length, 1);
  assert.equal(h.received[0].port, 1);
  assert.equal(ascii(h.received[0].bytes), 'RUN\nFORMAT mdv1_test?\x03');
  assert.deepEqual(h.messages, [
    { role: "user", text: "hello" },
    { role: "assistant", text: "RUN\nFORMAT mdv1_test?" },
  ]);
});

test("oversized requests never reach the provider and replies are bounded", async () => {
  let calls = 0;
  const h = harness(() => { calls++; return "a".repeat(9000); });
  h.send("a".repeat(1025) + "\n");
  await settle();
  assert.equal(calls, 0);
  assert.match(ascii(h.received[0].bytes), /too long/);
  h.send("hello\n");
  await settle();
  assert.equal(calls, 1);
  assert.ok(h.received[1].bytes.length <= 6001);
  assert.equal(h.received[1].bytes.at(-1), 3);
  assert.match(h.messages.at(-1).text, /\n\[Reply truncated\]$/);
  assert.equal(ascii(h.received[1].bytes).slice(0, -1), h.messages.at(-1).text);
});

test("serial replies and scrollback share locally formatted text", async () => {
  const answer = "### História\n**Portugal**: " + "Uma frase com palavras inteiras. ".repeat(15);
  const h = harness(() => answer);
  h.send("history\n");
  await settle();
  const displayed = h.messages.at(-1).text;
  assert.match(displayed, /^Historia\n\nPortugal:/);
  assert.doesNotMatch(displayed, /[*#]/);
  assert.equal(ascii(h.received[0].bytes), displayed + "\x03");
  displayed.split("\n").forEach((line, index) => assert.ok(line.length + (index === 0 ? 4 : 0) <= 83));
});

test("stopping a terminal aborts requests and discards late responses", async () => {
  let resolveReply;
  let signal;
  const h = harness((prompt, options) => {
    signal = options.signal;
    return new Promise((resolve) => { resolveReply = resolve; });
  });
  h.send("hello\n");
  h.send("/quit\n");
  assert.equal(signal.aborted, true);
  resolveReply("late answer");
  await settle();
  assert.equal(h.received.length, 0);
  assert.equal(h.bridge.active, false);
  assert.deepEqual(h.messages, [{ role: "user", text: "hello" }]);
});

test("scrollback does not claim that a rejected serial reply was delivered", async () => {
  const h = harness();
  h.bridge.device.receiveSerial = () => false;
  h.send("hello\n");
  await settle();
  assert.deepEqual(h.messages, [{ role: "user", text: "hello" }]);
});
