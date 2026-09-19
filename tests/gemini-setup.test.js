import test from "node:test";
import assert from "node:assert/strict";
import { initializeGeminiSetup } from "../src/ui/gemini-setup.js";

class Element extends EventTarget {
  value = "";
  checked = false;
  disabled = false;
  open = false;
  attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
  click() { this.dispatchEvent(new Event("click")); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
function harness(t, { publicPage = false, seen = false, saved = false } = {}) {
  const ids = ["gemini-setup", "gemini-setup-form", "gemini-setup-fields", "gemini-api-key", "gemini-free-only", "gemini-setup-status", "gemini-remove-key", "gemini-continue", "gemini-ai-studio"];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  const opener = new Element();
  const storage = new Map(seen ? [["sinclair-ql-welcome-seen", "yes"]] : []);
  const requests = [];
  let notifications = 0;
  const oldDescriptors = new Map(["document", "location", "localStorage", "fetch"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const globals = {
    document: { querySelector: (selector) => elements[selector.slice(1)], querySelectorAll: () => [opener] },
    location: { protocol: publicPage ? "https:" : "http:", hostname: publicPage ? "example.com" : "localhost" },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => {
      assert.equal(publicPage, false, "public page must not request configuration or send credentials");
      requests.push({ url, options });
      if (options.method === "POST") {
        const data = JSON.parse(options.body);
        return Response.json({ enabled: !data.remove && data.freePlanConfirmed, paused: false,
          settings: { editable: true, hasKey: !data.remove, freePlanConfirmed: !data.remove && data.freePlanConfirmed } });
      }
      return Response.json({ enabled: saved, paused: false, token: "local-session-token",
        settings: { editable: true, hasKey: saved, freePlanConfirmed: saved } });
    },
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  t.after(() => {
    for (const [name, descriptor] of oldDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  initializeGeminiSetup({ onSaved: () => notifications++ });
  return { elements, opener, storage, requests, notifications: () => notifications };
}

test("first visit offers setup but continuing needs no key and clears unsaved input", async (t) => {
  const { elements: e, storage, requests } = harness(t);
  await settle();
  assert.equal(e["gemini-setup"].open, true);
  assert.equal(e["gemini-free-only"].checked, false);
  e["gemini-api-key"].value = "unsaved-private-input";
  e["gemini-continue"].click();
  assert.equal(e["gemini-setup"].open, false);
  assert.equal(e["gemini-api-key"].value, "");
  assert.deepEqual([...storage], [["sinclair-ql-welcome-seen", "yes"]]);
  assert.equal(requests.length, 1);
});

test("saved welcome can be reopened and saving/removing never persist a key in the browser", async (t) => {
  const { elements: e, opener, storage, requests, notifications } = harness(t, { seen: true });
  assert.equal(e["gemini-setup"].open, false);
  opener.click();
  await settle();
  e["gemini-api-key"].value = "fixture-private-api-key";
  e["gemini-free-only"].checked = true;
  e["gemini-setup-form"].dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  const saved = requests.at(-1);
  assert.equal(saved.url, "/api/chat/settings");
  assert.equal(saved.options.headers.Authorization, "Bearer local-session-token");
  assert.deepEqual(JSON.parse(saved.options.body), { apiKey: "fixture-private-api-key", freePlanConfirmed: true, remove: false });
  assert.equal(e["gemini-api-key"].value, "");
  assert.equal(e["gemini-remove-key"].hidden, false);
  assert.equal(notifications(), 1);
  assert.deepEqual([...storage], [["sinclair-ql-welcome-seen", "yes"]]);
  e["gemini-remove-key"].click();
  await settle();
  assert.equal(e["gemini-remove-key"].hidden, true);
  assert.equal(e["gemini-free-only"].checked, false);
});

test("public pages keep credential input disabled and explain local setup", async (t) => {
  const { elements: e, requests } = harness(t, { publicPage: true });
  await settle();
  assert.equal(e["gemini-setup-fields"].disabled, true);
  assert.match(e["gemini-setup-status"].textContent, /npm start/);
  e["gemini-setup-form"].dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  assert.equal(requests.length, 0);
  e["gemini-continue"].click();
  assert.equal(e["gemini-setup"].open, false);
});

test("complete opaque keys reach the server intact; masked keys fail locally with a specific error", async (t) => {
  const { elements: e, requests } = harness(t);
  await settle();
  e["gemini-api-key"].value = "fixture...masked";
  e["gemini-setup-form"].dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  assert.equal(requests.length, 1);
  assert.match(e["gemini-setup-status"].textContent, /shortened/);
  assert.equal(e["gemini-api-key"].attributes["aria-invalid"], "true");
  const key = "fixture.opaque/" + "a".repeat(600) + "+=";
  e["gemini-api-key"].value = '"' + key + '"';
  e["gemini-free-only"].checked = true;
  e["gemini-setup-form"].dispatchEvent(new Event("submit", { cancelable: true }));
  await settle();
  assert.equal(JSON.parse(requests.at(-1).options.body).apiKey, key);
  assert.equal(e["gemini-api-key"].value, "");
  assert.equal(e["gemini-api-key"].attributes["aria-invalid"], undefined);
});
