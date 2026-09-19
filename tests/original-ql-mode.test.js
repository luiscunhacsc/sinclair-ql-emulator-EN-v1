import test from "node:test";
import assert from "node:assert/strict";
import { OriginalQlModeDialog, restartWithoutChat } from "../src/ui/original-ql-mode.js";
import { QLChatBridge } from "../src/ui/ql-chat.js";

class Element extends EventTarget {
  disabled = false;
  textContent = "";
  open = false;
  returnValue = "";
  showModal() { this.open = true; }
  close(value = this.returnValue) { this.returnValue = value; this.open = false; this.dispatchEvent(new Event("close")); }
  click() { this.dispatchEvent(new Event("click")); }
}

function harness(isChatMode, restart) {
  const root = new Element();
  const elements = Object.fromEntries(["destination", "confirm", "cancel", "status"].map((name) => [name, new Element()]));
  root.querySelector = (selector) => elements[selector.replace("#original-ql-", "")];
  const dialog = new OriginalQlModeDialog(root, { isChatMode, restart });
  return { root, elements, dialog };
}

test("ordinary QL navigation does not reset; cancelling a chat transition leaves it intact", async () => {
  let chatMode = false;
  let resets = 0;
  const { root, elements, dialog } = harness(() => chatMode, async () => resets++);
  assert.equal(await dialog.request("guide"), true);
  assert.equal(root.open, false);
  assert.equal(resets, 0);
  chatMode = true;
  const answer = dialog.request("guide");
  assert.equal(root.open, true);
  elements.cancel.click();
  assert.equal(await answer, false);
  assert.equal(resets, 0);
  const escape = dialog.request("software");
  root.close();
  assert.equal(await escape, false);
  assert.equal(resets, 0);
});

test("both destinations wait for reset completion and repeated clicks cannot start another transition", async () => {
  for (const destination of ["guide", "software"]) {
    let finish;
    let resets = 0;
    const { root, elements, dialog } = harness(() => true, () => { resets++; return new Promise((resolve) => { finish = resolve; }); });
    const answer = dialog.request(destination);
    assert.match(elements.confirm.textContent, destination === "guide" ? /guia/ : /biblioteca/);
    assert.equal(await dialog.request("guide"), false);
    elements.confirm.click();
    elements.confirm.click();
    elements.cancel.click();
    assert.equal(root.open, true);
    const escape = new Event("cancel", { cancelable: true });
    root.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(resets, 1);
    finish();
    assert.equal(await answer, true);
    assert.equal(root.open, false);
  }
});

test("a failed restart keeps the destination closed and lets the user retry or cancel", async () => {
  const { root, elements, dialog } = harness(() => true, async () => { throw new Error("failed"); });
  const answer = dialog.request("guide");
  await dialog.accept();
  assert.equal(root.open, true);
  assert.equal(elements.confirm.disabled, false);
  assert.match(elements.status.textContent, /Não foi possível/);
  elements.cancel.click();
  assert.equal(await answer, false);
});

test("leaving chat aborts a pending AI reply and drains loader cleanup before resetting the machine", async () => {
  let finishReply;
  let replySignal;
  const device = { serialReceive: [[1, 2, 3]], receiveSerial() { assert.fail("a late reply must not reach the original QL"); } };
  const bridge = new QLChatBridge({ device, reply: async (_prompt, { signal }) => {
    replySignal = signal;
    return new Promise((resolve) => { finishReply = resolve; });
  }, onMessage() { assert.fail("no late transcript update"); } });
  const reply = bridge.respond("fixture question", false);
  const order = [];
  let finishLoading;
  const loading = new Promise((resolve) => { finishLoading = () => { order.push("loader finished"); resolve(); }; });
  const transition = restartWithoutChat({ bridge, loading,
    cancelLoading: () => order.push("cancel loader"),
    reset: () => order.push("reset"), start: () => order.push("start"),
  });
  assert.equal(replySignal.aborted, true);
  assert.equal(bridge.active, false);
  assert.deepEqual(device.serialReceive[0], []);
  assert.deepEqual(order, ["cancel loader"]);
  finishLoading();
  await transition;
  assert.deepEqual(order, ["cancel loader", "loader finished", "reset", "start"]);
  finishReply("late provider reply");
  await reply;
});
