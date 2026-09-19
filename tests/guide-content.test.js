import test from "node:test";
import assert from "node:assert/strict";

import {
  GUIDE_LESSONS,
  adjacentGuideLesson,
  guideHash,
  guideLesson,
  guideLessonIdFromHash,
  guideLessonIndex,
  matchingGuideLessons,
} from "../src/ui/guide-content.js";

test("o guia cobre os 16 capítulos com lições executáveis e identificadores únicos", () => {
  assert.equal(GUIDE_LESSONS.length, 32);
  assert.deepEqual(
    [...new Set(GUIDE_LESSONS.map((lesson) => lesson.chapterNumber))],
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
  assert.equal(new Set(GUIDE_LESSONS.map((lesson) => lesson.id)).size, GUIDE_LESSONS.length);
  assert.ok(GUIDE_LESSONS.every((lesson) => ["command", "program"].includes(lesson.kind)));
  assert.ok(GUIDE_LESSONS.every((lesson) => lesson.code.length > 0));
  assert.deepEqual(
    GUIDE_LESSONS.filter((lesson) => lesson.writesMicrodrive).map((lesson) => lesson.id),
    ["primeiro-cartucho-format", "guardar-no-microdrive", "formatar-segundo-microdrive", "copiar-entre-microdrives",
      "copiar-de-volta-microdrive", "apagar-copia-microdrive", "ficheiro-sequencial", "dois-canais-dois-microdrives"],
  );
});

test("constrói e interpreta ligações diretas para lições conhecidas", () => {
  assert.equal(guideHash("primeiro-programa"), "#guia/primeiro-programa");
  assert.equal(guideLessonIdFromHash("#guia/primeiro-programa"), "primeiro-programa");
  assert.equal(guideLessonIdFromHash("#guia/desconhecida"), null);
  assert.equal(guideLessonIdFromHash("#outra/rota"), null);
  assert.equal(guideLesson("desconhecida"), GUIDE_LESSONS[0]);
});

test("percorre as lições e respeita os limites do curso", () => {
  assert.equal(guideLessonIndex("primeiro-programa"), 1);
  assert.equal(adjacentGuideLesson("primeiro-programa", -1).id, "primeiro-comando");
  assert.equal(adjacentGuideLesson("primeiro-programa", 1).id, "estrela-de-cores");
  assert.equal(adjacentGuideLesson(GUIDE_LESSONS[0].id, -1), GUIDE_LESSONS[0]);
  assert.equal(adjacentGuideLesson(GUIDE_LESSONS.at(-1).id, 1), GUIDE_LESSONS.at(-1));
});

test("pesquisa títulos, descrições e palavras-chave sem distinguir maiúsculas", () => {
  assert.ok(matchingGuideLessons("GRÁFICO").some((lesson) => lesson.id === "estrela-de-cores"));
  assert.ok(matchingGuideLessons("PRINT").some((lesson) => lesson.id === "primeiro-comando"));
  assert.deepEqual(matchingGuideLessons("insercao").map((lesson) => lesson.id), ["ordenacao-por-insercao"]);
  assert.ok(matchingGuideLessons("microdrive").some((lesson) => lesson.id === "ficheiro-sequencial"));
  assert.equal(matchingGuideLessons("").length, GUIDE_LESSONS.length);
});
