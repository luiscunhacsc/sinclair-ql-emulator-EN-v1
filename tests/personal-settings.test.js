import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersonalSettings } from "../scripts/personal-settings.mjs";
import { createChatService } from "../scripts/chat-service.mjs";
import { createLocalServer } from "../scripts/local-server.mjs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

const key = "fixture-personal-key-never-a-real-credential";
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "ql-personal-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "checkout");
  await mkdir(root);
  return { root, path: join(root, ".env") };
}

test("browser settings persist in the project .env, support disable/removal and never expose the key in status", async (t) => {
  const options = await fixture(t);
  const settings = createPersonalSettings(options);
  assert.deepEqual(settings.status, { editable: true, hasKey: false, freePlanConfirmed: false });
  await settings.save({ apiKey: key, freePlanConfirmed: true });
  assert.deepEqual(parseEnv(await readFile(options.path, "utf8")), { GEMINI_API_KEY: key, QL_GEMINI_FREE_ONLY: "confirmed" });
  assert.deepEqual(await readdir(options.root), [".env"], "no backup or temporary files remain");
  assert.equal(JSON.stringify(settings.status).includes(key), false);
  await settings.save({ apiKey: "", freePlanConfirmed: false });
  assert.deepEqual(parseEnv(await readFile(options.path, "utf8")), { GEMINI_API_KEY: key, QL_GEMINI_FREE_ONLY: "" });
  await settings.save({ apiKey: "", freePlanConfirmed: true, remove: true });
  assert.deepEqual(parseEnv(await readFile(options.path, "utf8")), { GEMINI_API_KEY: "", QL_GEMINI_FREE_ONLY: "" });
});

test("settings reject malformed input, environment overrides and symlinks without changing existing files", async (t) => {
  const options = await fixture(t);
  const settings = createPersonalSettings(options);
  for (const data of [null, {}, { apiKey: "", freePlanConfirmed: true }, { apiKey: key, freePlanConfirmed: "confirmed" },
    { apiKey: "gen-lang-client-123456789", freePlanConfirmed: true },
    { apiKey: key + "\nOTHER=secret", freePlanConfirmed: true }]) {
    await assert.rejects(settings.save(data), (error) => error.status === 400);
  }
  await assert.rejects(createPersonalSettings({ ...options, locked: true }).save({ apiKey: key, freePlanConfirmed: true }), (error) => error.status === 409);
  await mkdir(join(options.root, "src"));
  const target = join(options.root, "src", "private.js");
  await writeFile(target, "unchanged");
  await symlink(target, options.path);
  await assert.rejects(settings.save({ apiKey: key, freePlanConfirmed: true }), (error) => error.status === 503);
  assert.equal(await readFile(target, "utf8"), "unchanged");
});

test("updating and removing keys preserve other variables, comments and multiline values", async (t) => {
  const options = await fixture(t);
  const unrelated = '# Keep this comment\r\nPORT=8080\r\nDESCRIPTION="first line\r\nGEMINI_API_KEY=not-an-assignment\r\nlast line"\r\n';
  await writeFile(options.path, unrelated + 'export GEMINI_API_KEY="old-key" # replace this\r\nQL_GEMINI_FREE_ONLY=\r\nGEMINI_API_KEY=duplicate-old-key\r\n');
  const settings = createPersonalSettings(options);
  await settings.save({ apiKey: key, freePlanConfirmed: true });
  let source = await readFile(options.path, "utf8");
  assert.ok(source.startsWith(unrelated));
  assert.deepEqual(parseEnv(source), { PORT: "8080", DESCRIPTION: "first line\nGEMINI_API_KEY=not-an-assignment\nlast line", GEMINI_API_KEY: key, QL_GEMINI_FREE_ONLY: "confirmed" });
  await settings.save({ apiKey: "", freePlanConfirmed: false, remove: true });
  source = await readFile(options.path, "utf8");
  assert.ok(source.startsWith(unrelated));
  assert.equal(parseEnv(source).GEMINI_API_KEY, "");
  assert.equal(source.includes(key), false);
});

