import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createLocalServer } from "../scripts/local-server.mjs";
import { createChatService } from "../scripts/chat-service.mjs";
import { fileURLToPath } from "node:url";

test("local host serves public assets but protects secrets and the chat endpoint", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ql-host-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "upload"));
  await mkdir(join(root, "local-software"));
  await writeFile(join(root, "local-software", "PsionChess.qlpak"), "chess example");
  await writeFile(join(root, "local-software", "chess_mk.zip"), "chess executable example");
  await writeFile(join(root, "local-software", "Spook.zip"), "spook example");
  await writeFile(join(root, "local-software", "Electric_Dreams_Melody_QL.mdv"), "music cartridge");
  await writeFile(join(root, "local-software", "SkyQL.mdv"), "planetarium cartridge");
  const officeArchives = ["qui235m.zip", "aba235m.zip", "eas235m.zip", "arc238m.zip"];
  for (const name of officeArchives) await writeFile(join(root, "local-software", name), name);
  await writeFile(join(root, "local-software", "private.zip"), "private");
  await writeFile(join(root, "index.html"), "emulator");
  await writeFile(join(root, "src", "main.js"), "// public");
  await writeFile(join(root, "upload", "secret.js"), "private");
  await writeFile(join(root, ".env"), "private");
  await writeFile(join(root, ".env.local"), "private override");
  await writeFile(join(root, ".env.gemini-paused"), "paused");
  await writeFile(join(root, ".env.example"), "public template");
  await symlink(join(root, "upload", "secret.js"), join(root, "src", "linked.js"));
  const calls = [];
  const server = createLocalServer({ root, chat: { enabled: true, async reply(...args) { calls.push(args); return "Hello!"; } } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(url)).text(), "emulator");
  assert.equal((await fetch(`${url}/src/main.js`)).status, 200);
  assert.equal(await (await fetch(`${url}/local-software/PsionChess.qlpak`)).text(), "chess example");
  const chessResponse = await fetch(`${url}/local-software/chess_mk.zip`);
  assert.equal(chessResponse.headers.get("content-type"), "application/zip");
  assert.equal(await chessResponse.text(), "chess executable example");
  assert.equal(await (await fetch(`${url}/local-software/Spook.zip`)).text(), "spook example");
  const musicResponse = await fetch(`${url}/local-software/Electric_Dreams_Melody_QL.mdv`);
  assert.equal(musicResponse.headers.get("content-type"), "application/octet-stream");
  assert.equal(await musicResponse.text(), "music cartridge");
  const skyResponse = await fetch(`${url}/local-software/SkyQL.mdv`);
  assert.equal(skyResponse.headers.get("content-type"), "application/octet-stream");
  assert.equal(await skyResponse.text(), "planetarium cartridge");
  for (const name of officeArchives) {
    const response = await fetch(`${url}/local-software/${name}`);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(await response.text(), name);
  }
  assert.equal((await fetch(`${url}/local-software/private.zip`)).status, 404);
  assert.equal((await fetch(`${url}/local-software/Spook.zip`, { headers: { Origin: "https://evil.example" } })).status, 403);
  for (const path of ["/.env", "/.env.local", "/.env.gemini-paused", "/.env.example", "/upload/secret.js", "/src/linked.js", "/.git/config", "/scripts/serve.mjs", "/src/%2e%2e/upload/secret.js"]) {
    assert.equal((await fetch(url + path)).status, 404, path);
  }
  const config = await (await fetch(`${url}/api/chat/config`)).json();
  assert.equal(config.enabled, true);
  assert.equal(config.paused, false);
  assert.equal((await fetch(`${url}/api/chat/config`, { headers: { Origin: "https://evil.example" } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    request(`${url}/api/chat/config`, { headers: { Host: "evil.example" } }, (response) => {
      response.resume(); resolve(response.statusCode);
    }).on("error", reject).end();
  });
  assert.equal(badHostStatus, 403);
  const options = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: "test-session-0001", message: "hello" }) };
  assert.equal((await fetch(`${url}/api/chat`, options)).status, 403);
  const expired = await (await fetch(`${url}/api/chat`, options)).json();
  assert.equal(expired.code, "HOST_SESSION_EXPIRED");
  assert.equal(calls.length, 0);
  options.headers.Authorization = `Bearer ${config.token}`;
  assert.deepEqual(await (await fetch(`${url}/api/chat`, options)).json(), { answer: "Hello!" });
  assert.equal(calls.length, 1);
  assert.equal((await fetch(`${url}/api/chat`, { ...options, body: "bad json" })).status, 400);
  assert.equal((await fetch(`${url}/api/chat`, { ...options, body: "x".repeat(9000) })).status, 413);
  assert.equal(calls.length, 1);
});

test("browser disconnect cancels pending provider work and leaves the server usable", { timeout: 3000 }, async (t) => {
  let started;
  let cancelled;
  const waiting = new Promise((resolve) => { started = resolve; });
  const aborted = new Promise((resolve) => { cancelled = resolve; });
  const server = createLocalServer({ root: process.cwd(), chat: { enabled: true,
    reply(id, prompt, { signal }) {
      started();
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => {
        cancelled();
        reject(new Error("client disconnected"));
      }, { once: true }));
    },
  } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(`${url}/api/chat/config`)).json();
  const controller = new AbortController();
  const pending = fetch(`${url}/api/chat`, { method: "POST", signal: controller.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ session: "test-session-0001", message: "hello" }),
  });
  await waiting;
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  await rejected;
  await aborted;
  assert.equal((await fetch(`${url}/api/chat/config`)).status, 200);
});

test("legal notices and corresponding Minerva source are available without exposing private files", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  let providerCalls = 0;
  const chat = createChatService({ apiKey: "test-only-placeholder", freePlanConfirmed: true,
    async fetchImpl() {
      providerCalls++;
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Hello QL!" }] } }] });
    },
  });
  const server = createLocalServer({ root, chat });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["legal.html", "LICENSE", "COPYRIGHT.md", "THIRD_PARTY_NOTICES.md", "PRIVACY.md",
    "docs/LEGAL_REVIEW.md", "assets/PROVENANCE.md", "third_party/minerva/COPYRIGHT",
    "third_party/minerva/SOURCE.md", "third_party/m68000-single-step/LICENSE",
    "third_party/m68000-single-step/SOURCE.md", "legal/asset-provenance.json"]) {
    const response = await fetch(`${url}/${path}`);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 0, path);
    const head = await fetch(`${url}/${path}`, { method: "HEAD" });
    assert.equal(head.status, 200, path);
    assert.equal(await head.text(), "");
  }
  const archive = await fetch(`${url}/third_party/minerva/minerva-source-29e5365.tar.gz`);
  assert.equal(archive.status, 200);
  assert.equal(archive.headers.get("content-type"), "application/gzip");
  assert.deepEqual([...new Uint8Array(await archive.arrayBuffer()).slice(0, 2)], [0x1f, 0x8b]);
  for (const path of [".env", ".env.local", "scripts/chat-service.mjs", "third_party/private.txt", "legal/private.json"]) {
    assert.equal((await fetch(`${url}/${path}`)).status, 404, path);
  }
  const config = await (await fetch(`${url}/api/chat/config`)).json();
  assert.equal(config.enabled, true);
  assert.equal(providerCalls, 0);
  const response = await fetch(`${url}/api/chat`, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ session: "test-session-0001", message: "hello" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "Hello QL!" });
  assert.equal(providerCalls, 1);
});
