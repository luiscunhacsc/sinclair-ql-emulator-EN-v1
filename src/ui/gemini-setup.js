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
    key.placeholder = config.settings?.hasKey ? "Chave guardada · deixe vazio para manter" : "Cole a chave API, não o ID do projeto";
    remove.hidden = !config.settings?.hasKey;
    status.textContent = !config.settings?.editable
      ? "As definições são geridas pelo ambiente do servidor. Remova as variáveis do sistema e reinicie para configurar aqui."
      : config.paused ? "Gemini está suspenso. Guardar não remove a suspensão; consulte o README."
      : config.enabled ? "Gemini configurado. Pode continuar e abrir QL Chat quando quiser."
      : config.settings?.hasKey ? "Chave guardada. Gemini fica desligado enquanto não confirmar o plano Free."
      : "A configuração é opcional. Pode continuar já para o emulador.";
  }

  async function open() {
    key.value = "";
    key.removeAttribute("aria-invalid");
    confirmation.checked = false;
    fields.disabled = true;
    token = null;
    dialog.showModal();
    status.textContent = "A verificar as definições locais…";
    try {
      if (!local) throw new Error();
      const response = await fetch("/api/chat/config", { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (!config.settings || typeof config.token !== "string") throw new Error();
      token = config.token;
      applySettings(config);
    } catch {
      status.textContent = "Para guardar uma chave só no seu computador, execute npm start na sua cópia do projeto e abra http://localhost:8080. Aqui pode continuar a usar o emulador e a demonstração local.";
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
    status.textContent = "A guardar no .env na raiz do projeto…";
    try {
      const response = await fetch("/api/chat/settings", {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey, freePlanConfirmed: confirmation.checked, remove: removing }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível guardar. Abra novamente este diálogo e tente de novo.");
      key.value = "";
      applySettings(result);
      if (removing) status.textContent = "Chave removida do .env do projeto. Gemini desligado.";
      else if (!result.paused) status.textContent = result.enabled
        ? "Chave e confirmação guardadas no .env junto de package.json. Gemini está pronto em QL Chat — não precisa de reiniciar."
        : "Guardado no .env junto de package.json. Gemini permanece desligado até confirmar o plano Free.";
      onSaved();
    } catch (error) {
      fields.disabled = false;
      status.textContent = error.name === "TimeoutError" || error instanceof TypeError
        ? "Não foi possível confirmar a gravação. Reabra as definições para verificar; nenhuma tentativa automática será feita."
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
