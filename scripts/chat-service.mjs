import { readFileSync, writeFileSync } from "node:fs";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export class ChatError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

export function createChatService({
  apiKey = "", freePlanConfirmed = false, stopFile = null, fetchImpl = fetch, now = Date.now, timeoutMs = 45_000,
} = {}) {
  const sessions = new Map();
  let blocked = false;
  if (stopFile) {
    try { readFileSync(stopFile); blocked = true; }
    catch (error) { if (error.code !== "ENOENT") blocked = true; }
  }
  const configured = Boolean(apiKey.trim() && !apiKey.trim().startsWith("gen-lang-client-") && freePlanConfirmed);
  let day = "";
  let count = 0;
  let nextRequestAt = 0;
  let busy = false;
  return {
    get enabled() { return configured && !blocked; },
    get paused() { return blocked; },
    async reply(id, prompt, { signal } = {}) {
      if (!configured) throw new ChatError('Gemini disabled. In your browser, open QL Chat and select "Configurar a minha chave Gemini". Enter your own API key, not the project ID (such as gen-lang-client-...). Confirm that its project is Free with billing disabled, then choose "Guardar neste computador". You can also keep using the emulator without Gemini.');
      if (typeof id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(id)
        || typeof prompt !== "string" || !prompt.trim() || prompt.length > 1024) {
        throw new ChatError("Invalid message (maximum 1024 characters).", 400);
      }
      if (prompt === "/new") { sessions.delete(id); return "New conversation. Ready."; }
      if (blocked) throw new ChatError("Gemini paused on this host. Check the Free quota and disabled billing; see README to unlock manually.", 429);
      const stamp = new Date(now()).toISOString().slice(0, 10);
      if (stamp !== day) { day = stamp; count = 0; }
      if (count >= 100 || now() < nextRequestAt || busy) {
        throw new ChatError("LOCAL LIMIT. Please wait before sending another message.", 429);
      }
      if (!sessions.has(id) && sessions.size >= 8) sessions.delete(sessions.keys().next().value);
      const history = sessions.get(id) ?? [];
      busy = true;
      count++;
      nextRequestAt = now() + 15_000;
      const timeout = AbortSignal.timeout(timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
          method: "POST", redirect: "error",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
          signal: requestSignal,
          body: JSON.stringify({
            // Match the Playground's empty system instructions and Minimal thinking.
            // Search grounding is unavailable in this model's free API tier, even
            // though Google permits testing it in AI Studio. Keep all tools off.
            contents: [...history, { role: "user", content: prompt }].map((message) => ({
              role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }],
            })),
            generationConfig: { maxOutputTokens: 1024, candidateCount: 1, thinkingConfig: { thinkingLevel: "MINIMAL", includeThoughts: false } },
          }),
        });
        // Quota, billing, credentials and unavailable models all fail closed.
        // Never retry, change models or move to a paid endpoint.
        if (response.status >= 400 && response.status < 500) {
          blocked = true;
          if (stopFile) {
            try { writeFileSync(stopFile, `Gemini stopped after HTTP ${response.status}. Check Free quota and disabled billing before removing this file.\n`, { mode: 0o600 }); }
            catch { throw new ChatError("Gemini paused, but the stop file could not be saved. Stop the server and fix file permissions before restarting.", 503); }
          }
          throw new ChatError(`QUOTA OR CONFIGURATION ERROR (Google HTTP ${response.status}). Gemini is paused; no automatic retry or paid fallback. See README.`, 429);
        }
        if (!response.ok) {
          const reason = response.status === 503 ? "Gemini temporarily unavailable or overloaded"
            : response.status === 504 ? "Gemini took too long to respond"
            : response.status === 500 ? "Gemini internal server error" : "Unexpected Gemini response";
          throw new ChatError(`${reason} (Google HTTP ${response.status}). No automatic retry was made. You may try again manually later.`, response.status === 504 ? 504 : 502);
        }
        const body = await response.json();
        const candidate = body.candidates?.[0];
        if (body.promptFeedback?.blockReason || (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason))) {
          throw new ChatError("Gemini could not display this reply. Try a different question.");
        }
        const answer = candidate?.content?.parts?.filter((part) => !part.thought && typeof part.text === "string").map((part) => part.text).join("");
        if (typeof answer !== "string" || !answer.trim()) throw new ChatError("The model returned no displayable answer. Try a simpler question.");
        const text = answer.slice(0, 6000);
        const next = [...history, { role: "user", content: prompt }, { role: "assistant", content: text }];
        while (next.length > 6 || (next.length > 2 && next.reduce((n, m) => n + m.content.length, 0) > 6000)) next.splice(0, 2);
        sessions.set(id, next);
        return text;
      } catch (error) {
        if (error instanceof ChatError) throw error;
        // Never forward provider bodies, URLs, headers or credentials to clients/logs.
        if (signal?.aborted) throw new ChatError("Request cancelled. No automatic retry was made.", 499);
        if (timeout.aborted) throw new ChatError("GEMINI TIMEOUT. Google did not complete the reply within 45 seconds. No automatic retry was made.", 504);
        if (error instanceof SyntaxError) throw new ChatError("GEMINI RESPONSE ERROR. Google returned an unreadable reply. No automatic retry was made.", 502);
        throw new ChatError("GEMINI CONNECTION FAILED. The local server could not complete its connection to Google. No automatic retry was made.", 502);
      } finally { busy = false; }
    },
  };
}
