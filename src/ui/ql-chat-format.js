// Presentation only: the provider's conversation and settings are untouched.
function inlineText(text) {
  const literals = [];
  const protect = (value) => `\0${literals.push(value) - 1}\0`;
  return text.replace(/\0/g, "?")
    .replace(/(`+)([^`]*?)\1/g, (_, fence, code) => protect(code))
    .replace(/\\([\\`*_{}\[\]()#+.!>~-])/g, (_, literal) => protect(literal))
    .replace(/!?\[([^\]]+)\]\(([^\s()]*(?:\([^()]*\)[^\s()]*)*)(?:\s+"[^"]*")?\)/g,
      (_, label, url) => `${label} (${protect(url)})`)
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, (_, url) => protect(url))
    .replace(/(\*\*\*)(?=\S)(.+?\S|\S)\1/g, "$2")
    .replace(/(\*\*|~~)(?=\S)(.+?\S|\S)\1/g, "$2")
    .replace(/(^|\W)(___|__)(?=\S)(.+?\S|\S)\2(?!\w)/g, "$1$3")
    .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w_])_(\S(?:.*?\S)?)_(?![\w_])/g, "$1$2")
    .replace(/\0(\d+)\0/g, (_, index) => literals[Number(index)]);
}

export function markdownToQlText(value) {
  const lines = String(value).replace(/\r\n?/g, "\n").split("\n");
  const result = [];
  let fence = null;
  const separate = () => {
    if (result.length && result.at(-1) !== "") result.push("");
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
        separate();
      } else result.push(line);
      continue;
    }
    if (marker) { separate(); fence = marker[1]; continue; }
    // Indented code is literal, including Markdown-looking operators.
    if (/^(?: {4}|\t)/.test(line) && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      result.push(line);
      continue;
    }
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    const setext = line.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1] ?? "");
    if (heading || setext) {
      separate();
      result.push(inlineText(heading ? heading[1] : line.trim()));
      separate();
      if (setext) i++;
      continue;
    }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      separate();
      continue;
    }
    if (!line.trim()) { separate(); continue; }
    result.push(inlineText(line.replace(/^(\s*)[-+*]\s+/, "$1- ").replace(/^ {0,3}>\s?/, "  ")));
  }
  while (result[0] === "") result.shift();
  while (result.at(-1) === "") result.pop();
  return result.join("\n");
}

// WINDOW #1 is 504 pixels / 6 pixels per character = 84 columns.
// Leave one column spare so firmware wrapping cannot add a second newline.
export const QL_REPLY_COLUMNS = 83;
export const QL_REPLY_LIMIT = 6000;

export function wrapQlText(text, columns = QL_REPLY_COLUMNS, firstColumn = 4) {
  const output = [];
  for (const line of text.split("\n")) {
    let remaining = line;
    const indent = line.match(/^ */)[0];
    const list = line.match(/^ *(?:[-+*]|\d+[.)]) +/);
    const continuation = " ".repeat(Math.min((list?.[0] ?? indent).length, columns - 1));
    let width = columns - (output.length === 0 ? firstColumn : 0);
    while (remaining.length > width) {
      let split = remaining.lastIndexOf(" ", width);
      if (split <= remaining.length - remaining.trimStart().length) {
        // A word that fits a full line must not be cut just because of QL:.
        if (output.length === 0 && firstColumn && remaining.trimStart().split(/\s/, 1)[0].length <= columns - continuation.length) {
          output.push("");
          width = columns;
          continue;
        }
        split = width; // An individual word/URL is wider than the terminal.
      }
      output.push(remaining.slice(0, split).trimEnd());
      remaining = continuation + remaining.slice(split).trimStart();
      width = columns;
    }
    output.push(remaining);
  }
  return output.join("\n");
}

export function limitQlReply(text) {
  if (text.length <= QL_REPLY_LIMIT) return text;
  const suffix = "\n[Reply truncated]";
  const prefix = text.slice(0, QL_REPLY_LIMIT - suffix.length);
  // End at a complete display line, never halfway through a normal word.
  const boundary = prefix.lastIndexOf("\n");
  return prefix.slice(0, boundary >= 0 ? boundary : prefix.length).trimEnd() + suffix;
}
