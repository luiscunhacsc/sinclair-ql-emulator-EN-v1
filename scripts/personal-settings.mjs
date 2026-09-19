import { join } from "node:path";
import { lstat, readFile, realpath, rename, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { ChatError } from "./chat-service.mjs";
import { normalizeGeminiKey, geminiKeyProblem } from "../src/ui/gemini-key.js";

function updateChatEnv(source, apiKey, freePlanConfirmed) {
  const values = { GEMINI_API_KEY: apiKey, QL_GEMINI_FREE_ONLY: freePlanConfirmed ? "confirmed" : "" };
  const found = new Set();
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  // Match whole assignments, including unrelated quoted multiline values, so
  // assignment-looking text inside another variable is never edited.
  const assignment = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\r\n]*)[^\r\n]*(\r?\n|$)/gm;
  let result = source.replace(assignment, (entry, name, ending) => {
    if (!Object.hasOwn(values, name)) return entry;
    found.add(name);
    return `${name}=${values[name]}${ending}`;
  });
  for (const [name, value] of Object.entries(values)) {
    if (found.has(name)) continue;
    if (result && !result.endsWith("\n")) result += newline;
    result += `${name}=${value}${newline}`;
  }
  // Refuse to overwrite an unusual .env that cannot be updated losslessly.
  const before = parseEnv(source);
  const after = parseEnv(result);
  const expected = { ...before, ...values };
  if (Object.keys(after).length !== Object.keys(expected).length
    || Object.entries(expected).some(([name, value]) => after[name] !== value)) {
    throw new Error("Cannot safely update environment file");
  }
  return result;
}

export function createPersonalSettings({ root, apiKey = "", freePlanConfirmed = false, locked = false } = {}) {
  let key = apiKey;
  let confirmed = freePlanConfirmed;
  let saving = false;
  return {
    get status() { return { editable: !locked, hasKey: Boolean(key), freePlanConfirmed: confirmed }; },
    async save(data) {
      if (locked) throw new ChatError("A configuração foi definida no ambiente do sistema. Remova essas variáveis e reinicie para usar este diálogo.", 409);
      if (saving) throw new ChatError("Aguarde que a configuração termine de guardar.", 409);
      if (!data || typeof data.apiKey !== "string" || typeof data.freePlanConfirmed !== "boolean"
        || (data.remove !== undefined && typeof data.remove !== "boolean")) {
        throw new ChatError("Configuração inválida.", 400);
      }
      const nextKey = data.remove ? "" : normalizeGeminiKey(data.apiKey) || key;
      const nextConfirmed = !data.remove && data.freePlanConfirmed;
      const problem = geminiKeyProblem(nextKey);
      if (problem) throw new ChatError(problem, 400);
      if (!data.remove && !nextKey) throw new ChatError("Introduza a sua chave API.", 400);
      saving = true;
      let temporary;
      try {
        // The destination is fixed on the server; clients cannot choose a path.
        const folder = await realpath(root);
        const path = join(folder, ".env");
        let source = "";
        try {
          const existing = await lstat(path);
          if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("Unsafe settings file");
          source = await readFile(path, "utf8");
        } catch (error) { if (error.code !== "ENOENT") throw error; }
        temporary = join(folder, `.env.${randomUUID()}.tmp`);
        await writeFile(temporary, updateChatEnv(source, nextKey, nextConfirmed), { mode: 0o600, flag: "wx" });
        await rename(temporary, path);
        key = nextKey;
        confirmed = nextConfirmed;
        return { apiKey: key, freePlanConfirmed: confirmed };
      } catch {
        throw new ChatError("Não foi possível atualizar o .env na raiz do projeto. Verifique as permissões da pasta e o formato do ficheiro; não use um atalho ou ligação simbólica para .env.", 503);
      } finally {
        if (temporary) await rm(temporary, { force: true }).catch(() => {});
        saving = false;
      }
    },
  };
}
