import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { importQlPackage } from "../src/formats/ql-package.js";
import { QlKeyboardInput } from "../src/ui/ql-keyboard.js";

test("Spook respeita as esperas da apresentação e recebe F1 e cursores mantidos", async () => {
  const io = new ZX8302();
  const video = new ZX8301();
  const bus = new QLBus({ devices: [video, io] });
  const cpu = new MC68008(bus);
  const introNotes = [];
  io.onSound = (event) => {
    if (event.type === "start" && introNotes.length < 2) {
      introNotes.push({ pitch: event.sound.pitch, cycles: cpu.cycles });
    }
  };
  const keyboard = new QlKeyboardInput(io);
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  const archive = new Uint8Array(await readFile(new URL("../local-software/Spook.zip", import.meta.url)));
  const imported = await importQlPackage(archive, { name: "Spook.zip" });
  io.mountMicrodrive(1, imported.image);
  cpu.reset();
  io.enqueueKey(57);
  const advance = (cycles) => {
    const end = cpu.cycles + cycles;
    while (cpu.cycles < end) {
      bus.tick(cpu.step());
      cpu.setInterruptLevel(bus.interruptLevel);
    }
  };
  const frameHash = () => createHash("sha256").update(video.renderFrame(bus)).digest("hex");
  advance(300_000_000);
  // The opening tune uses CPU delay loops too, before F1 is pressed.
  // With DBcc timing and shared RAM, its first two notes are ~508 ms apart;
  // bus-only accounting without contention compressed this to ~222 ms.
  assert.deepEqual(introNotes.map((note) => note.pitch), [82, 68]);
  const noteInterval = (introNotes[1].cycles - introNotes[0].cycles) / 7_500_000;
  assert.ok(noteInterval > 0.49 && noteInterval < 0.53, `Opening note interval: ${noteInterval}s`);
  keyboard.keyDown({ code: "F1" });
  advance(750_000);
  keyboard.keyUp({ code: "F1" });
  advance(15_000_000);
  // Inspected reference: new game, player in the central lower corridor.
  assert.equal(frameHash(), "bd74ad40cf3572fa96fcf19b93d99cb16e200935af378efb1bc9d8a1a5e2c822");
  keyboard.keyDown({ code: "ArrowLeft" });
  advance(1_875_000);
  // Measure before reaching the wall: in 250 ms the player moves 24 display
  // pixels (12 MODE 8 pixels), eats two pellets, and ghosts advance too.
  // A longer held direction hits the wall and hides excessive game speed.
  assert.equal(frameHash(), "9c0dd0ce23001d76df98d1a256c28a41260d69623f32dbb0174c0ee2a3d8efff");
  keyboard.keyUp({ code: "ArrowLeft" });
  assert.equal(io.keyboardMatrix[1], 0);
});
