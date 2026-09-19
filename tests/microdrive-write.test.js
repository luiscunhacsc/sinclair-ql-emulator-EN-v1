import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { MICRODRIVE_FORMAT } from "../src/devices/microdrive.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { QDOS_FILESYSTEM } from "../src/formats/microdrive-builder.js";
import { QL_KEYBOARD } from "../src/ui/ql-keyboard.js";

const HEADER_OFFSET = MICRODRIVE_FORMAT.headerPreambleSize;
const RECORD_OFFSET = HEADER_OFFSET
  + MICRODRIVE_FORMAT.headerSize
  + MICRODRIVE_FORMAT.dataPreambleSize;

function enqueueText(zx8302, text) {
  for (const character of text) {
    if (/^[a-z]$/u.test(character)) {
      zx8302.enqueueKey(QL_KEYBOARD.keyrowByCode[`Key${character.toUpperCase()}`]);
    } else if (/^[0-9]$/u.test(character)) {
      zx8302.enqueueKey(QL_KEYBOARD.keyrowByCode[`Digit${character}`]);
    } else if (character === "_") {
      zx8302.enqueueKey(QL_KEYBOARD.keyrowByCode.Minus, { shift: true });
    } else if (character === " ") {
      zx8302.enqueueKey(QL_KEYBOARD.keyrowByCode.Space);
    } else if (character === "\n") {
      zx8302.enqueueKey(QL_KEYBOARD.keyrowByCode.Enter);
    } else {
      throw new Error(`Carácter de teste não suportado: ${character}`);
    }
  }
}

function step(cpu, bus) {
  const cycles = cpu.step();
  bus.tick(cycles);
  cpu.setInterruptLevel(bus.interruptLevel);
}

function findSector(image, sectorNumber) {
  const bytes = image.toUint8Array();
  for (let physical = 0; physical < MICRODRIVE_FORMAT.sectorCount; physical += 1) {
    const base = physical * MICRODRIVE_FORMAT.sectorSize;
    if (bytes[base + HEADER_OFFSET] === 0xff && bytes[base + HEADER_OFFSET + 1] === sectorNumber) {
      return bytes.subarray(base, base + MICRODRIVE_FORMAT.sectorSize);
    }
  }
  return null;
}

function containsAscii(image, text) {
  const bytes = image.toUint8Array();
  const needle = new TextEncoder().encode(text);
  return bytes.some((_, offset) => (
    offset <= bytes.length - needle.length
    && needle.every((value, index) => bytes[offset + index] === value)
  ));
}

test("a Minerva executa FORMAT, SAVE e LOAD num cartucho virgem", async () => {
  const zx8301 = new ZX8301();
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8301, zx8302] });
  const rom = await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url));
  bus.loadRom(new Uint8Array(rom));
  const cpu = new MC68008(bus);
  cpu.reset();
  zx8302.enqueueKey(QL_KEYBOARD.keyrowByCode.F1);

  // Reach the interactive prompt before inserting blank media. Otherwise the
  // boot-time mdv1_boot search is still consuming input when FORMAT is typed.
  for (let instruction = 0; instruction < 2_000_000; instruction += 1) step(cpu, bus);
  const image = zx8302.mountMicrodrive(
    1,
    new Uint8Array(MICRODRIVE_FORMAT.imageSize),
    {
      name: "virgem.mdv",
      writeProtected: false,
      physicalSectorCount: MICRODRIVE_FORMAT.sectorCount - 1,
      spliceSector: Math.floor((MICRODRIVE_FORMAT.sectorCount - 1) / 2),
    },
  );
  enqueueText(zx8302, "format mdv1_test\n");

  const instructionLimit = 30_000_000;
  let instructions = 0;
  let mapSector = null;
  while (instructions < instructionLimit) {
    step(cpu, bus);
    instructions += 1;
    if (instructions % 50_000 === 0) {
      const sector = findSector(image, 0);
      if (sector?.[RECORD_OFFSET] === QDOS_FILESYSTEM.mapFile) {
        mapSector = sector;
        break;
      }
    }
  }

  assert.ok(
    mapSector,
    `FORMAT não produziu o mapa: escritas=${zx8302.microdriveDataWrites}, leituras=${zx8302.microdriveDataReads}, `
      + `setor=${zx8302.microdriveSector}, posição=${zx8302.microdrivePhysicalOffset}, `
      + `ativo=${zx8302.activeMicrodrive}, fila=${zx8302.keyboardQueue.length}, `
      + `PC=${cpu.pc.toString(16)}, exceção=${cpu.lastException?.vector ?? "nenhuma"}, `
      + `início=${[...image.toUint8Array().subarray(0, 48)].map((value) => value.toString(16).padStart(2, "0")).join("")}`,
  );
  assert.equal(new TextDecoder().decode(mapSector.subarray(HEADER_OFFSET + 2, HEADER_OFFSET + 6)), "test");
  assert.equal(image.dirty, true);

  for (let instruction = 0; instruction < 30_000_000 && zx8302.activeMicrodrive; instruction += 1) {
    step(cpu, bus);
  }
  assert.equal(zx8302.activeMicrodrive, 0, "FORMAT não terminou");

  const writesAfterFormat = zx8302.microdriveDataWrites;
  enqueueText(zx8302, "100 print 42\nsave mdv1_demo\n");
  let saved = false;
  for (let instruction = 0; instruction < 15_000_000; instruction += 1) {
    step(cpu, bus);
    if (instruction % 50_000 === 0 && containsAscii(image, "demo")) {
      saved = true;
      break;
    }
  }

  assert.ok(saved, "SAVE mdv1_demo não criou uma entrada no diretório");
  assert.ok(zx8302.microdriveDataWrites > writesAfterFormat);

  for (let instruction = 0; instruction < 30_000_000 && zx8302.activeMicrodrive; instruction += 1) {
    step(cpu, bus);
  }
  assert.equal(zx8302.activeMicrodrive, 0, "SAVE não terminou");

  const exported = image.toUint8Array();
  zx8302.unmountMicrodrive(1);
  const reloaded = zx8302.mountMicrodrive(1, exported, { name: "guardado.mdv" });
  const readsBeforeLoad = zx8302.microdriveDataReads;
  enqueueText(zx8302, "new\nload mdv1_demo\n");
  let loadStarted = false;
  for (let instruction = 0; instruction < 15_000_000; instruction += 1) {
    step(cpu, bus);
    if (zx8302.microdriveDataReads > readsBeforeLoad) loadStarted = true;
    if (loadStarted && zx8302.activeMicrodrive === 0 && zx8302.keyboardQueue.length === 0) break;
  }

  assert.ok(loadStarted, "LOAD mdv1_demo não leu a imagem .mdv exportada");
  assert.equal(reloaded.writeProtected, true);
  assert.equal(reloaded.dirty, false);
});
