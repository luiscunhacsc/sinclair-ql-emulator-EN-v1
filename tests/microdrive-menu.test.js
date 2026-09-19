import test from "node:test";
import assert from "node:assert/strict";
import { MicrodriveMenu } from "../src/ui/microdrive-menu.js";

class Element extends EventTarget {
  dataset = {};
  attributes = {};
  children = [];
  hidden = false;
  disabled = false;
  value = "";
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  focus() { this.focused = true; }
  click() { this.clicked = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
}

function harness(overrides = {}) {
  const root = new Element();
  const ids = ["drive-menu-title", "drive-menu-medium", "drive-menu-activity", "drive-menu-status", "drive-menu-results", "drive-new-form", "drive-project-form", "drive-menu-file", "drive-mounted-actions", "drive-new-name", "drive-project-name"];
  const nodes = Object.fromEntries(ids.map((id) => ["#" + id, new Element()]));
  const buttons = Object.fromEntries(["new", "projects", "library", "file", "project", "save", "protection", "eject", "resume", "close", "all", "boot", "guide"].map((action) => {
    const button = new Element();
    button.dataset.menuAction = action;
    button.dataset.guard = { new: "new", file: "mount", project: "save", save: "save", protection: "protection", eject: "eject", boot: "boot" }[action];
    return [action, button];
  }));
  const format = new Element();
  format.value = "format";
  format.dataset.guard = "boot";
  const units = [1, 2].map((slot) => { const button = new Element(); button.dataset.menuSlot = String(slot); return button; });
  root.querySelector = (selector) => nodes[selector] ?? buttons[selector.match(/data-menu-action="(.*?)"/)?.[1]];
  root.querySelectorAll = (selector) => selector === "button" ? [...Object.values(buttons), format, ...units]
    : [nodes["#drive-new-name"], nodes["#drive-project-name"], nodes["#drive-menu-file"]];
  root.ownerDocument = { createElement: () => new Element() };
  const state = { mounted: null, selection: 0, busy: false, running: true, canFormat: true, canBoot: true };
  const actions = { state: () => state, select() {}, projects: () => [], library: () => [], ...overrides };
  const menu = new MicrodriveMenu(root, actions);
  return { menu, root, nodes, buttons, format, units, state };
}

test("choosing MDV2 offers insertion while MDV1 runs, but formatting and mounted-media changes wait", () => {
  const { menu, buttons, format, state } = harness();
  state.selection = 1;
  menu.open(2);
  assert.match(menu.title.textContent, /MDV2/);
  assert.equal(buttons.file.disabled, false);
  assert.equal(buttons.new.disabled, false);
  assert.equal(format.disabled, true);
  state.mounted = { name: "existing.mdv", writeProtected: true };
  menu.refresh();
  assert.equal(buttons.file.disabled, true);
  assert.equal(buttons.eject.disabled, true);
  state.selection = 0;
  menu.refresh();
  assert.equal(buttons.eject.disabled, false);
});

test("an asynchronous insertion retains its selected unit and prevents switching or dismissing mid-operation", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const mounted = [];
  const { menu, root, buttons } = harness();
  menu.open(2);
  const operation = menu.run(async (slot) => { await pending; mounted.push(slot); });
  menu.open(1);
  assert.equal(menu.slot, 2);
  assert.equal(buttons.close.disabled, true);
  const cancel = new Event("cancel", { cancelable: true });
  root.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  resolve();
  await operation;
  assert.deepEqual(mounted, [2]);
  assert.equal(buttons.close.disabled, false);
});

test("file picker cancellation cannot send a late file to a different unit", async () => {
  const mounted = [];
  const { menu, root } = harness({ mount: (slot, file) => mounted.push([slot, file.name]) });
  menu.open(2);
  await menu.perform("file");
  root.close();
  menu.open(1);
  menu.fileInput.files = [{ name: "late.mdv" }];
  menu.fileInput.dispatchEvent(new Event("change"));
  await new Promise(setImmediate);
  assert.deepEqual(mounted, []);
  await menu.perform("file");
  menu.fileInput.files = [{ name: "chosen.mdv" }];
  menu.fileInput.dispatchEvent(new Event("change"));
  await new Promise(setImmediate);
  assert.deepEqual(mounted, [[1, "chosen.mdv"]]);
});

test("closing the menu restores the clicked port; failed actions leave the menu usable", async () => {
  const selected = [];
  const { menu, root, buttons } = harness({ select: (slot) => selected.push(slot) });
  const opener = new Element();
  menu.open(1, opener);
  await menu.run(() => { throw new Error("Cannot read cartridge"); });
  assert.match(menu.status.textContent, /Cannot read cartridge/);
  assert.equal(buttons.file.disabled, false);
  root.close();
  assert.equal(opener.focused, true);
  assert.deepEqual(selected, [1, null]);
});

test("manager identifies the selected unit and only offers boot from an idle mounted MDV1", () => {
  const { menu, buttons, state, units } = harness();
  menu.open(1);
  assert.equal(buttons.boot.disabled, true);
  state.mounted = { name: "game.mdv", writeProtected: true };
  menu.refresh();
  assert.equal(buttons.boot.disabled, false);
  assert.equal(units[0].attributes["aria-pressed"], "true");
  menu.open(2);
  assert.equal(menu.title.textContent, "Gestor de MDV2");
  assert.equal(units[0].attributes["aria-pressed"], "false");
  assert.equal(units[1].attributes["aria-pressed"], "true");
  assert.equal(buttons.boot.hidden, true);
  menu.open(1);
  state.selection = 2;
  menu.refresh();
  assert.equal(buttons.boot.disabled, true, "reboot must not interrupt either drive's I/O");
});
