import test from "node:test";
import assert from "node:assert/strict";
import { markdownToQlText, wrapQlText, limitQlReply, QL_REPLY_COLUMNS } from "../src/ui/ql-chat-format.js";
import { encodeQlText } from "../src/ui/ql-chat.js";

test("movie/history prose becomes readable headings, paragraphs and lists", () => {
  assert.equal(markdownToQlText("O papa emitiu **Manifestis Probatum**.\n\n### 5. A Expansão do Território\n* **Santarém** (1147).\n* _Lisboa_ (1147).\n\nFim."),
    "O papa emitiu Manifestis Probatum.\n\n5. A Expansão do Território\n\n- Santarém (1147).\n- Lisboa (1147).\n\nFim.");
  assert.equal(markdownToQlText("Título\n======\nTexto\n\n---\n\nOutro"), "Título\n\nTexto\n\nOutro");
});

test("code and escaped punctuation retain indentation and operators", () => {
  const code = '10 LET snake_case = 2 * 3\n20 PRINT "**literal**"\n    a_b = a ** 2';
  assert.equal(markdownToQlText("```basic\n" + code + "\n```"), code);
  assert.equal(markdownToQlText("~~~\n" + code + "\n~~~"), code);
  assert.equal(markdownToQlText("Use `a_b * c` e \\*literal\\*: 2 * 3, snake_case, a*b*c."),
    "Use a_b * c e *literal*: 2 * 3, snake_case, a*b*c.");
  assert.equal(markdownToQlText('    PRINT "**literal**"'), '    PRINT "**literal**"');
  assert.equal(markdownToQlText("some__internal__name, __bold__, ___both___, ***both***"), "some__internal__name, bold, both, both");
});

test("links keep both their label and destination", () => {
  assert.equal(markdownToQlText("Ver [filme](https://example.org/Film_(2010)) e <https://example.org/a_b>."),
    "Ver filme (https://example.org/Film_(2010)) e https://example.org/a_b.");
});

test("word wrapping accounts for QL prefix, boundaries and hanging list indentation", () => {
  assert.equal(wrapQlText("one two three four five", 14, 4), "one two\nthree four\nfive");
  assert.equal(wrapQlText("- one two three four five", 14, 4), "- one two\n  three four\n  five");
  assert.equal(wrapQlText("12345678901 next", 14, 4), "\n12345678901\nnext");
  assert.equal(wrapQlText("first\n    PRINT a + b + c", 14, 4), "first\n    PRINT a +\n    b + c");
  assert.equal(wrapQlText("x".repeat(30), 14, 4), "x".repeat(10) + "\n" + "x".repeat(14) + "\n" + "x".repeat(6));
});

test("transliterated responses fit the terminal and preserve every prose word", () => {
  const original = "A expansão do território custa £5 ou €6. ".repeat(30).trim();
  const plain = new TextDecoder().decode(encodeQlText(original));
  const result = wrapQlText(plain);
  assert.equal(result.replace(/\s+/g, " "), plain);
  result.split("\n").forEach((line, index) => {
    assert.ok(line.length + (index === 0 ? 4 : 0) <= QL_REPLY_COLUMNS);
  });
});

test("oversized display text ends on a line boundary with an explicit notice", () => {
  const wrapped = wrapQlText("A complete sentence. ".repeat(600));
  const limited = limitQlReply(wrapped);
  assert.ok(limited.length <= 6000);
  assert.ok(limited.endsWith("\n[Reply truncated]"));
  assert.ok(wrapped.startsWith(limited.replace(/\n\[Reply truncated\]$/, "")));
  assert.equal(limitQlReply("Short reply"), "Short reply");
});
