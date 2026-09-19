const SECTOR_COUNT = 255;
export const MICRODRIVE_COUNT = 2;
const SECTOR_SIZE = 686;
const HEADER_PREAMBLE_SIZE = 12;
const HEADER_SIZE = 16;
const DATA_PREAMBLE_SIZE = 12;
const RECORD_SIZE = 612;
const IMAGE_SIZE = SECTOR_COUNT * SECTOR_SIZE;

/**
 * QLAY-compatible Microdrive image with optional write support.
 *
 * Each of the 255 sectors contains a 12-byte header preamble, a 16-byte
 * sector header, a 12-byte data preamble, a 612-byte QDOS record and 34
 * trailing bytes. The ZX8302 exposes the header and record, not the preambles.
 */
export class MicrodriveImage {
  #bytes;

  constructor(
    bytes,
    {
      name = "cartucho.mdv",
      writeProtected = true,
      physicalSectorCount = SECTOR_COUNT,
      spliceSector = null,
    } = {},
  ) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError("The Microdrive image must be supplied as a Uint8Array.");
    }
    if (bytes.byteLength !== IMAGE_SIZE) {
      throw new RangeError(`An .mdv image must be exactly ${IMAGE_SIZE} bytes.`);
    }
    if (
      !Number.isInteger(physicalSectorCount)
      || physicalSectorCount < 1
      || physicalSectorCount > SECTOR_COUNT
    ) {
      throw new RangeError(`The physical track must contain between 1 and ${SECTOR_COUNT} sectors.`);
    }
    if (
      spliceSector !== null
      && (!Number.isInteger(spliceSector) || spliceSector < 0 || spliceSector >= physicalSectorCount)
    ) {
      throw new RangeError("The splice must be within the cartridge’s physical track.");
    }

    this.#bytes = bytes.slice();
    this.name = String(name);
    this.writeProtected = Boolean(writeProtected);
    this.physicalSectorCount = physicalSectorCount;
    this.spliceSector = spliceSector;
    this.dirty = false;
  }

  readHeaderByte(sector, offset) {
    this.validatePosition(sector, offset, HEADER_SIZE, "header");
    if (sector === this.spliceSector) return 0;
    return this.#bytes[sector * SECTOR_SIZE + HEADER_PREAMBLE_SIZE + offset];
  }

  readRecordByte(sector, offset) {
    this.validatePosition(sector, offset, RECORD_SIZE, "registo");
    if (sector === this.spliceSector) return 0;
    const recordStart = HEADER_PREAMBLE_SIZE + HEADER_SIZE + DATA_PREAMBLE_SIZE;
    return this.#bytes[sector * SECTOR_SIZE + recordStart + offset];
  }

  writePhysicalByte(sector, offset, value) {
    this.validatePosition(sector, offset, SECTOR_SIZE, "setor");
    if (this.writeProtected) return false;
    if (sector !== this.spliceSector) this.#bytes[sector * SECTOR_SIZE + offset] = value & 0xff;
    this.dirty = true;
    return true;
  }

  prepareFormat() {
    if (this.writeProtected) return;
    // A full tape rewrite must include a splice, even for imported images.
    // Minerva rejects a perfect 255-sector loop as an out-of-speed cartridge.
    // Do this only when the controller starts writing a new sector header;
    // mounting and ordinary file writes must preserve all existing sectors.
    this.physicalSectorCount = SECTOR_COUNT - 1;
    this.spliceSector = Math.floor(this.physicalSectorCount / 2);
    this.#bytes.fill(0, this.spliceSector * SECTOR_SIZE, (this.spliceSector + 1) * SECTOR_SIZE);
    this.#bytes.fill(0, this.physicalSectorCount * SECTOR_SIZE);
    this.dirty = true;
  }

  toUint8Array() {
    return this.#bytes.slice();
  }

  markClean() {
    this.dirty = false;
  }

  validatePosition(sector, offset, length, region) {
    if (!Number.isInteger(sector) || sector < 0 || sector >= SECTOR_COUNT) {
      throw new RangeError("The Microdrive sector must be between 0 and 254.");
    }
    if (!Number.isInteger(offset) || offset < 0 || offset >= length) {
      throw new RangeError(`The position in the ${region} is out of bounds.`);
    }
  }
}

export const MICRODRIVE_FORMAT = Object.freeze({
  sectorCount: SECTOR_COUNT,
  sectorSize: SECTOR_SIZE,
  headerPreambleSize: HEADER_PREAMBLE_SIZE,
  headerSize: HEADER_SIZE,
  dataPreambleSize: DATA_PREAMBLE_SIZE,
  recordSize: RECORD_SIZE,
  imageSize: IMAGE_SIZE,
});
