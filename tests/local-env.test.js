import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const loader = new URL("../scripts/local-env.mjs", import.meta.url).href;
const service = new URL("../scripts/chat-service.mjs", import.meta.url).href;
function configuration(path, overrides = {}) {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  delete env.QL_GEMINI_FREE_ONLY;
  Object.assign(env, overrides);
  const script = `
    import { loadLocalEnv } from ${JSON.stringify(loader)};
    import { createChatService } from ${JSON.stringify(service)};
    loadLocalEnv(process.argv[1]);
    const key = process.env.GEMINI_API_KEY;
    const confirmation = process.env.QL_GEMINI_FREE_ONLY;
    const chat = createChatService({ apiKey: key, freePlanConfirmed: confirmation === "confirmed" });
    console.log(JSON.stringify({ enabled: chat.enabled, key, confirmation }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, path], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("missing .env and the unedited public template leave Gemini disabled", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ql-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, ".env");
  assert.deepEqual(configuration(path), { enabled: false });
  assert.deepEqual(configuration(path, { GROQ_API_KEY: "old-provider-key", QL_GROQ_FREE_ONLY: "confirmed" }), { enabled: false });
  await writeFile(path, await readFile(new URL("../.env.example", import.meta.url)));
  assert.deepEqual(configuration(path), { enabled: false, key: "", confirmation: "" });
});

test("local .env configures chat while existing host variables take precedence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ql-env-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, ".env");
  await writeFile(path, '# local settings\r\nGEMINI_API_KEY="fixture-key"\r\nQL_GEMINI_FREE_ONLY=confirmed\r\n');
  assert.deepEqual(configuration(path), { enabled: true, key: "fixture-key", confirmation: "confirmed" });
  assert.deepEqual(configuration(path, { GEMINI_API_KEY: "host-key", QL_GEMINI_FREE_ONLY: "" }), {
    enabled: false, key: "host-key", confirmation: "",
  });
});
