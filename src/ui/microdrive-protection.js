const STORAGE_KEY = "sinclair-ql-microdrive-protection";

// Remember explicit choices by file contents, not a guessed purpose or filename.
// New blank cartridges have separate identities even though their bytes match.
export class MicrodriveProtection {
  constructor(storage = () => globalThis.localStorage) {
    this.storage = storage;
    this.keys = new WeakMap();
    this.choices = new Map();
    try {
      const entries = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "boolean") {
            this.choices.set(entry[0], entry[1]);
          }
        }
      }
    } catch { /* Private browsing may only allow session preferences. */ }
  }

  async keyFor(file, bytes) {
    if (!this.keys.has(file)) {
      const key = file.virgin ? `new:${crypto.randomUUID()}`
        : `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      this.keys.set(file, key);
    }
    return this.keys.get(file);
  }

  isProtected(key, file) {
    return this.choices.get(key) ?? !file.virgin;
  }

  remember(key, protectedState) {
    if (typeof key !== "string") return;
    this.choices.set(key, Boolean(protectedState));
    try {
      // Blank cartridge identities only exist for the current page session.
      const saved = [...this.choices].filter(([id]) => id.startsWith("sha256:"));
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch { /* Keep the in-memory choice if storage is unavailable. */ }
  }

  async rememberExport(bytes, protectedState) {
    this.remember(await this.keyFor({}, bytes), protectedState);
  }
}

export function canSaveMicrodrive(image) {
  return Boolean(image && (!image.writeProtected || image.dirty));
}
