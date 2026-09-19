import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { requestChatReply } from "../src/ui/chat-client.js";
import { QLChatBridge } from "../src/ui/ql-chat.js";

const options = { token: "local-token", session: "test-session-0001", message: "hello" };

test("client sends one request and distinguishes Google errors from local disconnections", async () => {
  for (const [fetchImpl, pattern] of [
    [async () => Response.json({ error: "Gemini temporarily unavailable (Google HTTP 503)." }, { status: 502 }), /Google HTTP 503/],
    [async () => { throw new TypeError("NetworkError when attempting to fetch resource."); }, /LOCAL SERVER DISCONNECTED.*npm start/],
    [async () => new Response("<html>error</html>", { status: 502 }), /LOCAL SERVER ERROR \(HTTP 502\)/],
    [async () => Response.json({ answer: null }), /No displayable reply/],
  ]) {
    let calls = 0;
    await assert.rejects(requestChatReply({ ...options, fetchImpl: (...args) => { calls++; return fetchImpl(...args); } }), pattern);
    assert.equal(calls, 1);
  }
});

test("server restart requires a new local session without resending to Google", async () => {
  let calls = 0;
  await assert.rejects(requestChatReply({ ...options, fetchImpl: async () => {
    calls++;
    return Response.json({ code: "HOST_SESSION_EXPIRED" }, { status: 403 });
  } }), /LOCAL SESSION EXPIRED.*not sent to Gemini/);
  assert.equal(calls, 1);
});

test("browser timeout ends the QL reply frame so THINKING does not remain stuck", async () => {
  const received = [];
  let calls = 0;
  let requestSignal;
  const bridge = new QLChatBridge({
    device: { serialReceive: [[], []], receiveSerial: (port, bytes) => { received.push(bytes); return true; } },
    reply: (message, { signal }) => requestChatReply({ ...options, message, signal, timeoutMs: 10,
      fetchImpl: (url, { signal: activeSignal }) => {
        calls++;
        requestSignal = activeSignal;
        return new Promise((resolve, reject) => activeSignal.addEventListener("abort", () => reject(activeSignal.reason), { once: true }));
      },
    }),
  });
  for (const byte of new TextEncoder().encode("hello\n")) bridge.transmit({ port: 1, byte });
  await delay(50);
  assert.equal(calls, 1);
  assert.equal(requestSignal.aborted, true);
  assert.equal(bridge.controller, null);
  assert.equal(received.length, 1);
  assert.equal(received[0].at(-1), 3);
  assert.match(new TextDecoder().decode(received[0]), /LOCAL SERVER TIMEOUT/);
});

test("reset cancellation aborts the request and delivers no late error into the QL", async () => {
  let activeSignal;
  const bridge = new QLChatBridge({
    device: { serialReceive: [[], []], receiveSerial() { assert.fail("must not deliver after reset"); } },
    reply: (message, { signal }) => requestChatReply({ ...options, message, signal,
      fetchImpl: (url, { signal: requestSignal }) => {
        activeSignal = requestSignal;
        return new Promise((resolve, reject) => requestSignal.addEventListener("abort", () => reject(requestSignal.reason), { once: true }));
      },
    }),
  });
  for (const byte of new TextEncoder().encode("hello\n")) bridge.transmit({ port: 1, byte });
  bridge.stop();
  await delay(0);
  assert.equal(activeSignal.aborted, true);
  assert.equal(bridge.controller, null);
});
