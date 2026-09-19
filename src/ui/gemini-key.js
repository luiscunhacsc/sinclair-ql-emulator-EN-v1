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
    return "This value is a project ID or number. In Google AI Studio, open the key and use the button to copy the API key value.";
  }
  if (key.includes("…") || key.includes("...") || key.includes("*")) {
    return "The key appears to be shortened or masked. Use the button to copy the full key in Google AI Studio instead of copying the text visible in the list.";
  }
  if (key.length > 4096) return "The value is too long. Copy only the API key, not the page or a credentials file.";
  if (/\s/.test(key)) return "The key contains internal spaces or line breaks. Copy it in full again using the copy button in Google AI Studio.";
  if (/^(?:GEMINI_API_KEY|GOOGLE_API_KEY)=/.test(key)) return "Paste only the key value, without GEMINI_API_KEY= or GOOGLE_API_KEY=.";
  // Allow common opaque-token punctuation, including dots and base64 padding.
  // Quotes, comments, control characters and backslashes cannot enter the .env.
  if (key && !/^[A-Za-z0-9._~+\/=-]+$/.test(key)) {
    return "The value contains characters that cannot be saved as a key. Use the button to copy the full key in Google AI Studio.";
  }
  return null;
}
