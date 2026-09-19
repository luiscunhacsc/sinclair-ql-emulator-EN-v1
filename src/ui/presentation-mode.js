export const PRESENTATION_MODES = Object.freeze(["screen", "monitor", "computer"]);

const PRESENTATION_LABELS = Object.freeze({
  screen: "Apenas o ecrã do Sinclair QL",
  monitor: "Ecrã no monitor Sinclair QL",
  computer: "Sinclair QL completo com monitor",
});

export function normalizePresentationMode(value, fallback = "monitor") {
  if (PRESENTATION_MODES.includes(value)) return value;
  return PRESENTATION_MODES.includes(fallback) ? fallback : "monitor";
}

export function adjacentPresentationMode(value, offset) {
  const current = PRESENTATION_MODES.indexOf(normalizePresentationMode(value));
  const length = PRESENTATION_MODES.length;
  return PRESENTATION_MODES[((current + offset) % length + length) % length];
}

export function presentationLabel(value) {
  return PRESENTATION_LABELS[normalizePresentationMode(value)];
}
