import test from "node:test";
import assert from "node:assert/strict";
import { loadSoftwareExamples } from "../src/ui/software-examples.js";
import { softwareFileKey } from "../src/ui/software-library.js";

test("example files keep their exact bytes, titles, caveat and stable library identities", async () => {
  const fetchImpl = async () => new Response(new Uint8Array([0, 255, 2, 3]));
  const files = await loadSoftwareExamples(fetchImpl);
  assert.deepEqual(files.map((file) => file.displayName), ["SkyQL", "Psion Quill", "Psion Abacus", "Psion Easel", "Psion Archive", "Psion Chess", "Spook", "Electric Dreams"]);
  assert.deepEqual(files.map((file) => file.name), ["SkyQL.mdv", "qui235m.zip", "aba235m.zip", "eas235m.zip", "arc238m.zip", "chess_mk.zip", "Spook.zip", "Electric_Dreams_Melody_QL.mdv"]);
  assert.match(files.find((file) => file.displayName === "Psion Chess").notice, /sem cartucho mestre/);
  assert.equal(files.find((file) => file.displayName === "Spook").notice, undefined);
  assert.deepEqual([...new Uint8Array(await files[0].arrayBuffer())], [0, 255, 2, 3]);
  assert.equal(softwareFileKey(files[0]), softwareFileKey((await loadSoftwareExamples(fetchImpl))[0]));
});

test("a missing local example does not prevent other software from loading", async () => {
  const files = await loadSoftwareExamples(async (url) => url.endsWith("Spook.zip") ? new Response("zip") : new Response(null, { status: 404 }));
  assert.equal(files[0], null);
  assert.equal(files.filter(Boolean).length, 1);
  assert.equal(files.find(Boolean).name, "Spook.zip");
});
