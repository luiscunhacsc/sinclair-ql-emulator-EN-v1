import { normalizeGeminiKey, geminiKeyProblem } from "./gemini-key.js";

const WELCOME_KEY = "sinclair-ql-welcome-seen";

export function initializeGeminiSetup({ onSaved = () => {} } = {}) {
  const dialog = document.querySelector("#gemini-setup");
  const form = document.querySelector("#gemini-setup-form");
  const fields = document.querySelector("#gemini-setup-fields");
  const key = document.querySelector("#gemini-api-key");
  const confirmation = document.querySelector("#gemini-free-only");
  const status = document.querySelector("#gemini-setup-status");
  const remove = document.querySelector("#gemini-remove-key");
  const aiStudio = document.querySelector("#gemini-ai-studio");
  aiStudio.addEventListener("click", (event) => {
    // Preserve modifier-click navigation; ordinary clicks request a separate
    // window while leaving the emulator and its in-progress form untouched.
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    try {
      window.open(aiStudio.href, "_blank", "popup=yes,width=1000,height=760,noopener,noreferrer");
      event.preventDefault();
    } catch {
      // Retain the native target=_blank link if opening a window is unsupported.
    }
  });
  let token = null;
  let busy = false;
  const local = location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(location.hostname);

  function applySettings(config) {
    fields.disabled = !config.settings?.editable;
    confirmation.checked = Boolean(config.settings?.freePlanConfirmed);
    key.required = !config.settings?.hasKey;
    key.placeholder = config.settings?.hasKey ? "Key saved · leave blank to keep it" : "Paste the API key, not the project ID";
    remove.hidden = !config.settings?.hasKey;
    status.textContent = !config.settings?.editable
      ? "Settings are managed by the server environment. Remove the system variables and restart to configure them here."
      : config.paused ? "Gemini is suspended. Saving does not remove the suspension; see the README."
      : config.enabled ? "Gemini configured. You can continue and open QL Chat whenever you like."
      : config.settings?.hasKey ? "Key saved. Gemini stays disabled until you confirm the Free plan."
      : "Setup is optional. You can continue to the emulator now.";
  }

  async function open() {
    key.value = "";
    key.removeAttribute("aria-invalid");
    confirmation.checked = false;
    fields.disabled = true;
    token = null;
    dialog.showModal();
    status.textContent = "Checking local settings…";
    try {
      if (!local) throw new Error();
      const response = await fetch("/api/chat/config", { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.settings || typeof config.token !== "string") throw new Error();
      token = config.token;
      applySettings(config);
    } catch {
      status.textContent = "To save a key only on your computer, run npm start in your copy of the project and open http://localhost:8080. Here you can continue using the emulator and local demo.";
    }
  }

  async function save(removing = false) {
    if (!token || busy || !local) return;
    const apiKey = removing ? "" : normalizeGeminiKey(key.value);
    const problem = geminiKeyProblem(apiKey);
    if (problem) {
      status.textContent = problem;
      key.setAttribute("aria-invalid", "true");
      key.focus();
      return;
    }
    key.removeAttribute("aria-invalid");
    busy = true;
    fields.disabled = true;
    status.textContent = "Saving to .env in the project root…";
    try {
      const response = await fetch("/api/chat/settings", {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey, freePlanConfirmed: confirmation.checked, remove: removing }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save. Reopen this dialogue and try again.");
      key.value = "";
      applySettings(result);
      if (removing) status.textContent = "Key removed from the project’s .env. Gemini disabled.";
      else if (!result.paused) status.textContent = result.enabled
        ? "Key and confirmation saved in .env alongside package.json. Gemini is ready in QL Chat — no restart needed."
        : "Saved in .env alongside package.json. Gemini stays disabled until you confirm the Free plan.";
      onSaved();
    } catch (error) {
      fields.disabled = false;
      status.textContent = error.name === "TimeoutError" || error instanceof TypeError
        ? "Could not confirm the save. Reopen settings to check; no automatic retry will be made."
        : error.message;
    } finally { busy = false; }
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); void save(); });
  key.addEventListener("input", () => key.removeAttribute("aria-invalid"));
  remove.addEventListener("click", () => void save(true));
  document.querySelector("#gemini-continue").addEventListener("click", () => { if (!busy) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => {
    key.value = "";
    try { localStorage.setItem(WELCOME_KEY, "yes"); } catch { /* Optional preference only. */ }
  });
  for (const button of document.querySelectorAll("[data-open-gemini]")) button.addEventListener("click", () => void open());
  let seen = false;
  try { seen = localStorage.getItem(WELCOME_KEY) === "yes"; } catch { /* Show the welcome if storage is unavailable. */ }
  if (!seen) void open();
}
