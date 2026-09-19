import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { QLBus } from "../src/core/bus.js";
import { MC68008 } from "../src/core/mc68008.js";
import { MICRODRIVE_FORMAT } from "../src/devices/microdrive.js";
import { ZX8301 } from "../src/devices/zx8301.js";
import { ZX8302 } from "../src/devices/zx8302.js";
import { buildMicrodriveImage, QDOS_FILESYSTEM } from "../src/formats/microdrive-builder.js";
import { importQlPackage } from "../src/formats/ql-package.js";
import { readZipArchive } from "../src/formats/zip.js";

function crc32(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function write16(target, value) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function write32(target, value) {
  write16(target, value & 0xffff);
  write16(target, value >>> 16);
}

function makeZip(entries) {
  const local = [];
  const central = [];
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const content = typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content;
    const method = entry.method ?? 0;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(content)) : content;
    const extra = entry.extra ?? new Uint8Array();
    const offset = local.length;

    write32(local, 0x0403_4b50);
    write16(local, 20);
    write16(local, 0x800);
    write16(local, method);
    write16(local, 0);
    write16(local, 0);
    write32(local, crc32(content));
    write32(local, compressed.byteLength);
    write32(local, content.byteLength);
    write16(local, name.byteLength);
    write16(local, extra.byteLength);
    local.push(...name, ...extra, ...compressed);

    write32(central, 0x0201_4b50);
    write16(central, 20);
    write16(central, 20);
    write16(central, 0x800);
    write16(central, method);
    write16(central, 0);
    write16(central, 0);
    write32(central, crc32(content));
    write32(central, compressed.byteLength);
    write32(central, content.byteLength);
    write16(central, name.byteLength);
    write16(central, extra.byteLength);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write32(central, 0);
    write32(central, offset);
    central.push(...name, ...extra);
  }

  const result = [...local, ...central];
  write32(result, 0x0605_4b50);
  write16(result, 0);
  write16(result, 0);
  write16(result, entries.length);
  write16(result, entries.length);
  write32(result, central.length);
  write32(result, local.length);
  write16(result, 0);
  return Uint8Array.from(result);
}

function inlineQdosHeader(content, { type = 1, dataSpace = 0 } = {}) {
  const header = new Uint8Array(30 + content.byteLength);
  header.set(new TextEncoder().encode("]!QDOS File Header"));
  header[19] = 15;
  header[21] = type;
  header[22] = (dataSpace >>> 24) & 0xff;
  header[23] = (dataSpace >>> 16) & 0xff;
  header[24] = (dataSpace >>> 8) & 0xff;
  header[25] = dataSpace & 0xff;
  header.set(content, 30);
  return header;
}

function qdosZipExtra({ type = 1, dataSpace = 0, signature = "QDOS02\0\x65" } = {}) {
  const extra = new Uint8Array(4 + signature.length + 64);
  extra[0] = 0x4a;
  extra[1] = 0xfb;
  extra[2] = extra.length - 4;
  extra.set(new TextEncoder().encode(signature), 4);
  const header = 4 + signature.length;
  extra[header + 5] = type;
  extra[header + 6] = (dataSpace >>> 24) & 0xff;
  extra[header + 7] = (dataSpace >>> 16) & 0xff;
  extra[header + 8] = (dataSpace >>> 8) & 0xff;
  extra[header + 9] = dataSpace & 0xff;
  return extra;
}

