import assert from "node:assert/strict";
import test from "node:test";
import { MicrodriveProtection, canSaveMicrodrive } from "../src/ui/microdrive-protection.js";
import { MicrodriveImage, MICRODRIVE_FORMAT } from "../src/devices/microdrive.js";

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test("imports default to protected; new cartridges default to writable independently", async () => {
  const prefs = new MicrodriveProtection(() => storage());
  const bytes = new Uint8Array(8);
  const imported = { name: "my-program.mdv" };
  assert.equal(prefs.isProtected(await prefs.keyFor(imported, bytes), imported), true);
  const first = { virgin: true }, second = { virgin: true };
  const firstKey = await prefs.keyFor(first, bytes);
  const secondKey = await prefs.keyFor(second, bytes);
  assert.notEqual(firstKey, secondKey);
  assert.equal(prefs.isProtected(firstKey, first), false);
  prefs.remember(firstKey, true);
  assert.equal(prefs.isProtected(await prefs.keyFor(first, bytes), first), true);
  assert.equal(prefs.isProtected(secondKey, second), false);
});

test("choices survive reload and renaming, without confusing different files with the same name", async () => {
  const saved = storage();
  const first = new MicrodriveProtection(() => saved);
  const bytes = new Uint8Array([1, 2, 3]);
  first.remember(await first.keyFor({ name: "work.mdv" }, bytes), false);
  const restored = new MicrodriveProtection(() => saved);
  assert.equal(restored.isProtected(await restored.keyFor({ name: "renamed.mdv" }, bytes), {}), false);
  assert.equal(restored.isProtected(await restored.keyFor({ name: "work.mdv" }, new Uint8Array([4, 5, 6])), {}), true);
});

test("protecting a changed cartridge blocks new writes but preserves its export", async () => {
  const source = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const image = new MicrodriveImage(source);
  assert.equal(canSaveMicrodrive(image), false);
  image.writeProtected = false;
  assert.equal(image.writePhysicalByte(0, 12, 0xaa), true);
  image.writeProtected = true;
  assert.equal(image.writePhysicalByte(0, 12, 0xbb), false);
  assert.equal(image.dirty, true);
  assert.equal(canSaveMicrodrive(image), true);
  assert.equal(image.toUint8Array()[12], 0xaa);
  assert.equal(source[12], 0, "the original file remains untouched");
  image.markClean();
  assert.equal(canSaveMicrodrive(image), false);
});

test("an exported user cartridge retains its chosen mode when imported again", async () => {
  const saved = storage();
  const prefs = new MicrodriveProtection(() => saved);
  const exported = new Uint8Array([9, 8, 7]);
  await prefs.rememberExport(exported, false);
  const restored = new MicrodriveProtection(() => saved);
  const key = await restored.keyFor({ name: "user-program.mdv" }, exported);
  assert.equal(restored.isProtected(key, {}), false);
  restored.remember(key, true);
  assert.equal(new MicrodriveProtection(() => saved).isProtected(key, {}), true);
});

test("unavailable or malformed storage keeps safe defaults and allows session choices", () => {
  const blocked = new MicrodriveProtection(() => { throw new Error("blocked"); });
  assert.equal(blocked.isProtected("sha256:a", {}), true);
  blocked.remember("sha256:a", false);
  assert.equal(blocked.isProtected("sha256:a", {}), false);
  const malformed = new MicrodriveProtection(() => ({ getItem: () => '{broken' }));
  assert.equal(malformed.isProtected("sha256:a", {}), true);
  const invalid = new MicrodriveProtection(() => ({ getItem: () => '[["sha256:a","false"]]' }));
  assert.equal(invalid.isProtected("sha256:a", {}), true);
});
