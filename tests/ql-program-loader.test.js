import test from "node:test";
import assert from "node:assert/strict";
import { waitForQlCycles, waitForSuperBasic, waitForChatReady, chatLoadingConsumesKey } from "../src/ui/ql-program-loader.js";

test("typing and modifier keys cannot interrupt a chat launch or leak into BASIC", () => {
  for (const key of ["O", "Enter", "Shift", "ArrowUp"]) {
    let prevented = false;
    const event = { key, preventDefault() { prevented = true; } };
    assert.equal(chatLoadingConsumesKey(event, true), true);
    assert.equal(prevented, true);
    assert.equal(chatLoadingConsumesKey(event, false), false);
  }
  assert.equal(chatLoadingConsumesKey({ key: "Tab", preventDefault() { assert.fail("Tab must remain available"); } }, true), true);
});

test("program injection waits for emulated time even when browser timers run faster", async () => {
  const cpu = { cycles: 0 };
  const signal = new AbortController().signal;
  let elapsed = 0;
  await waitForQlCycles(500, { cpu, hz: 1000, signal, now: () => elapsed,
    delay: async () => { elapsed += 50; cpu.cycles += 10; },
  });
  assert.equal(cpu.cycles, 500);
  assert.equal(elapsed, 2500);
});

test("stalled CPU reports an error and reset aborts an in-flight load", async () => {
  const cpu = { cycles: 0 };
  let elapsed = 0;
  await assert.rejects(waitForQlCycles(500, { cpu, hz: 1000, signal: new AbortController().signal,
    now: () => elapsed, delay: async () => { elapsed += 1000; },
  }), /QL parou/);
  const controller = new AbortController();
  await assert.rejects(waitForQlCycles(500, { cpu, hz: 1000, signal: controller.signal,
    delay: async () => controller.abort(),
  }), { name: "AbortError" });
});

test("background tabs do not count as a stalled CPU", async () => {
  const cpu = { cycles: 0 };
  let elapsed = 0;
  await waitForQlCycles(20, { cpu, hz: 1000, signal: new AbortController().signal,
    now: () => elapsed, suspended: () => elapsed <= 10_000,
    delay: async () => { elapsed += 1000; if (elapsed > 10_000) cpu.cycles += 20; },
  });
  assert.equal(cpu.cycles, 20);
});

test("drained keyboard is not enough: startup waits for BASIC acknowledgement or fails", async () => {
  const bridge = { ready: false };
  const signal = new AbortController().signal;
  let ticks = 0;
  await waitForChatReady({ bridge, signal, delay: async () => { if (++ticks === 3) bridge.ready = true; } });
  assert.equal(ticks, 3);
  await assert.rejects(waitForChatReady({ bridge: { ready: false }, signal, timeout: 40, delay: async () => {} }), /não confirmou/);
});

test("an unavailable BASIC editor times out without sending program text, and cancellation sends no keys", async () => {
  const bus = { romLoaded: false, ram: new Uint8Array(128 * 1024) };
  const keys = [];
  const device = { enqueueKey(...key) { keys.push(key); } };
  const controller = new AbortController();
  await assert.rejects(waitForSuperBasic({ bus, device, signal: controller.signal, delay: async () => {}, timeout: 2000 }), /programa não foi enviado/);
  assert.equal(keys.length, 3, "only BREAK, F1, BREAK are allowed before the editor is ready");
  keys.length = 0;
  controller.abort();
  await assert.rejects(waitForSuperBasic({ bus, device, signal: controller.signal, delay: async () => {} }), { name: "AbortError" });
  assert.equal(keys.length, 0);
  const duringBoot = new AbortController();
  await assert.rejects(waitForSuperBasic({ bus, device, signal: duringBoot.signal,
    delay: async () => duringBoot.abort(),
  }), { name: "AbortError" });
  assert.equal(keys.length, 1, "power off must cancel preparation before any F1 or program keys follow");
});
