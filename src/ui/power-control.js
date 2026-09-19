// Stop immediately, then drain cancelled input before clearing the machine.
export async function powerOffMachine({ stop, bridge, cancelLoading, loading, reset }) {
  stop();
  bridge?.stop();
  cancelLoading();
  if (loading) await Promise.allSettled([loading]);
  reset();
}

// Instruction actions only turn the QL on; the switch cuts its power.
export class PowerControl {
  constructor({ toggle, actions, state, start, stop, focusScreen }) {
    this.toggle = toggle;
    this.actions = [...actions];
    this.state = state;
    toggle.addEventListener("click", () => {
      const { enabled, started } = state();
      if (!enabled) return;
      if (started) stop();
      else start();
    });
    for (const action of this.actions) {
      action.addEventListener("click", () => {
        const { enabled, running } = state();
        if (!enabled) return;
        if (!running) start();
        action.closest("dialog[open]")?.close();
        focusScreen();
      });
    }
  }

  update() {
    const { enabled, running, started } = this.state();
    this.toggle.disabled = !enabled;
    this.toggle.setAttribute("aria-checked", String(started));
    this.toggle.title = started ? "Desligar o QL — apaga o programa em memória e encerra o chat" : "Ligar o QL";
    this.toggle.querySelector("[data-power-status]").textContent = !enabled ? "A preparar…"
      : running ? "Ligado" : started ? "Ligado · CPU parada" : "Desligado";
    for (const action of this.actions) {
      action.disabled = !enabled;
      action.title = running ? "O QL já está ligado — ir para o ecrã"
        : started ? "Retomar o QL e ir para o ecrã" : "Ligar o QL e ir para o ecrã";
    }
  }
}
