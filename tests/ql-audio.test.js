import assert from "node:assert/strict";
import test from "node:test";
import { QLAudio } from "../src/ui/ql-audio.js";

class FakeContext {
  constructor() {
    this.state = "suspended";
    this.destination = {};
    this.modules = [];
    this.audioWorklet = { addModule: async (url) => this.modules.push(url) };
  }

  async resume() {
    this.state = "running";
  }
}

test("a ponte Web Audio é lazy e entrega ao worklet o som que ficou pendente", async () => {
  const messages = [];
  const node = {
    port: { postMessage: (message) => messages.push(message) },
    connect(destination) { this.destination = destination; },
  };
  const audio = new QLAudio({
    AudioContextClass: FakeContext,
    nodeFactory: () => node,
    workletUrl: "ql-worklet.js",
  });
  const sound = { pitch: 21, duration: 10 };

  audio.handleIpcEvent({ type: "start", sound });
  assert.equal(audio.context, null);
  assert.equal(await audio.resume(), true);
  assert.deepEqual(audio.context.modules, ["ql-worklet.js"]);
  assert.equal(node.destination, audio.context.destination);
  assert.deepEqual(messages, [
    { type: "start", sound },
    { type: "pause", paused: false },
    { type: "pause", paused: false },
  ]);

  audio.pause();
  audio.setEnabled(false);
  assert.deepEqual(messages.slice(-2), [
    { type: "pause", paused: true },
    { type: "stop" },
  ]);
});

test("a ponte assinala Web Audio como indisponível sem criar contexto", async () => {
  const audio = new QLAudio({ AudioContextClass: null });
  assert.equal(audio.supported, false);
  assert.equal(await audio.resume(), false);
  audio.setEnabled(true);
  assert.equal(audio.enabled, false);
});
