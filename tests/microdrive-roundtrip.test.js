import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { buildMicrodriveImage } from "../src/formats/microdrive-builder.js";
import { qlTextEvents } from "../src/ui/ql-text-input.js";
import { guideLesson } from "../src/ui/guide-content.js";

async function machine() {
  const video = new ZX8301();
  const drives = new ZX8302();
  const bus = new QLBus({ devices: [video, drives] });
  bus.loadRom(new Uint8Array(await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url))));
  const cpu = new MC68008(bus);
  cpu.reset();
  const run = (limit, until = () => false) => {
    for (let i = 0; i < limit; i += 1) {
      bus.tick(cpu.step());
      cpu.setInterruptLevel(bus.interruptLevel);
      if (until()) return;
    }
  };
  const command = (source) => {
    for (const event of qlTextEvents(`${source}\n`)) drives.enqueueKey(event.keyrow, event);
  };
  const settle = () => {
    let quietSince = cpu.cycles;
    let settled = false;
    run(150_000_000, () => {
      if (drives.microdriveSelection || drives.keyboardQueue.length) quietSince = cpu.cycles;
      settled = cpu.cycles - quietSince > 750_000;
      return settled;
    });
    assert.ok(settled, "o comando deve terminar e os motores permanecer parados");
  };
  drives.enqueueKey(57);
  run(2_000_000);
  return { video, drives, bus, run, command, settle };
}

const encoded = (text) => new TextEncoder().encode(text);

// Read the saved filesystem, not QDOS's RAM cache or just its activity counter.
function fileBytes(image, fileNumber) {
  const bytes = image.toUint8Array();
  const sectors = Array.from({ length: 255 }, (_, i) => bytes.subarray(i * 686, (i + 1) * 686));
  const map = sectors.find((sector) => sector[12] === 255 && sector[13] === 0).subarray(52, 564);
  const blocks = sectors.filter((sector) => map[sector[13] * 2] === fileNumber)
    .sort((a, b) => map[a[13] * 2 + 1] - map[b[13] * 2 + 1]);
  const result = new Uint8Array(blocks.length * 512);
  blocks.forEach((sector, i) => result.set(sector.subarray(52, 564), i * 512));
  const size = new DataView(result.buffer).getUint32(0);
  return result.slice(0, size);
}

test("COPY entre MDV1 e MDV2 preserva todos os blocos e executa após exportar e reiniciar", async () => {
  const m = await machine();
  const program = encoded(Array.from({ length: 70 }, (_, i) => `${i + 1} REM ${"X".repeat(80)}\n`).join("") + "100 MODE 8\n");
  const executable = Uint8Array.from({ length: 1800 }, (_, i) => i & 255);
  const source = m.drives.mountMicrodrive(1, buildMicrodriveImage([
    { name: "large_bas", bytes: program },
    { name: "tool", bytes: executable, type: 1, dataSpace: 4096 },
  ], { mediumName: "SOURCE" }));
  const original = source.toUint8Array();
  const target = m.drives.mountMicrodrive(2, buildMicrodriveImage([
    { name: "dummy", bytes: encoded("keep") },
  ], { mediumName: "TARGET" }), { writeProtected: false });
  m.command("copy mdv1_large_bas to mdv2_copy_bas");
  m.settle();
  m.command("copy mdv1_tool to mdv2_tool");
  m.settle();
  assert.equal(m.drives.activeMicrodrive, 0);
  assert.deepEqual(fileBytes(target, 2).subarray(64), program);
  const tool = fileBytes(target, 3);
  assert.equal(tool[5], 1);
  assert.equal(new DataView(tool.buffer, tool.byteOffset).getUint32(6), 4096);
  assert.deepEqual(tool.subarray(64), executable);
  assert.deepEqual(source.toUint8Array(), original);
  assert.equal(source.dirty, false);

  source.writeProtected = false;
  m.command("copy mdv2_copy_bas to mdv1_copy_back");
  m.settle();
  assert.equal(m.drives.activeMicrodrive, 0, "a cópia de volta deve terminar");
  assert.deepEqual(fileBytes(source, 3).subarray(64), program);
  m.command("delete mdv1_copy_back");
  m.settle();
  assert.equal(m.drives.activeMicrodrive, 0, "DELETE deve terminar");
  const directory = fileBytes(source, 0);
  assert.equal(new DataView(directory.buffer).getUint16(3 * 64 + 14), 0, "DELETE liberta a entrada anulando o nome");

  const fresh = await machine();
  fresh.drives.mountMicrodrive(2, target.toUint8Array());
  fresh.command("lrun mdv2_copy_bas");
  fresh.run(30_000_000, () => fresh.video.mode === 8);
  assert.equal(fresh.video.mode, 8, "o programa copiado deve carregar de uma imagem sem cache");
});

test("FORMAT permite reutilizar uma imagem importada e a sua cópia exportada", async () => {
  const m = await machine();
  let bytes = buildMicrodriveImage([{ name: "old", bytes: encoded("old") }]);
  for (const name of ["first", "second"]) {
    const image = m.drives.mountMicrodrive(2, bytes, { writeProtected: false });
    m.command(`format mdv2_${name}`);
    m.settle();
    assert.equal(m.drives.activeMicrodrive, 0, "FORMAT deve terminar");
    const formatted = image.toUint8Array();
    const sectors = Array.from({ length: 255 }, (_, i) => formatted.subarray(i * 686, (i + 1) * 686));
    const map = sectors.find((sector) => sector[12] === 255 && sector[13] === 0);
    assert.equal(map[40], 0xf8, "FORMAT deve escrever um mapa válido, não apenas apagar o cartucho");
    m.command("100 mode 8");
    m.run(500_000);
    m.command("save mdv2_demo");
    m.settle();
    assert.equal(m.drives.activeMicrodrive, 0);
    bytes = image.toUint8Array();
    const fresh = await machine();
    fresh.drives.mountMicrodrive(2, bytes);
    fresh.command("lrun mdv2_demo");
    fresh.run(10_000_000, () => fresh.video.mode === 8);
    assert.equal(fresh.video.mode, 8, "SAVE deve sobreviver a FORMAT e exportação");
  }
});

test("o exemplo do guia usa dois canais e EOF para transferir todos os valores entre cartuchos", async () => {
  const m = await machine();
  // More than the introductory ten values: EOF must determine when to stop.
  const values = Array.from({ length: 13 }, (_, i) => (i + 1) ** 2);
  m.drives.mountMicrodrive(1, buildMicrodriveImage([
    { name: "guide_data", bytes: encoded(`${values.join("\n")}\n`) },
  ], { mediumName: "DATA" }));
  const target = m.drives.mountMicrodrive(2, buildMicrodriveImage([
    { name: "dummy", bytes: encoded("keep") },
  ], { mediumName: "RESULTS" }), { writeProtected: false });
  // Let the console edit each line, as the guide's keyboard loader does.
  for (const line of ["NEW", ...guideLesson("dois-canais-dois-microdrives").code.split("\n"), "190 MODE 8", "RUN"]) {
    m.command(line);
    m.run(250_000);
  }
  // A quiet motor can occur between accesses. Wait for the program to finish
  // (including both CLOSE calls), then check the persisted data.
  m.run(30_000_000, () => m.video.mode === 8);
  assert.equal(m.video.mode, 8, "o programa deve chegar ao fim depois de fechar ambos os canais");
  m.settle();
  assert.equal(m.drives.activeMicrodrive, 0);
  const output = new TextDecoder().decode(fileBytes(target, 2).subarray(64));
  assert.deepEqual(output.trim().split(/\s+/u).map(Number), values);
});
