import { qlLineEditorActive } from "./ql-text-input.js";
import { QL_KEYBOARD } from "./ql-keyboard.js";

// Do not send BASIC source to the ROM's F1/F2 chooser. Readiness comes from
// QDOS's actual console editor, never from an empty keyboard queue or a timer.
export async function waitForSuperBasic({ bus, device, signal, delay, timeout = 15_000 }) {
  const checkCancelled = () => {
    if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
  };
  checkCancelled();
  if (qlLineEditorActive(bus)) return;
  // Stop a running BASIC program first. At the boot chooser BREAK is ignored;
  // F1 then selects the monitor. A second BREAK handles cartridge auto-boot.
  device.enqueueKey(QL_KEYBOARD.keyrowByCode.Space, { control: true });
  for (let elapsed = 0; elapsed < timeout; elapsed += 20) {
    checkCancelled();
    if (qlLineEditorActive(bus)) return;
    if (elapsed === 500) device.enqueueKey(QL_KEYBOARD.keyrowByCode.F1);
    if (elapsed === 1500) device.enqueueKey(QL_KEYBOARD.keyrowByCode.Space, { control: true });
    await delay(20, signal);
  }
  checkCancelled();
  if (!qlLineEditorActive(bus)) throw new Error("O SuperBASIC ainda não está pronto. O programa não foi enviado. Entre no SuperBASIC e tente novamente.");
}

// Pace injected keys by QL time, not browser timer time. A slow frame must not
// shorten the time Minerva has to edit a line before the next one arrives.
export async function waitForQlCycles(milliseconds, {
  cpu, hz, signal, delay, now = () => performance.now(), suspended = () => false,
}) {
  const target = cpu.cycles + milliseconds * hz / 1000;
  let lastCycles = cpu.cycles;
  let lastProgress = now();
  while (cpu.cycles < target) {
    if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
    await delay(12, signal);
    if (cpu.cycles !== lastCycles || suspended()) {
      lastCycles = cpu.cycles;
      lastProgress = now();
    } else if (now() - lastProgress > 5000) {
      throw new Error("O QL parou durante o carregamento. Retome a execução ou tente novamente.");
    }
  }
}

export async function waitForChatReady({ bridge, signal, delay, timeout = 10_000 }) {
  let elapsed = 0;
  while (!bridge.ready) {
    if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
    if (elapsed >= timeout) throw new Error("O terminal não confirmou o arranque. Escolha F1 no QL e tente novamente.");
    await delay(20, signal);
    elapsed += 20;
  }
}

export function chatLoadingConsumesKey(event, loading) {
  if (!loading) return false;
  // Keep browser navigation available; never forward typing into half a program.
  if (event.key !== "Tab" && !event.metaKey && !event.altKey) event.preventDefault();
  return true;
}