function be32(bytes, offset) {
  return (
    (bytes[offset] * 0x1_000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

function sectorPayload(image, physicalIndex) {
  const start = physicalIndex * MICRODRIVE_FORMAT.sectorSize
    + MICRODRIVE_FORMAT.headerPreambleSize
    + MICRODRIVE_FORMAT.headerSize
    + MICRODRIVE_FORMAT.dataPreambleSize
    + 12;
  return image.subarray(start, start + QDOS_FILESYSTEM.dataSize);
}

function sectorRecord(physicalIndex) {
  return physicalIndex * MICRODRIVE_FORMAT.sectorSize
    + MICRODRIVE_FORMAT.headerPreambleSize
    + MICRODRIVE_FORMAT.headerSize
    + MICRODRIVE_FORMAT.dataPreambleSize;
}

test("lê entradas ZIP armazenadas e Deflate e valida a integridade", async () => {
  const zip = makeZip([
    { name: "plain", content: "ABC" },
    { name: "compressed", content: "texto repetido texto repetido", method: 8 },
  ]);
  const entries = await readZipArchive(zip);
  assert.deepEqual(entries.map((entry) => entry.name), ["plain", "compressed"]);
  assert.equal(new TextDecoder().decode(entries[1].bytes), "texto repetido texto repetido");

  const corrupted = zip.slice();
  corrupted[35] ^= 1;
  await assert.rejects(() => readZipArchive(corrupted), /integridade/u);
  await assert.rejects(
    () => readZipArchive(makeZip([{ name: "../escape", content: "x" }])),
    /caminho inseguro/u,
  );
});

test("constrói diretório, mapa de alocação e cabeçalhos QDOS numa imagem QLAY", () => {
  const image = buildMicrodriveImage([
    { name: "boot", bytes: new TextEncoder().encode("100 PRINT 42\n") },
    { name: "prog.bin", bytes: Uint8Array.of(0x4e, 0x75), type: 1, dataSpace: 0x1234 },
  ], { mediumName: "TESTE", mediumId: 0x4567 });

  assert.equal(image.byteLength, MICRODRIVE_FORMAT.imageSize);
  assert.equal(image[MICRODRIVE_FORMAT.headerPreambleSize + 1], 0, "o primeiro setor físico é o mapa");
  assert.equal(image[sectorRecord(0)], 0x80, "o mapa é um registo final do ficheiro 0");
  const map = sectorPayload(image, 0);
  assert.equal(map[0], QDOS_FILESYSTEM.mapFile);
  assert.deepEqual([...map.subarray(2, 8)], [0, 0, 1, 0, 2, 0]);
  assert.equal(map[508], QDOS_FILESYSTEM.damagedSector);

  const directory = sectorPayload(image, 1);
  assert.equal(be32(directory, 0), 192);
  assert.equal(be32(directory, 64), 64 + 13);
  assert.equal(new TextDecoder().decode(directory.subarray(80, 84)), "boot");
  assert.equal(directory[128 + 5], 1);
  assert.equal(be32(directory, 128 + 6), 0x1234);
  assert.equal(new TextDecoder().decode(directory.subarray(144, 152)), "prog_bin");
  assert.equal(image[sectorRecord(1)], 0x80, "o diretório cabe num único bloco final");
  assert.equal(image[sectorRecord(2)], 0x81, "BOOT é o último bloco do ficheiro 1");
});

test("converte QLPAK em MDV, remove o cabeçalho inline e adapta FLP1 no BOOT", async () => {
  const program = Uint8Array.of(0x4e, 0x75);
  const zip = makeZip([
    { name: "Demo.QCF", content: "Slot1=PAK:\r\nPakDir1=Demo\r\nFloppyName=FLP\r\n", method: 8 },
    { name: "Demo/boot", content: "100 EXEC_W flp1_prog_bin\n", method: 8 },
    { name: "Demo/prog.bin", content: inlineQdosHeader(program, { dataSpace: 0x2345 }) },
  ]);
  const imported = await importQlPackage(zip, { name: "Demo.qlpak" });

  assert.equal(imported.image.byteLength, MICRODRIVE_FORMAT.imageSize);
  assert.equal(imported.files.length, 2);
  assert.equal(imported.bootReplacements, 1);
  assert.equal(new TextDecoder().decode(imported.files[0].bytes), "100 EXEC_W mdv1_prog_bin\n");
  assert.deepEqual(imported.files[1].bytes, program);
  assert.equal(imported.files[1].type, 1);
  assert.equal(imported.files[1].dataSpace, 0x2345);

  const mountedOnTwo = await importQlPackage(zip, { name: "Demo.qlpak", microdrive: 2 });
  assert.equal(
    new TextDecoder().decode(mountedOnTwo.files[0].bytes),
    "100 EXEC_W mdv2_prog_bin\n",
  );
});

test("recusa uma unidade de destino inexistente", async () => {
  const zip = makeZip([{ name: "boot", content: "100 PRINT 42\n" }]);
  await assert.rejects(() => importQlPackage(zip, { microdrive: 3 }), /MDV1.*MDV2/u);
});

test("preserva metadados do campo adicional QDOS dos ZIPs", async () => {
  const zip = makeZip([{ name: "tool", content: "binary", extra: qdosZipExtra({ dataSpace: 0x3456 }) }]);
  const imported = await importQlPackage(zip, { name: "tools.zip" });
  assert.equal(imported.files[0].type, 1);
  assert.equal(imported.files[0].dataSpace, 0x3456);
});

test("reconhece as variantes QDOS02 e QZHD e prepara um único executável para a unidade escolhida", async () => {
  for (const signature of ["QDOS02\0\x65", "QZHD", "QZHDQDOS"]) {
    const zip = makeZip([{ name: "chess", content: "binary", extra: qdosZipExtra({ dataSpace: 0x7890, signature }) }]);
    const imported = await importQlPackage(zip, { microdrive: 2 });
    assert.equal(imported.files[0].type, 1);
    assert.equal(imported.files[0].dataSpace, 0x7890);
    assert.equal(imported.generatedBoot, true);
    assert.equal(new TextDecoder().decode(imported.files[1].bytes), "10 EXEC_W mdv2_chess\n");
  }
});

test("não inventa um arranque para dados, metadados truncados ou pacotes com vários executáveis", async () => {
  for (const entries of [
    [{ name: "data", content: "data" }],
    [{ name: "chess", content: "binary", extra: qdosZipExtra().slice(0, 50) }],
    [{ name: "chess", content: "binary", extra: qdosZipExtra({ signature: "QDOS03\0\0" }) }],
    [{ name: "unsafe\nname", content: "binary", extra: qdosZipExtra() }],
    ["one", "two"].map((name) => ({ name, content: "binary", extra: qdosZipExtra() })),
    [{ name: "boot", content: "10 PRINT 42\n" }, { name: "chess", content: "binary", extra: qdosZipExtra() }],
  ]) {
    const imported = await importQlPackage(makeZip(entries));
    assert.equal(imported.generatedBoot, false);
    assert.equal(imported.files.length, entries.length);
  }
});

test("a Minerva arranca um BOOT importado de QLPAK", async () => {
  const zip = makeZip([
    { name: "Mode8.QCF", content: "Slot1=PAK:\r\nPakDir1=Mode8\r\nFloppyName=FLP\r\n" },
    { name: "Mode8/boot", content: "5 MODE 8\n" },
  ]);
  const imported = await importQlPackage(zip, { name: "Mode8.qlpak" });
  const zx8301 = new ZX8301();
  const zx8302 = new ZX8302();
  zx8302.mountMicrodrive(1, imported.image);
  const bus = new QLBus({ devices: [zx8301, zx8302] });
  const rom = await readFile(new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url));
  bus.loadRom(new Uint8Array(rom));
  const cpu = new MC68008(bus);
  cpu.reset();
  zx8302.enqueueKey(57); // F1 escolhe MODE 4; só o BOOT importado muda depois para MODE 8.

  const instructionLimit = 8_000_000;
  let instructions = 0;
  while (instructions < instructionLimit && !(zx8302.microdriveDataReads > 0 && zx8301.mode === 8)) {
    const cycles = cpu.step();
    bus.tick(cycles);
    cpu.setInterruptLevel(bus.interruptLevel);
    instructions += 1;
  }

  assert.ok(instructions < instructionLimit, "o BOOT convertido não foi executado");
  assert.ok(zx8302.microdriveDataReads > 0);
  assert.equal(zx8301.mode, 8);
});

test("recusa pacotes que não cabem num Microdrive", async () => {
  const zip = makeZip([{ name: "huge", content: new Uint8Array(130_000), method: 8 }]);
  await assert.rejects(() => importQlPackage(zip), /necessita de .* setores/u);
});

test("explica capacidade por cartucho e configuração dos pacotes SMSQ/E grandes", async () => {
  const zip = makeZip([
    { name: "demo.qcf", content: "Ram=8064K\nVideoCard=Q60\nUseHardDiskName=Yes\nHardDiskName=WIN\n" },
    { name: "boot", content: "100 LRESPR win1_SMSQ_QEM\n" },
    { name: "SMSQ_QEM", content: new Uint8Array(275_252), method: 8 },
  ]);
  await assert.rejects(() => importQlPackage(zip), (error) => {
    assert.equal(error.name, "MicrodriveCapacityError");
    assert.ok(error.requiredSectors > error.availableSectors);
    assert.match(error.message, /KiB/u);
    assert.match(error.message, /MDV1 e MDV2 não formam um único disco/u);
    assert.match(error.message, /RAM 8064K; vídeo Q60; disco WIN/u);
    assert.match(error.message, /128 KiB/u);
    return true;
  });
});
