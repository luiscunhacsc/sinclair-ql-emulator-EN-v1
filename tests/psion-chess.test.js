import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { importQlPackage } from "../src/formats/ql-package.js";
import { readZipArchive } from "../src/formats/zip.js";
import { SOFTWARE_EXAMPLES } from "../src/ui/software-examples.js";

test("o Psion Chess da biblioteca arranca até ao tabuleiro com MDV2 vazia", async () => {
  const example = SOFTWARE_EXAMPLES.find((item) => item.title === "Psion Chess");
  const archive = new Uint8Array(await readFile(new URL(`../local-software/${example.name}`, import.meta.url)));
  const imported = await importQlPackage(archive, { name: example.name });
  assert.equal(imported.generatedBoot, true);
  assert.equal(imported.files[0].type, 1);
  assert.equal(imported.files[0].dataSpace, 0x7890);
  assert.deepEqual(imported.files[0].bytes, (await readZipArchive(archive))[0].bytes,
    "o executável deve ser preservado tal como consta do arquivo");

  const video = new ZX8301();
  const io = new ZX8302();
  const bus = new QLBus({ devices: [video, io] });
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  io.mountMicrodrive(1, imported.image, { name: example.name });
  const cpu = new MC68008(bus);
  cpu.reset();
  io.enqueueKey(57); // F1: the same startup used by “Carregar e arrancar”.
  while (cpu.cycles < 400_000_000) {
    bus.tick(cpu.step());
    cpu.setInterruptLevel(bus.interruptLevel);
  }

  assert.equal(io.microdrives[1], null);
  // Reference frame inspected at the initial chessboard, paused for a key.
  // A failed EXEC, cartridge prompt or return to BASIC cannot match it.
  assert.equal(createHash("sha256").update(video.renderFrame(bus)).digest("hex"),
    "ed6846776d4aba7d3477e14a3fee282a1936085e2c04a4bd8083ffea3a8bdf1f");
});
