import { MICRODRIVE_FORMAT } from "../devices/microdrive.js";

const DATA_SIZE = 512;
const FILE_HEADER_SIZE = 64;
const FREE_SECTOR = 0xfd;
const DAMAGED_SECTOR = 0xff;
const MAP_FILE = 0xf8;
const LAST_SECTOR = MICRODRIVE_FORMAT.sectorCount - 1;

export class MicrodriveCapacityError extends Error {
  constructor(requiredSectors, availableSectors) {
    const kib = (sectors) => (sectors * DATA_SIZE / 1024).toLocaleString("pt-PT");
    super(`O pacote necessita de ${requiredSectors} setores (${kib(requiredSectors)} KiB); `
      + `um Microdrive só dispõe de ${availableSectors} setores (${kib(availableSectors)} KiB). `
      + "A capacidade é por cartucho; MDV1 e MDV2 não formam um único disco.");
    this.name = "MicrodriveCapacityError";
    this.requiredSectors = requiredSectors;
    this.availableSectors = availableSectors;
  }
}

function writeBe16(bytes, offset, value) {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeBe32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeLe16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function alternatingPattern() {
  return Uint8Array.from({ length: DATA_SIZE }, (_, index) => (index & 1 ? 0x55 : 0xaa));
}

function qlNameBytes(name) {
  const normalised = String(name).replaceAll(".", "_").slice(0, 36);
  const bytes = new TextEncoder().encode(normalised);
  if (bytes.some((byte) => byte > 0x7f)) throw new Error(`O nome ${name} não pode ser representado no QL.`);
  return { name: normalised, bytes };
}

export function buildQlFileHeader(file) {
  const content = file.bytes;
  if (!(content instanceof Uint8Array)) throw new TypeError("O conteúdo de cada ficheiro deve ser Uint8Array.");
  const encoded = qlNameBytes(file.name);
  const header = new Uint8Array(FILE_HEADER_SIZE);
  writeBe32(header, 0, content.byteLength + FILE_HEADER_SIZE);
  header[4] = file.access ?? 0;
  header[5] = file.type ?? 0;
  writeBe32(header, 6, file.dataSpace ?? 0);
  writeBe32(header, 10, file.extraInfo ?? 0);
  writeBe16(header, 14, encoded.bytes.byteLength);
  header.set(encoded.bytes, 16);
  writeBe32(header, 52, file.updateDate ?? 0);
  writeBe32(header, 56, file.referenceDate ?? 0);
  writeBe32(header, 60, file.backupDate ?? 0);
  return header;
}

function writePreamble(image, offset) {
  image[offset + 10] = 0xff;
  image[offset + 11] = 0xff;
}

function writeSector(image, physicalIndex, sectorNumber, mediumName, mediumId, fileNumber, block, data) {
  const base = physicalIndex * MICRODRIVE_FORMAT.sectorSize;
  writePreamble(image, base);
  const header = base + MICRODRIVE_FORMAT.headerPreambleSize;
  image[header] = 0xff;
  image[header + 1] = sectorNumber;
  const name = new TextEncoder().encode(mediumName.padEnd(10, " ").slice(0, 10));
  image.set(name, header + 2);
  writeBe16(image, header + 12, mediumId);
  let headerSum = 0;
  for (let index = 0; index < 14; index += 1) headerSum += image[header + index];
  writeLe16(image, header + 14, headerSum + 0x0f0f);

  const dataPreamble = header + MICRODRIVE_FORMAT.headerSize;
  writePreamble(image, dataPreamble);
  const record = dataPreamble + MICRODRIVE_FORMAT.dataPreambleSize;
  image[record] = fileNumber;
  image[record + 1] = block;
  writeLe16(image, record + 2, fileNumber + block + 0x0f0f);
  image[record + 10] = 0xff;
  image[record + 11] = 0xff;
  image.set(data, record + 12);
  let dataSum = 0;
  for (const byte of data) dataSum += byte;
  writeLe16(image, record + 524, dataSum + 0x0f0f);
  for (let index = 0; index < 84; index += 1) image[record + 526 + index] = index & 1 ? 0x55 : 0xaa;
  writeLe16(image, record + 610, 0x3b19);
  image.fill("Z".charCodeAt(0), record + MICRODRIVE_FORMAT.recordSize, base + MICRODRIVE_FORMAT.sectorSize);
}

/** Build a deterministic, read-only QLAY image from ordinary QL files. */
export function buildMicrodriveImage(files, { mediumName = "QLPACKAGE", mediumId = 0x514c } = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("O pacote não contém ficheiros para o QL.");
  if (files.length > 127) throw new Error("O pacote contém demasiados ficheiros para um Microdrive.");
  qlNameBytes(mediumName.slice(0, 10));

  const names = new Set();
  const normalisedFiles = files.map((file) => {
    const name = qlNameBytes(file.name).name;
    const key = name.toLocaleLowerCase("en");
    if (names.has(key)) throw new Error(`Dois ficheiros do pacote resultam no mesmo nome QL: ${name}.`);
    names.add(key);
    return { ...file, name, header: buildQlFileHeader({ ...file, name }) };
  });

  const directory = new Uint8Array((normalisedFiles.length + 1) * FILE_HEADER_SIZE);
  writeBe32(directory, 0, directory.byteLength);
  normalisedFiles.forEach((file, index) => directory.set(file.header, (index + 1) * FILE_HEADER_SIZE));
  const units = [directory, ...normalisedFiles.map((file) => {
    const unit = new Uint8Array(FILE_HEADER_SIZE + file.bytes.byteLength);
    unit.set(file.header);
    unit.set(file.bytes, FILE_HEADER_SIZE);
    return unit;
  })];

  const requiredSectors = units.reduce((sum, unit) => sum + Math.ceil(unit.byteLength / DATA_SIZE), 0);
  const availableSectors = MICRODRIVE_FORMAT.sectorCount - 2;
  if (requiredSectors > availableSectors) {
    throw new MicrodriveCapacityError(requiredSectors, availableSectors);
  }

  const fileNumbers = new Uint8Array(MICRODRIVE_FORMAT.sectorCount).fill(FREE_SECTOR);
  const recordFileNumbers = new Uint8Array(MICRODRIVE_FORMAT.sectorCount).fill(FREE_SECTOR);
  const blocks = new Uint8Array(MICRODRIVE_FORMAT.sectorCount);
  const data = Array.from({ length: MICRODRIVE_FORMAT.sectorCount }, alternatingPattern);
  fileNumbers[0] = MAP_FILE;
  recordFileNumbers[0] = 0x80;
  fileNumbers[LAST_SECTOR] = DAMAGED_SECTOR;
  recordFileNumbers[LAST_SECTOR] = DAMAGED_SECTOR;

  let sector = 1;
  units.forEach((unit, fileNumber) => {
    const blockCount = Math.ceil(unit.byteLength / DATA_SIZE);
    for (let block = 0; block < blockCount; block += 1) {
      const payload = new Uint8Array(DATA_SIZE);
      payload.set(unit.subarray(block * DATA_SIZE, (block + 1) * DATA_SIZE));
      fileNumbers[sector] = fileNumber;
      recordFileNumbers[sector] = fileNumber | (block === blockCount - 1 ? 0x80 : 0);
      blocks[sector] = block;
      data[sector] = payload;
      sector += 1;
    }
  });

  const allocationMap = new Uint8Array(DATA_SIZE);
  for (let index = 0; index < MICRODRIVE_FORMAT.sectorCount; index += 1) {
    allocationMap[index * 2] = fileNumbers[index];
    allocationMap[index * 2 + 1] = blocks[index];
  }
  allocationMap[510] = 1;
  allocationMap[511] = sector - 1;
  data[0] = allocationMap;

  const image = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  for (let physical = 0; physical < MICRODRIVE_FORMAT.sectorCount; physical += 1) {
    const declaredSector = physical;
    writeSector(
      image,
      physical,
      declaredSector,
      mediumName,
      mediumId,
      recordFileNumbers[declaredSector],
      blocks[declaredSector],
      data[declaredSector],
    );
  }
  return image;
}

export const QDOS_FILESYSTEM = Object.freeze({
  dataSize: DATA_SIZE,
  fileHeaderSize: FILE_HEADER_SIZE,
  freeSector: FREE_SECTOR,
  damagedSector: DAMAGED_SECTOR,
  mapFile: MAP_FILE,
});
