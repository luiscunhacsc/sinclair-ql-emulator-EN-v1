import test from "node:test";
import assert from "node:assert/strict";
import { CartridgeProjects } from "../src/ui/cartridge-projects.js";
import { MicrodriveImage, MICRODRIVE_FORMAT } from "../src/devices/microdrive.js";

function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i],
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test("personal projects survive a new store instance with independent bytes and cartridge geometry", async () => {
  const disk = storage();
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  bytes[90] = 42;
  const image = new MicrodriveImage(bytes, { writeProtected: false, physicalSectorCount: 254, spliceSector: 127 });
  const original = new CartridgeProjects(() => disk).save(image, "O meu projeto");
  image.writePhysicalByte(0, 90, 99);
  const reloaded = new CartridgeProjects(() => disk);
  const [project] = reloaded.list();
  assert.equal(project.id, original.id);
  const file = reloaded.file(project);
  assert.equal(file.name, "O meu projeto.mdv");
  assert.equal(file.writeProtected, false);
  assert.equal(file.physicalSectorCount, 254);
  assert.equal(file.spliceSector, 127);
  const restored = new Uint8Array(await file.arrayBuffer());
  assert.equal(restored[90], 42);
  restored[90] = 7;
  assert.equal(new Uint8Array(await file.arrayBuffer())[90], 42);
});

test("saving a new version never overwrites an older copy, and removal affects only the selected snapshot", () => {
  const disk = storage();
  const projects = new CartridgeProjects(() => disk);
  const image = new MicrodriveImage(new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  const first = projects.save(image, "Trabalho");
  const second = projects.save(image, "Trabalho");
  assert.notEqual(first.id, second.id);
  projects.remove(second.id);
  assert.deepEqual(projects.list().map((p) => p.id), [first.id]);
});

test("quota failures preserve existing projects and are reported to the caller", () => {
  const disk = storage();
  const projects = new CartridgeProjects(() => disk);
  const image = new MicrodriveImage(new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  const saved = projects.save(image, "Original");
  disk.setItem = () => { throw new Error("Quota exceeded"); };
  assert.throws(() => projects.save(image, "Another"), /Quota/);
  assert.deepEqual(projects.list().map((p) => p.id), [saved.id]);
});

test("corrupt entries do not hide recoverable projects; unavailable storage is not presented as a successful save", () => {
  const disk = storage();
  const projects = new CartridgeProjects(() => disk);
  const image = new MicrodriveImage(new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  projects.save(image, "Good");
  disk.setItem("sinclair-ql-project:bad", "broken json");
  disk.setItem("unrelated", "data");
  assert.equal(projects.list().length, 1);
  const unavailable = new CartridgeProjects(() => { throw new Error("Storage denied"); });
  assert.throws(() => unavailable.save(image, "New"), /Storage denied/);
});