test("a browser save is loaded by a fresh server process and does not touch the public template", async (t) => {
  const options = await fixture(t);
  const template = "GEMINI_API_KEY=\nQL_GEMINI_FREE_ONLY=\n";
  await writeFile(join(options.root, ".env.example"), template);
  const settings = createPersonalSettings(options);
  const loader = new URL("../scripts/local-env.mjs", import.meta.url).href;
  const service = new URL("../scripts/chat-service.mjs", import.meta.url).href;
  function restartedConfiguration() {
    const env = { ...process.env };
    delete env.GEMINI_API_KEY;
    delete env.QL_GEMINI_FREE_ONLY;
    const script = `import { loadLocalEnv } from ${JSON.stringify(loader)};
      import { createChatService } from ${JSON.stringify(service)};
      loadLocalEnv(process.argv[1]);
      console.log(createChatService({ apiKey: process.env.GEMINI_API_KEY,
        freePlanConfirmed: process.env.QL_GEMINI_FREE_ONLY === "confirmed" }).enabled);`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, options.path], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  await settings.save({ apiKey: key, freePlanConfirmed: true });
  assert.equal(restartedConfiguration(), "true");
  await settings.save({ apiKey: "", freePlanConfirmed: false });
  assert.equal(restartedConfiguration(), "false");
  await settings.save({ apiKey: "", freePlanConfirmed: false, remove: true });
  assert.equal(restartedConfiguration(), "false");
  assert.equal(await readFile(join(options.root, ".env.example"), "utf8"), template);
});

test("settings endpoint enforces local authorization, updates chat without contacting Google, and never returns credentials", async (t) => {
  const options = await fixture(t);
  const settings = createPersonalSettings(options);
  const makeChat = (configuration) => createChatService({ ...configuration, fetchImpl() { assert.fail("setup must not contact Google"); } });
  const server = createLocalServer({ root: options.root, chat: makeChat({}), settings, makeChat });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(`${url}/api/chat/config`)).json();
  const request = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key, freePlanConfirmed: true }) };
  const endpoint = url + "/api/chat/settings";
  assert.equal((await fetch(endpoint, request)).status, 403);
  request.headers.Authorization = `Bearer ${config.token}`;
  assert.equal((await fetch(endpoint, { ...request, headers: { ...request.headers, Origin: "https://evil.example" } })).status, 403);
  assert.equal((await fetch(endpoint, { ...request, body: "bad json" })).status, 400);
  assert.equal((await fetch(endpoint, { ...request, body: "x".repeat(9000) })).status, 413);
  assert.equal((await fetch(endpoint, { ...request, headers: { ...request.headers, "Content-Type": "text/plain" } })).status, 415);
  const response = await fetch(endpoint, request);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const saved = await response.json();
  assert.equal(saved.enabled, true);
  assert.deepEqual(parseEnv(await readFile(options.path, "utf8")), { GEMINI_API_KEY: key, QL_GEMINI_FREE_ONLY: "confirmed" });
  assert.equal(JSON.stringify(saved).includes(key), false);
  const after = await (await fetch(`${url}/api/chat/config`)).json();
  assert.equal(after.enabled, true);
  assert.equal(JSON.stringify(after).includes(key), false);
  assert.equal((await fetch(url + "/.env")).status, 404);
  request.body = JSON.stringify({ apiKey: "", freePlanConfirmed: false });
  assert.equal((await (await fetch(endpoint, request)).json()).enabled, false);
  request.body = JSON.stringify({ apiKey: "", freePlanConfirmed: true, remove: true });
  assert.equal((await (await fetch(endpoint, request)).json()).settings.hasKey, false);
});

test("saving a key preserves the existing Gemini safety pause", async (t) => {
  const options = await fixture(t);
  const stopFile = join(options.root, ".env.gemini-paused");
  await writeFile(stopFile, "paused");
  const configuration = await createPersonalSettings(options).save({ apiKey: key, freePlanConfirmed: true });
  const chat = createChatService({ ...configuration, stopFile });
  assert.equal(chat.paused, true);
  assert.equal(chat.enabled, false);
});

test("long opaque keys with punctuation survive saving and retain their exact value for Google", async (t) => {
  const options = await fixture(t);
  const settings = createPersonalSettings(options);
  const token = "fixture.opaque/" + "a".repeat(600) + "+=";
  const configuration = await settings.save({ apiKey: '"' + token + '"', freePlanConfirmed: true });
  const saved = parseEnv(await readFile(options.path, "utf8"));
  assert.equal(saved.GEMINI_API_KEY, token);
  assert.equal(saved.QL_GEMINI_FREE_ONLY, "confirmed");
  const chat = createChatService({ ...configuration, fetchImpl: async (_url, request) => {
    assert.equal(request.headers["x-goog-api-key"], token);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Fixture reply" }] } }] });
  } });
  assert.equal(chat.enabled, true);
  assert.equal(await chat.reply("fixture-session-1234", "hello"), "Fixture reply");
  assert.equal(JSON.stringify(settings.status).includes(token), false);
});
