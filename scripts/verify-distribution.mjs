import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const files = {
  rom: new URL("../roms/minerva/minerva-1.98a1.bin", import.meta.url),
  source: new URL(
    "../third_party/minerva/minerva-source-29e5365.tar.gz",
    import.meta.url,
  ),
  copyright: new URL("../third_party/minerva/COPYRIGHT", import.meta.url),
  license: new URL("../LICENSE", import.meta.url),
  singleStepFixture: new URL("../tests/fixtures/m68000-v1.json", import.meta.url),
  singleStepLicense: new URL(
    "../third_party/m68000-single-step/LICENSE",
    import.meta.url,
  ),
  singleStepSource: new URL(
    "../third_party/m68000-single-step/SOURCE.md",
    import.meta.url,
  ),
};

const expected = {
  romSize: 49_152,
  romSha256:
    "bc954b7b5fb12b1ed98cc54d8cf13f425d97b79997e9bc967a8715f1ccbf5555",
  sourceSha256:
    "895de8f2c016db9331bfe4b8fb12ac846afd96effb014b56cacf0d112b084389",
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function tarEntry(archive, wantedPath) {
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const name = archive
      .subarray(offset, offset + 100)
      .toString("utf8")
      .replace(/\0.*$/u, "");
    if (!name) break;

    const sizeText = archive
      .subarray(offset + 124, offset + 136)
      .toString("ascii")
      .replace(/\0.*$/u, "")
      .trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const dataStart = offset + 512;

    if (name === wantedPath) {
      return archive.subarray(dataStart, dataStart + size);
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  throw new Error(`As fontes Minerva não contêm ${wantedPath}.`);
}

const romStat = await stat(files.rom);
if (romStat.size !== expected.romSize) {
  throw new Error(
    `ROM Minerva: esperados ${expected.romSize} bytes, obtidos ${romStat.size}.`,
  );
}

const rom = await readFile(files.rom);
const source = await readFile(files.source);
for (const [name, bytes, hash] of [
  ["ROM Minerva", rom, expected.romSha256],
  ["fontes Minerva", source, expected.sourceSha256],
]) {
  const actual = sha256(bytes);
  if (actual !== hash) {
    throw new Error(`${name}: SHA-256 inesperado ${actual}.`);
  }
}

const sourceTar = gunzipSync(source);
const sourcePrefix = "minerva-source-29e5365/";
const upstreamRom = tarEntry(sourceTar, `${sourcePrefix}ROM/1.98a1.bin`);
const upstreamLicense = tarEntry(sourceTar, `${sourcePrefix}LICENSE`).toString("utf8");
tarEntry(sourceTar, `${sourcePrefix}ROM/link`);
tarEntry(sourceTar, `${sourcePrefix}make.bas`);

if (!rom.subarray(0, upstreamRom.length).equals(upstreamRom)) {
  throw new Error("A ROM distribuída não corresponde ao binário das fontes fixadas.");
}
if (!rom.subarray(upstreamRom.length).every((byte) => byte === 0)) {
  throw new Error("O preenchimento da ROM Minerva não contém apenas bytes nulos.");
}
if (!upstreamLicense.includes("GNU GENERAL PUBLIC LICENSE")) {
  throw new Error("O arquivo de fontes Minerva não preserva a sua licença.");
}

const copyright = await readFile(files.copyright, "utf8");
if (!copyright.includes("Laurence Reeves") || !copyright.includes("either version 2")) {
  throw new Error("O aviso de copyright/licença da Minerva está incompleto.");
}

const license = await readFile(files.license, "utf8");
if (!license.includes("GNU GENERAL PUBLIC LICENSE") || !license.includes("Version 2")) {
  throw new Error("O ficheiro LICENSE não contém a GNU GPL versão 2.");
}

const singleStepFixture = JSON.parse(await readFile(files.singleStepFixture, "utf8"));
if (
  singleStepFixture.commit !== "64b253116a3de04aaac4346c43680960dc9b67e5" ||
  singleStepFixture.tests?.length !== 56
) {
  throw new Error("A amostra SingleStepTests não corresponde à versão fixada.");
}
const singleStepLicense = await readFile(files.singleStepLicense, "utf8");
if (
  !singleStepLicense.includes("MIT License") ||
  !singleStepLicense.includes("Copyright (c) 2024 SingleStepTests")
) {
  throw new Error("A licença da amostra SingleStepTests está incompleta.");
}
const singleStepSource = await readFile(files.singleStepSource, "utf8");
if (!singleStepSource.includes(singleStepFixture.commit)) {
  throw new Error("A proveniência da amostra SingleStepTests está incompleta.");
}

console.log(
  "Integridade verificada: Minerva GPL e amostra SingleStepTests MIT. Para pendências de publicação: npm run audit:legal.",
);
