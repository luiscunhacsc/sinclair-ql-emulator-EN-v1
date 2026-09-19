import { buildMicrodriveImage, MicrodriveCapacityError } from "./microdrive-builder.js";
import { MICRODRIVE_COUNT } from "../devices/microdrive.js";
import { readZipArchive } from "./zip.js";

const QDOS_EXTRA_FIELD = 0xfb4a;
const QDOS_INLINE_MAGIC = new TextEncoder().encode("]!QDOS File Header");

function readBe32(bytes, offset) {
  return (
    (bytes[offset] * 0x1_000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

function startsWith(bytes, prefix) {
  return bytes.byteLength >= prefix.byteLength && prefix.every((byte, index) => bytes[index] === byte);
}

function parseQdosExtra(extra) {
  for (let offset = 0; offset + 4 <= extra.byteLength;) {
    const id = extra[offset] | (extra[offset + 1] << 8);
    const size = extra[offset + 2] | (extra[offset + 3] << 8);
    const start = offset + 4;
    if (start + size > extra.byteLength) break;
    // Info-ZIP SMS/QDOS: QDOS + "02\0" + one reserved byte, or the
    // older QZHD signature followed directly by the 64-byte directory entry.
    const signature = new TextDecoder().decode(extra.subarray(start, start + Math.min(size, 8)));
    let headerOffset = null;
    if (signature.startsWith("QDOS02\0") || signature === "QZHDQDOS") headerOffset = 8;
    else if (signature.startsWith("QZHD")) headerOffset = 4;
    if (id === QDOS_EXTRA_FIELD && headerOffset !== null && size >= headerOffset + 64) {
      const header = extra.subarray(start + headerOffset, start + headerOffset + 64);
      return {
        access: header[4],
        type: header[5],
        dataSpace: readBe32(header, 6),
        extraInfo: readBe32(header, 10),
        updateDate: readBe32(header, 52),
        referenceDate: readBe32(header, 56),
        backupDate: readBe32(header, 60),
      };
    }
    offset = start + size;
  }
  return {};
}

function removeInlineHeader(bytes) {
  if (!startsWith(bytes, QDOS_INLINE_MAGIC) || bytes.byteLength < 20) return { bytes, metadata: {} };
  const headerSize = bytes[19] * 2;
  if (bytes[18] !== 0 || headerSize < 30 || headerSize > bytes.byteLength) {
    throw new Error("An invalid inline QDOS header was found.");
  }
  return {
    bytes: bytes.slice(headerSize),
    metadata: {
      access: bytes[20],
      type: bytes[21],
      dataSpace: readBe32(bytes, 22),
      extraInfo: readBe32(bytes, 26),
    },
  };
}

function parseConfig(entries) {
  const configEntry = entries.find((entry) => entry.name.toLocaleLowerCase("en").endsWith(".qcf"));
  if (!configEntry) return {};
  const text = new TextDecoder().decode(configEntry.bytes);
  return Object.fromEntries(text.split(/\r?\n/u).flatMap((line) => {
    const separator = line.indexOf("=");
    return separator < 0 ? [] : [[line.slice(0, separator).trim().toLocaleLowerCase("en"), line.slice(separator + 1).trim()]];
  }));
}

function qlName(path) {
  return path.replaceAll("/", "_").replaceAll(".", "_").slice(0, 36);
}

function rewriteBootDevice(bytes, sourceDevice, microdrive) {
  if (sourceDevice.length !== 3 || (sourceDevice === "mdv" && microdrive === 1)) {
    return { bytes, replacements: 0 };
  }
  const from = new TextEncoder().encode(`${sourceDevice}1_`);
  const to = new TextEncoder().encode(`mdv${microdrive}_`);
  const rewritten = bytes.slice();
  let replacements = 0;
  for (let offset = 0; offset + from.byteLength <= bytes.byteLength; offset += 1) {
    const matches = from.every((expected, index) => {
      const actual = bytes[offset + index];
      return (actual >= 0x41 && actual <= 0x5a ? actual + 0x20 : actual) === expected;
    });
    if (!matches) continue;
    rewritten.set(to, offset);
    replacements += 1;
    offset += from.byteLength - 1;
  }
  return { bytes: rewritten, replacements };
}

/** Convert a QL-aware ZIP or QLPAK into a read-only QLAY Microdrive image. */
export async function importQlPackage(bytes, { name = "software.qlpak", microdrive = 1 } = {}) {
  if (!Number.isInteger(microdrive) || microdrive < 1 || microdrive > MICRODRIVE_COUNT) {
    throw new RangeError("The destination drive must be MDV1 or MDV2.");
  }
  const entries = await readZipArchive(bytes);
  const config = parseConfig(entries);
  const configuredRoot = (config.pakdir1 ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  const rootPrefix = configuredRoot ? `${configuredRoot}/`.toLocaleLowerCase("en") : "";
  const packageFiles = entries.filter((entry) => {
    const lower = entry.name.toLocaleLowerCase("en");
    if (lower.endsWith(".qcf")) return false;
    return !rootPrefix || lower.startsWith(rootPrefix);
  });
  if (packageFiles.length === 0) throw new Error("The package contains no files accessible to the QL.");

  const sourceDevice = (config.floppyname ?? "flp").slice(0, 3).toLocaleLowerCase("en");
  let bootReplacements = 0;
  const files = packageFiles.map((entry) => {
    const relative = rootPrefix ? entry.name.slice(configuredRoot.length + 1) : entry.name;
    const inline = removeInlineHeader(entry.bytes);
    const metadata = { ...parseQdosExtra(entry.extra), ...inline.metadata };
    let content = inline.bytes;
    const targetName = qlName(relative);
    if (targetName.toLocaleLowerCase("en") === "boot") {
      const rewritten = rewriteBootDevice(content, sourceDevice, microdrive);
      content = rewritten.bytes;
      bootReplacements += rewritten.replacements;
    }
    return { name: targetName, bytes: content, ...metadata };
  });

  // A ZIP containing just one QDOS executable has no cartridge BOOT file.
  // Add a launcher to the generated image, leaving the archive untouched.
  // Multi-file packages retain their own startup conventions.
  const generatedBoot = files.length === 1 && files[0].type === 1
    && files[0].name.toLocaleLowerCase("en") !== "boot"
    && /^[a-z0-9_]+$/iu.test(files[0].name);
  if (generatedBoot) {
    files.push({ name: "BOOT", bytes: new TextEncoder().encode(`10 EXEC_W mdv${microdrive}_${files[0].name}\n`) });
  }

  const baseName = name.replace(/\.(?:qlpak|zip)$/iu, "") || "QLPACKAGE";
  let image;
  try {
    image = buildMicrodriveImage(files, { mediumName: baseName.slice(0, 10) });
  } catch (error) {
    if (error instanceof MicrodriveCapacityError) {
      const settings = [
        config.ram && `RAM ${config.ram}`,
        config.videocard && `video ${config.videocard}`,
        config.useharddiskname?.toLocaleLowerCase("en") === "yes" && `disc ${config.harddiskname || "WIN"}`,
      ].filter(Boolean);
      if (settings.length) error.message += ` Package QCF configuration: ${settings.join("; ")}.`;
      error.message += " This emulator provides 128 KiB of RAM, QL video and Microdrives; it does not emulate SMSQ/E, Q60 video or WIN discs.";
    }
    throw error;
  }
  return { image, files, config, bootReplacements, generatedBoot };
}
