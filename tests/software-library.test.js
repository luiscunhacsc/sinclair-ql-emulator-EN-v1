import assert from "node:assert/strict";
import test from "node:test";
import {
  formatFileSize,
  MICRODRIVE_COUNT,
  microdriveName,
  microdriveActionBlockReason,
  softwareFileKey,
  softwareFormat,
  supportedSoftwareFiles,
} from "../src/ui/software-library.js";

test("reconhece apenas os três formatos de software suportados", () => {
  assert.equal(softwareFormat("jogo.MDV"), "Microdrive");
  assert.equal(softwareFormat("jogo.qlpak"), "QLPAK");
  assert.equal(softwareFormat("arquivo.ZIP"), "ZIP QDOS");
  assert.equal(softwareFormat("manual.txt"), null);
  assert.equal(softwareFormat("sem-extensao"), null);
});

test("filtra e ordena ficheiros escolhidos numa pasta", () => {
  const files = [
    { name: "Jogo10.qlpak", size: 10, webkitRelativePath: "QL/Jogo10.qlpak" },
    { name: "notas.txt", size: 20, webkitRelativePath: "QL/notas.txt" },
    { name: "Jogo2.mDV", size: 30, webkitRelativePath: "QL/Jogo2.mDV" },
  ];
  assert.deepEqual(
    supportedSoftwareFiles(files).map((file) => file.name),
    ["Jogo2.mDV", "Jogo10.qlpak"],
  );
});

test("distingue ficheiros homónimos em pastas diferentes", () => {
  const left = { name: "boot.zip", size: 42, lastModified: 7, webkitRelativePath: "A/boot.zip" };
  const right = { ...left, webkitRelativePath: "B/boot.zip" };
  assert.notEqual(softwareFileKey(left), softwareFileKey(right));
});

test("apresenta tamanhos legíveis e valida apenas MDV1 e MDV2", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.match(formatFileSize(1536), /1[,.]5 KB/u);
  assert.equal(microdriveName(1), "MDV1");
  assert.equal(MICRODRIVE_COUNT, 2);
  assert.equal(microdriveName(MICRODRIVE_COUNT), "MDV2");
  assert.throws(() => microdriveName(0), /MDV1.*MDV2/u);
  assert.throws(() => microdriveName(3), /MDV1.*MDV2/u);
});

test("permite inserir e criar na unidade vazia enquanto a outra está em uso", () => {
  for (const slot of [1, 2]) {
    const selection = slot === 1 ? 2 : 1;
    for (const action of ["mount", "new"]) {
      assert.equal(microdriveActionBlockReason({ slot, action, mounted: null, selection }), "");
      assert.notEqual(microdriveActionBlockReason({ slot, action, mounted: {}, selection }), "");
      assert.notEqual(microdriveActionBlockReason({ slot, action, mounted: null, selection: 1 << (slot - 1) }), "");
    }
  }
});

test("não interrompe cartuchos existentes, exportações ou reinícios durante operações", () => {
  for (const action of ["save", "eject", "protection", "boot"]) {
    assert.notEqual(microdriveActionBlockReason({ slot: 2, action, mounted: {}, selection: 1 }), "");
    assert.equal(microdriveActionBlockReason({ slot: 2, action, mounted: {}, selection: 0 }), "");
  }
});
