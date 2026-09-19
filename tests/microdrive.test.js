import assert from "node:assert/strict";
import test from "node:test";
import { MicrodriveImage, MICRODRIVE_FORMAT } from "../src/devices/microdrive.js";

test("valida o tamanho canónico das imagens QLAY .mdv", () => {
  assert.equal(MICRODRIVE_FORMAT.sectorCount, 255);
  assert.equal(MICRODRIVE_FORMAT.sectorSize, 686);
  assert.equal(MICRODRIVE_FORMAT.imageSize, 174_930);

  assert.throws(() => new MicrodriveImage(new Uint8Array(1)), RangeError);
  assert.throws(() => new MicrodriveImage(new ArrayBuffer(MICRODRIVE_FORMAT.imageSize)), TypeError);
});

test("expõe cabeçalhos e registos sem os preâmbulos físicos", () => {
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const sector = 7;
  const sectorStart = sector * MICRODRIVE_FORMAT.sectorSize;
  const recordStart = MICRODRIVE_FORMAT.headerPreambleSize
    + MICRODRIVE_FORMAT.headerSize
    + MICRODRIVE_FORMAT.dataPreambleSize;

  bytes[sectorStart + MICRODRIVE_FORMAT.headerPreambleSize] = 0x47;
  bytes[sectorStart + recordStart] = 0x91;
  const image = new MicrodriveImage(bytes, { name: "teste.mdv" });

  assert.equal(image.name, "teste.mdv");
  assert.equal(image.readHeaderByte(sector, 0), 0x47);
  assert.equal(image.readRecordByte(sector, 0), 0x91);
  assert.throws(() => image.readHeaderByte(255, 0), RangeError);
  assert.throws(() => image.readRecordByte(0, MICRODRIVE_FORMAT.recordSize), RangeError);

  bytes[sectorStart + MICRODRIVE_FORMAT.headerPreambleSize] = 0;
  assert.equal(image.readHeaderByte(sector, 0), 0x47, "a imagem montada deve ser uma cópia");
});

test("protege imagens carregadas e permite alterar e exportar cartuchos graváveis", () => {
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const protectedImage = new MicrodriveImage(bytes);
  assert.equal(protectedImage.writePhysicalByte(0, 12, 0xaa), false);
  assert.equal(protectedImage.readHeaderByte(0, 0), 0);
  assert.equal(protectedImage.dirty, false);

  const writable = new MicrodriveImage(bytes, { writeProtected: false, name: "novo.mdv" });
  assert.equal(writable.writePhysicalByte(0, 12, 0xaa), true);
  assert.equal(writable.readHeaderByte(0, 0), 0xaa);
  assert.equal(writable.dirty, true);
  const exported = writable.toUint8Array();
  exported[12] = 0;
  assert.equal(writable.readHeaderByte(0, 0), 0xaa, "a exportação deve ser uma cópia");
  writable.markClean();
  assert.equal(writable.dirty, false);
});

test("valida o número de setores do percurso físico", () => {
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const image = new MicrodriveImage(bytes, { physicalSectorCount: 254, spliceSector: 127 });
  assert.equal(image.physicalSectorCount, 254);
  assert.equal(image.spliceSector, 127);
  assert.throws(() => new MicrodriveImage(bytes, { physicalSectorCount: 0 }), RangeError);
  assert.throws(() => new MicrodriveImage(bytes, { physicalSectorCount: 256 }), RangeError);
  assert.throws(
    () => new MicrodriveImage(bytes, { physicalSectorCount: 254, spliceSector: 254 }),
    RangeError,
  );
});

test("a emenda física permanece ilegível e não gravável", () => {
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const image = new MicrodriveImage(bytes, {
    writeProtected: false,
    physicalSectorCount: 254,
    spliceSector: 127,
  });
  const offset = MICRODRIVE_FORMAT.headerPreambleSize;
  assert.equal(image.writePhysicalByte(127, offset, 0xaa), true);
  assert.equal(image.readHeaderByte(127, 0), 0);
  assert.equal(image.toUint8Array()[127 * MICRODRIVE_FORMAT.sectorSize + offset], 0);
});
