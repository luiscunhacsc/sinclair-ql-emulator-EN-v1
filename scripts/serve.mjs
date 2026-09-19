import { createChatService } from "./chat-service.mjs";
import { createLocalServer } from "./local-server.mjs";
import { loadLocalEnv } from "./local-env.mjs";
import { createPersonalSettings } from "./personal-settings.mjs";
import { fileURLToPath } from "node:url";
import { startupMessage } from "./startup-message.mjs";
import { EMULATOR_URL, openDefaultBrowser } from "./open-browser.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const autoOpenBrowser = !process.argv.includes("--no-open");
const locked = process.env.GEMINI_API_KEY !== undefined || process.env.QL_GEMINI_FREE_ONLY !== undefined;
loadLocalEnv();

const settings = createPersonalSettings({
  root, locked,
  apiKey: process.env.GEMINI_API_KEY,
  freePlanConfirmed: process.env.QL_GEMINI_FREE_ONLY === "confirmed",
});
const chatOptions = {
  stopFile: new URL("../.env.gemini-paused", import.meta.url),
};
const chat = createChatService({ ...chatOptions, apiKey: process.env.GEMINI_API_KEY,
  freePlanConfirmed: process.env.QL_GEMINI_FREE_ONLY === "confirmed" });
const server = createLocalServer({ root, chat, settings,
  makeChat: (configuration) => createChatService({ ...chatOptions, ...configuration }),
});
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Port 8080 is already in use. No second server was started.");
    console.error("If the emulator is already running, open http://localhost:8080.");
    console.error("To restart it, press Ctrl+C in its original terminal, then run npm start again.");
    console.error("If another application uses this port, close that application first.");
  } else {
    console.error(`Could not start the local server (${error.code ?? error.name}).`);
  }
  process.exitCode = 1;
});
server.listen(8080, "127.0.0.1", async () => {
  console.log(startupMessage(chat, { autoOpenBrowser }));
  if (autoOpenBrowser) {
    try { await openDefaultBrowser(); }
    catch {
      // Browser launch is a convenience; the working server must stay available.
      console.warn(`Could not open the default browser. Open ${EMULATOR_URL} manually.`);
    }
  }
});
