// Treat provider credentials as opaque tokens, not as one fixed key format.
// These checks protect the local .env and HTTP header; Google validates the key.
export function normalizeGeminiKey(value) {
  let key = value.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export function geminiKeyProblem(key) {
  if (key.startsWith("gen-lang-client-") || /^\d+$/.test(key)) {
    return "Este valor é um identificador ou número de projeto. No Google AI Studio, abra a chave e use o botão de copiar o valor da chave API.";
  }
  if (key.includes("…") || key.includes("...") || key.includes("*")) {
    return "A chave parece estar abreviada ou ocultada. Use o botão de copiar a chave completa no Google AI Studio, em vez de copiar o texto visível na lista.";
  }
  if (key.length > 4096) return "O valor é demasiado longo. Copie apenas a chave API, não a página ou um ficheiro de credenciais.";
  if (/\s/.test(key)) return "A chave contém espaços ou quebras de linha no interior. Volte a copiá-la inteira pelo botão de copiar do Google AI Studio.";
  if (/^(?:GEMINI_API_KEY|GOOGLE_API_KEY)=/.test(key)) return "Cole apenas o valor da chave, sem GEMINI_API_KEY= nem GOOGLE_API_KEY=.";
  // Allow common opaque-token punctuation, including dots and base64 padding.
  // Quotes, comments, control characters and backslashes cannot enter the .env.
  if (key && !/^[A-Za-z0-9._~+\/=-]+$/.test(key)) {
    return "O valor contém caracteres que não podem ser guardados como chave. Use o botão de copiar a chave completa no Google AI Studio.";
  }
  return null;
}
