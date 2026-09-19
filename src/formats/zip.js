const EOCD_SIGNATURE = 0x0605_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;
const LOCAL_SIGNATURE = 0x0403_4b50;
const MAX_COMMENT_SIZE = 65_535;
const MAX_ENTRIES = 512;
const MAX_UNCOMPRESSED_SIZE = 16 * 1024 * 1024;

function viewOf(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("The ZIP archive must be supplied as a Uint8Array.");
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function decodeName(bytes, utf8) {
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) {
    throw new Error("The ZIP contains non-ASCII names without a UTF-8 flag.");
  }
  return new TextDecoder("utf-8", { fatal: utf8 }).decode(bytes);
}

function normalisePath(name) {
  const path = name.replaceAll("\\", "/");
  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`The ZIP contains an unsafe path: ${name}.`);
  }
  return path;
}

function findEndOfCentralDirectory(bytes, view) {
  const minimum = Math.max(0, bytes.byteLength - MAX_COMMENT_SIZE - 22);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (
      view.getUint32(offset, true) === EOCD_SIGNATURE
      && offset + 22 + view.getUint16(offset + 20, true) === bytes.byteLength
    ) return offset;
  }
  throw new Error("No valid ZIP directory was found.");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not support the decompression required for this ZIP.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function crc32(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

async function unpackEntry(bytes, view, entry) {
  const offset = entry.localOffset;
  if (offset + 30 > bytes.byteLength || view.getUint32(offset, true) !== LOCAL_SIGNATURE) {
    throw new Error(`The entry ${entry.name} points to an invalid ZIP header.`);
  }

  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.byteLength) throw new Error(`The entry ${entry.name} is truncated.`);

  const compressed = bytes.slice(dataStart, dataEnd);
  let content;
  if (entry.method === 0) content = compressed;
  else if (entry.method === 8) content = await inflateRaw(compressed);
  else throw new Error(`ZIP compression method ${entry.method} is not supported.`);

  if (content.byteLength !== entry.uncompressedSize || crc32(content) !== entry.crc) {
    throw new Error(`The integrity check failed for ${entry.name}.`);
  }
  return {
    bytes: content,
    extra: bytes.slice(offset + 30 + nameLength, dataStart),
  };
}

function completeExtraFields(bytes) {
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const end = offset + 4 + bytes[offset + 2] + (bytes[offset + 3] << 8);
    if (end > bytes.length) break;
    offset = end;
  }
  return bytes.subarray(0, offset);
}

function concatenate(left, right) {
  // A truncated field must never consume bytes from the other ZIP header.
  left = completeExtraFields(left);
  right = completeExtraFields(right);
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
}

/** Read the safe, non-encrypted subset of ZIP used by QDOS archives and QLPAK files. */
export async function readZipArchive(bytes) {
  const view = viewOf(bytes);
  if (bytes.byteLength < 22) throw new Error("The file is too small to be a ZIP.");

  const eocd = findEndOfCentralDirectory(bytes, view);
  const disk = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Multi-volume ZIP archives are not supported.");
  }
  if (entryCount > MAX_ENTRIES) throw new Error("The ZIP contains too many entries.");
  if (directoryOffset + directorySize > eocd) throw new Error("The ZIP directory is truncated.");

  const metadata = [];
  let offset = directoryOffset;
  let totalSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error("The ZIP central directory is invalid.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;

    if (flags & 1) throw new Error("Encrypted ZIP archives are not supported.");
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffff_ffff)) {
      throw new Error("The ZIP64 format is not supported.");
    }
    if (end > bytes.byteLength) throw new Error("The ZIP central directory is truncated.");
    totalSize += uncompressedSize;
    if (totalSize > MAX_UNCOMPRESSED_SIZE) throw new Error("The decompressed contents are too large.");

    const nameStart = offset + 46;
    const name = normalisePath(decodeName(bytes.slice(nameStart, nameStart + nameLength), flags & 0x800));
    const extra = bytes.slice(nameStart + nameLength, nameStart + nameLength + extraLength);
    metadata.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset, extra });
    offset = end;
  }

  const entries = [];
  for (const entry of metadata) {
    if (entry.name.endsWith("/")) continue;
    const unpacked = await unpackEntry(bytes, view, entry);
    entries.push({
      name: entry.name,
      extra: concatenate(entry.extra, unpacked.extra),
      bytes: unpacked.bytes,
    });
  }
  return entries;
}

export const ZIP_LIMITS = Object.freeze({
  maxEntries: MAX_ENTRIES,
  maxUncompressedSize: MAX_UNCOMPRESSED_SIZE,
});
