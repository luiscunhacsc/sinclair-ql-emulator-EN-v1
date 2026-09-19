import test from "node:test";
import assert from "node:assert/strict";

import { QL_KEYBOARD } from "../src/ui/ql-keyboard.js";
import { GUIDE_LESSONS } from "../src/ui/guide-content.js";
import {
  guideExampleEvents,
  qlKeyForCharacter,
  qlTextEvents,
} from "../src/ui/ql-text-input.js";

test("converte texto ASCII nos códigos e modificadores físicos do QL", () => {
  assert.deepEqual(qlKeyForCharacter("a"), {
    keyrow: QL_KEYBOARD.keyrowByCode.KeyA,
    shift: false,
    control: false,
    alt: false,
    pauseAfter: 14,
  });
  assert.equal(qlKeyForCharacter("A").shift, true);
  assert.deepEqual(qlKeyForCharacter('"'), {
    keyrow: QL_KEYBOARD.keyrowByCode.Quote,
    shift: true,
    control: false,
    alt: false,
    pauseAfter: 14,
  });
  assert.equal(qlKeyForCharacter("\n").keyrow, QL_KEYBOARD.keyrowByCode.Enter);
});

test("ignora carriage returns e rejeita caracteres não representáveis", () => {
  assert.equal(qlKeyForCharacter("\r"), null);
  assert.equal(qlTextEvents("A\r\nB").length, 3);
  assert.throws(() => qlKeyForCharacter("á"), /cannot yet/u);
});

test("um programa começa com BREAK e NEW, podendo terminar com RUN", () => {
  const example = { kind: "program", code: '100 PRINT "QL"' };
  const loaded = guideExampleEvents(example);
  const executed = guideExampleEvents(example, { run: true });

  assert.equal(loaded[0].keyrow, QL_KEYBOARD.keyrowByCode.Space);
  assert.equal(loaded[0].control, true);
  assert.ok(executed.length > loaded.length);
  assert.deepEqual(
    executed.slice(-4).map(({ keyrow }) => keyrow),
    [
      QL_KEYBOARD.keyrowByCode.KeyR,
      QL_KEYBOARD.keyrowByCode.KeyU,
      QL_KEYBOARD.keyrowByCode.KeyN,
      QL_KEYBOARD.keyrowByCode.Enter,
    ],
  );
});

test("um comando só recebe ENTER quando deve ser executado", () => {
  const example = { kind: "command", code: "PRINT 2+2" };
  const prepared = guideExampleEvents(example);
  const executed = guideExampleEvents(example, { run: true });
  assert.notEqual(prepared.at(-1).keyrow, QL_KEYBOARD.keyrowByCode.Enter);
  assert.equal(executed.at(-1).keyrow, QL_KEYBOARD.keyrowByCode.Enter);
});

test("todos os exemplos do guia podem ser enviados pelo teclado do QL", () => {
  for (const lesson of GUIDE_LESSONS) {
    assert.doesNotThrow(
      () => guideExampleEvents(lesson, { run: true }),
      `O exemplo ${lesson.id} contém um carácter que o teclado não suporta`,
    );
  }
});
