export async function restartWithoutChat({ bridge, cancelLoading, loading, reset, start }) {
  bridge?.stop();
  cancelLoading();
  // A cancelled BASIC loader must finish its cleanup before the fresh machine
  // starts, or its last callbacks could overwrite the new state.
  if (loading) await loading;
  reset();
  start();
}

export class OriginalQlModeDialog {
  constructor(root, { isChatMode, restart }) {
    this.root = root;
    this.isChatMode = isChatMode;
    this.restart = restart;
    this.destination = root.querySelector("#original-ql-destination");
    this.confirm = root.querySelector("#original-ql-confirm");
    this.cancel = root.querySelector("#original-ql-cancel");
    this.status = root.querySelector("#original-ql-status");
    this.pending = null;
    this.busy = false;
    this.confirm.addEventListener("click", () => void this.accept());
    this.cancel.addEventListener("click", () => { if (!this.busy) root.close(); });
    root.addEventListener("cancel", (event) => { if (this.busy) event.preventDefault(); });
    root.addEventListener("close", () => {
      const resolve = this.pending;
      this.pending = null;
      resolve?.(root.returnValue === "original");
    });
  }

  request(destination) {
    if (this.pending) return Promise.resolve(false);
    if (!this.isChatMode()) return Promise.resolve(true);
    this.destination.textContent = destination === "guide" ? "o Guia de SuperBASIC" : destination === "microdrive" ? "o gestor de Microdrives" : "a biblioteca de Software";
    this.confirm.textContent = destination === "guide" ? "Reiniciar e abrir o guia" : destination === "microdrive" ? "Reiniciar e abrir o gestor" : "Reiniciar e abrir a biblioteca";
    this.status.textContent = "";
    this.root.returnValue = "";
    const answer = new Promise((resolve) => { this.pending = resolve; });
    this.root.showModal();
    return answer;
  }

  async accept() {
    if (!this.pending || this.busy) return;
    this.busy = true;
    this.confirm.disabled = true;
    this.cancel.disabled = true;
    this.status.textContent = "A encerrar o chat e a reiniciar o QL…";
    try {
      await this.restart();
      this.root.close("original");
    } catch {
      this.status.textContent = "Não foi possível concluir o reinício. Tente novamente ou use Reiniciar nos controlos do QL.";
    } finally {
      this.busy = false;
      this.confirm.disabled = false;
      this.cancel.disabled = false;
    }
  }
}
