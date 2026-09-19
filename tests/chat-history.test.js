import test from "node:test";
import assert from "node:assert/strict";
import { ChatHistory } from "../src/ui/chat-history.js";

// Minimal DOM surface with browser-like scroll bounds; animations finish explicitly.
class Element extends EventTarget {
  children = [];
  scrollHeight = 0;
  clientHeight = 240;
  position = 0;
  textContent = "";
  attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  contains(element) { return this.children.includes(element); }
  focus() { this.focused = true; }
  get scrollTop() { return this.position; }
  set scrollTop(value) { this.position = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
  append(...children) { this.children.push(...children); this.scrollHeight += children.length * 120; }
  replaceChildren() { this.children = []; this.scrollHeight = 0; }
  scrollTo(options) { this.pending = options; }
  finishScroll() { this.scrollTop = this.pending.top; this.dispatchEvent(new Event("scroll")); this.dispatchEvent(new Event("scrollend")); }
}

function harness(t, reduced = false) {
  t.mock.method(globalThis, "getComputedStyle", () => ({ lineHeight: "24px" }));
  t.mock.method(globalThis, "matchMedia", () => ({ matches: reduced }));
  const elements = Object.fromEntries(["chat-transcript", "chat-latest", "chat-history-status", "chat-type", "chat-history-content", "chat-history-toggle", "chat-history-toggle-label", "chat-history-toggle-icon"].map((id) => ["#" + id, new Element()]));
  const root = new Element();
  root.querySelector = (id) => elements[id];
  root.ownerDocument = { createElement: () => new Element() };
  const history = new ChatHistory(root, { focus() {} });
  assert.equal(root.hidden, true, "inactive chat must not occupy any space");
  assert.equal(history.content.hidden, true);
  assert.equal(history.toggle.attributes["aria-expanded"], "false");
  history.reset();
  assert.equal(root.hidden, false);
  for (let i = 0; i < 10; i++) history.append({ role: "assistant", text: `Reply ${i}` });
  return { history, viewport: history.viewport };
}

// Node has no browser globals to mock by default.
globalThis.getComputedStyle = () => {};
globalThis.matchMedia = () => {};

test("scrollback keeps the reading position and counts arrivals until Latest is selected", (t) => {
  const { history, viewport } = harness(t);
  assert.equal(viewport.scrollTop, 960);
  history.move("-page");
  viewport.finishScroll();
  assert.equal(viewport.scrollTop, 744);
  history.append({ role: "user", text: "A new question" });
  history.append({ role: "assistant", text: "A new reply" });
  assert.equal(viewport.scrollTop, 744);
  assert.equal(history.unread, 2);
  assert.match(history.latest.textContent, /\(2\)/);
  history.move("end");
  viewport.finishScroll();
  assert.equal(viewport.scrollTop, 1200);
  assert.equal(history.unread, 0);
  history.append({ role: "assistant", text: "Following again" });
  assert.equal(viewport.scrollTop, 1320);
});

test("conversation toggle preserves history and follows arrivals when reopened", (t) => {
  const { history, viewport } = harness(t);
  assert.equal(history.content.hidden, false);
  history.toggle.dispatchEvent(new Event("click"));
  assert.equal(history.root.hidden, false, "collapsing an active conversation keeps its toggle available");
  assert.equal(history.content.hidden, true);
  assert.equal(history.toggle.attributes["aria-expanded"], "false");
  assert.equal(history.toggleLabel.textContent, "Mostrar conversa");
  // A hidden browser viewport reports zero dimensions and can fire scroll events.
  viewport.clientHeight = 0;
  viewport.scrollTop = 0;
  viewport.dispatchEvent(new Event("scroll"));
  history.append({ role: "assistant", text: "Arrived while collapsed" });
  assert.equal(history.content.hidden, true);
  viewport.clientHeight = 240;
  history.toggle.dispatchEvent(new Event("click"));
  assert.equal(history.toggle.attributes["aria-expanded"], "true");
  assert.equal(history.toggleLabel.textContent, "Recolher conversa");
  assert.equal(viewport.children.length, 11);
  assert.equal(viewport.scrollTop, 1080);
  assert.equal(history.unread, 0);
});

test("leaving chat hides the whole panel and a new chat restores it without stale messages", (t) => {
  const { history, viewport } = harness(t);
  let focused = false;
  history.canvas = { focus() { focused = true; } };
  history.root.children.push(history.toggle);
  history.root.ownerDocument.activeElement = history.toggle;
  history.hide();
  assert.equal(history.root.hidden, true);
  assert.equal(history.content.hidden, true);
  assert.equal(focused, true, "focus must not remain in hidden controls");
  assert.equal(viewport.children.length, 10, "hiding does not delete the current transcript");
  history.append({ role: "assistant", text: "Late message" });
  assert.equal(history.root.hidden, true, "late events must not reveal inactive chat");
  history.reset();
  assert.equal(history.root.hidden, false);
  assert.equal(history.content.hidden, false);
  assert.equal(viewport.children.length, 0);
});

test("collapsing restores keyboard focus and the previous reading position", (t) => {
  const { history, viewport } = harness(t);
  history.move("home");
  viewport.finishScroll();
  history.content.children.push(viewport);
  history.root.ownerDocument.activeElement = viewport;
  history.setCollapsed(true);
  assert.equal(history.toggle.focused, true);
  history.append({ role: "user", text: "Unread while collapsed" });
  history.setCollapsed(false);
  assert.equal(viewport.scrollTop, 0);
  assert.equal(history.unread, 1);
  history.setCollapsed(true);
  history.reset();
  assert.equal(history.content.hidden, false);
  assert.equal(viewport.children.length, 0);
});

test("rapid small steps accumulate, page steps overlap, and movement stays within bounds", (t) => {
  const { history, viewport } = harness(t);
  history.move("-line");
  history.move("-line");
  assert.deepEqual(viewport.pending, { top: 912, behavior: "smooth" });
  history.move("home");
  history.move("-page");
  assert.equal(viewport.pending.top, 0);
  history.move("page");
  assert.equal(viewport.pending.top, 216);
  history.move("end");
  history.move("line");
  assert.equal(viewport.pending.top, 960);
});

test("manual scrolling restores following at the bottom and reduced motion skips animation", (t) => {
  const { history, viewport } = harness(t, true);
  history.move("home");
  assert.equal(viewport.pending.behavior, "instant");
  viewport.dispatchEvent(new Event("wheel"));
  viewport.scrollTop = 100;
  viewport.dispatchEvent(new Event("scroll"));
  history.append({ role: "assistant", text: "Unread" });
  assert.equal(viewport.scrollTop, 100);
  assert.equal(history.unread, 1);
  viewport.scrollTop = viewport.scrollHeight;
  viewport.dispatchEvent(new Event("scroll"));
  assert.equal(history.following, true);
  assert.equal(history.unread, 0);
  history.reset();
  assert.equal(viewport.children.length, 0);
  assert.equal(viewport.scrollTop, 0);
});
