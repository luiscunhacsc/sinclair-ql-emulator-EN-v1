import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

const mime = new Map([[".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".png", "image/png"], [".svg", "image/svg+xml"], [".bin", "application/octet-stream"]]);

// Explicit legal downloads; never expose whole directories containing secrets.
const legalFiles = new Map([
  ["legal.html", "text/html; charset=utf-8"],
  ...["LICENSE", "COPYRIGHT.md", "THIRD_PARTY_NOTICES.md", "PRIVACY.md", "docs/LEGAL_REVIEW.md",
    "third_party/minerva/COPYRIGHT", "third_party/minerva/SOURCE.md",
    "third_party/m68000-single-step/LICENSE", "third_party/m68000-single-step/SOURCE.md",
    "assets/PROVENANCE.md"].map((path) => [path, "text/plain; charset=utf-8"]),
  ["third_party/minerva/minerva-source-29e5365.tar.gz", "application/gzip"],
  ["legal/asset-provenance.json", "application/json; charset=utf-8"],
  ["legal/publication-review.json", "application/json; charset=utf-8"],
]);

// Serve only the bundled library archives, never the rest of this folder.
const exampleFiles = new Map([
  ["local-software/SkyQL.mdv", "application/octet-stream"],
  ["local-software/PsionChess.qlpak", "application/octet-stream"],
  ["local-software/chess_mk.zip", "application/zip"],
  ["local-software/Spook.zip", "application/zip"],
  ["local-software/qui235m.zip", "application/zip"],
  ["local-software/aba235m.zip", "application/zip"],
  ["local-software/eas235m.zip", "application/zip"],
  ["local-software/arc238m.zip", "application/zip"],
  ["local-software/Electric_Dreams_Melody_QL.mdv", "application/octet-stream"],
]);

export function createLocalServer({ root, chat, settings = null, makeChat }) {
  const token = randomBytes(32).toString("hex");
  const json = (res, status, body) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    const port = server.address().port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
      || !hosts.includes(req.headers.host)
      || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
      || req.headers["sec-fetch-site"] === "cross-site") {
      json(res, 403, { error: "Local, same-origin access required." }); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (pathname === "/api/chat/config" && req.method === "GET") {
        json(res, 200, { enabled: chat.enabled, paused: Boolean(chat.paused), token, settings: settings?.status ?? null }); return;
      }
      if (["/api/chat", "/api/chat/settings"].includes(pathname) && req.method === "POST") {
        const authorization = Buffer.from(req.headers.authorization ?? "");
        const expected = Buffer.from(`Bearer ${token}`);
        if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
          json(res, 403, { error: "Reopen QL Chat to reconnect to the local server.", code: "HOST_SESSION_EXPIRED" }); return;
        }
        if (req.headers["content-type"] !== "application/json") {
          json(res, 415, { error: "JSON required." }); return;
        }
        let length = 0;
        const chunks = [];
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 8192) { json(res, 413, { error: "Message too large." }); return; }
          chunks.push(chunk);
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { json(res, 400, { error: "Invalid JSON." }); return; }
        if (pathname === "/api/chat/settings") {
          if (!settings || !makeChat) { json(res, 404, { error: "Personal settings unavailable." }); return; }
          try {
            const configuration = await settings.save(data);
            chat = makeChat(configuration);
            json(res, 200, { enabled: chat.enabled, paused: Boolean(chat.paused), settings: settings.status });
          } catch (error) {
            json(res, error.status ?? 503, { error: error.status ? error.message : "Could not save personal settings." });
          }
          return;
        }
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        try {
          const answer = await chat.reply(data?.session, data?.message, { signal: controller.signal });
          json(res, 200, { answer });
        } catch (error) {
          json(res, error.status ?? 503, { error: error.status ? error.message : "Host unavailable." });
        }
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") { json(res, 405, { error: "Method not allowed." }); return; }
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      // A deny-list is insufficient: uploads, .git and host secrets live nearby.
      const allowed = legalFiles.has(relative) || exampleFiles.has(relative) || relative === "index.html" || relative.startsWith("src/")
        || relative.startsWith("assets/") || relative === "roms/minerva/minerva-1.98a1.bin";
      const contentType = legalFiles.get(relative) ?? exampleFiles.get(relative) ?? mime.get(extname(relative));
      if (!allowed || relative.split("/").some((part) => part.startsWith(".")) || !contentType) {
        json(res, 404, { error: "Not found." }); return;
      }
      const realRoot = await realpath(root);
      const path = await realpath(resolve(realRoot, relative));
      if (path !== resolve(realRoot, relative) || !path.startsWith(`${realRoot}${sep}`) || !(await stat(path)).isFile()) {
        json(res, 404, { error: "Not found." }); return;
      }
      res.writeHead(200, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" });
      if (req.method === "HEAD") res.end();
      else createReadStream(path).on("error", () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) json(res, 404, { error: "Not found." });
      else res.destroy();
    }
  });
  return server;
}
