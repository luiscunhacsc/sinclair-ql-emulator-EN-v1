import { microdriveActionBlockReason } from "./software-library.js";

export class MicrodriveMenu {
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.slot = 1;
    this.busy = false;
    this.title = root.querySelector("#drive-menu-title");
    this.medium = root.querySelector("#drive-menu-medium");
    this.activity = root.querySelector("#drive-menu-activity");
    this.status = root.querySelector("#drive-menu-status");
    this.results = root.querySelector("#drive-menu-results");
    this.newForm = root.querySelector("#drive-new-form");
    this.saveForm = root.querySelector("#drive-project-form");
    this.fileInput = root.querySelector("#drive-menu-file");
    this.view = "home";
    root.addEventListener("click", (event) => {
      const unit = event.target.closest("[data-menu-slot]");
      if (unit && !unit.disabled) { this.open(Number(unit.dataset.menuSlot), this.opener); return; }
      const button = event.target.closest("[data-menu-action]");
      if (!button || button.disabled) return;
      void this.perform(button.dataset.menuAction);
    });
    this.newForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = root.querySelector("#drive-new-name").value;
      const format = event.submitter?.value === "format";
      void this.run(async (slot) => {
        const ok = await actions.create(slot, name, format);
        if (ok) this.showView("home");
      });
    });
    this.saveForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(async (slot) => {
        await actions.saveProject(slot, root.querySelector("#drive-project-name").value);
        this.showView("home");
      });
    });
    this.fileInput.addEventListener("change", () => {
      const [file] = this.fileInput.files;
      const slot = this.fileSlot;
      this.fileInput.value = "";
      if (file && !this.busy && this.root.open && slot === this.slot) {
        void this.run((target) => actions.mount(target, file));
      }
    });
    root.addEventListener("cancel", (event) => { if (this.busy) event.preventDefault(); });
    root.addEventListener("close", () => {
      this.opener?.focus({ preventScroll: true });
      actions.select(null);
    });
  }

  open(slot, opener) {
    if (this.busy) return;
    if (slot !== 1 && slot !== 2) return;
    this.slot = slot;
    this.opener = opener;
    this.status.textContent = "Escolha o cartucho para esta unidade. Os comandos no QL continuam a usar mdv1_ ou mdv2_.";
    this.showView("home");
    this.actions.select(slot);
    if (!this.root.open) this.root.showModal();
    this.refresh();
  }

  message(text) { this.status.textContent = text; }

  async run(operation) {
    if (this.busy) return;
    const slot = this.slot; // Capture the intended unit before any asynchronous work.
    this.busy = true;
    this.refresh();
    try { await operation(slot); }
    catch (error) { this.message(error.message); }
    finally { this.busy = false; this.refresh(); }
  }

  refresh() {
    const { mounted, selection, busy, running, canFormat, canBoot } = this.actions.state(this.slot);
    const active = Boolean(selection & (1 << (this.slot - 1)));
    this.title.textContent = `Gestor de MDV${this.slot}`;
    this.medium.textContent = mounted ? `${mounted.name} · ${mounted.writeProtected ? "só leitura" : "escrita permitida"}${mounted.dirty ? " · alterações por guardar" : ""}` : "Unidade vazia";
    const mountReason = microdriveActionBlockReason({ slot: this.slot, action: "mount", mounted, selection });
    this.activity.textContent = active ? `MDV${this.slot} em uso. Aguarde que a luz apague.${!running ? " Retome o QL para terminar a operação." : ""}`
      : mountReason || (selection ? "Pode inserir aqui: esta unidade está vazia e parada." : "Motor parado. Escolha uma origem abaixo.");
    this.root.dataset.active = String(active);
    this.root.querySelector("#drive-mounted-actions").hidden = !mounted;
    this.root.querySelector('[data-menu-action="protection"]').textContent = mounted?.writeProtected ? "Permitir escrita" : "Proteger";
    const resume = this.root.querySelector('[data-menu-action="resume"]');
    resume.hidden = running || !selection;
    for (const button of this.root.querySelectorAll("button")) {
      const action = button.dataset.menuAction;
      const guardAction = button.dataset.guard;
      if (button.dataset.menuSlot) button.setAttribute("aria-pressed", String(Number(button.dataset.menuSlot) === this.slot));
      if (action === "boot") button.hidden = this.slot !== 1;
      const reason = guardAction ? microdriveActionBlockReason({ slot: this.slot, action: guardAction, mounted, selection }) : "";
      button.disabled = this.busy || busy || Boolean(reason) || (button.value === "format" && !canFormat)
        || (action === "boot" && (!mounted || !canBoot || this.slot !== 1));
      button.title = reason || (button.value === "format" && !canFormat ? "Requer o QL pronto no SuperBASIC, sem operações em curso." : "");
      if (action === "new") button.textContent = mounted ? "Trocar por novo cartucho" : "Novo cartucho";
      if (action === "boot" && !reason) button.title = "Apaga o programa em memória e procura o programa boot do cartucho em MDV1.";
    }
    for (const input of this.root.querySelectorAll("input")) input.disabled = this.busy || busy;
  }

  showView(view) {
    this.view = view;
    this.newForm.hidden = view !== "new";
    this.saveForm.hidden = view !== "project";
    this.results.hidden = !["projects", "library"].includes(view);
    this.results.replaceChildren();
    if (view === "new") this.root.querySelector("#drive-new-name").value = `trabalho${this.slot}`;
    if (view === "project") this.root.querySelector("#drive-project-name").value = this.actions.state(this.slot).mounted?.name.replace(/\.mdv$/i, "") ?? "Meu projeto";
    if (view === "projects" || view === "library") this.renderFiles(view);
    this.refresh();
    if (this.root.open && !this.busy) {
      if (view === "new") this.root.querySelector("#drive-new-name").focus();
      else if (view === "project") this.root.querySelector("#drive-project-name").focus();
    }
  }

  renderFiles(view) {
    const doc = this.root.ownerDocument;
    const heading = doc.createElement("h3");
    heading.textContent = view === "projects" ? "Os meus projetos" : "Biblioteca de software";
    this.results.append(heading);
    try {
      const entries = view === "projects" ? this.actions.projects() : this.actions.library();
      if (!entries.length) {
        const empty = doc.createElement("p");
        empty.textContent = view === "projects" ? "Ainda não guardou projetos. Insira um cartucho e escolha Guardar projeto para conservar uma cópia neste navegador."
          : "Ainda não há software na biblioteca desta sessão. Use Abrir do computador ou Abrir biblioteca de software para adicionar ficheiros ou uma pasta.";
        this.results.append(empty);
      }
      for (const entry of entries) {
        const row = doc.createElement("div");
        row.className = "drive-menu-file-row";
        const button = doc.createElement("button");
        button.type = "button";
        button.dataset.guard = "mount";
        button.className = "drive-menu-file-choice";
        button.textContent = `${entry.name} → MDV${this.slot}`;
        if (entry.savedAt) {
          const date = doc.createElement("small");
          date.textContent = new Date(entry.savedAt).toLocaleString("pt-PT");
          button.append(date);
        }
        button.addEventListener("click", () => void this.run((slot) => this.actions.mount(slot, view === "projects" ? this.actions.projectFile(entry) : entry)));
        row.append(button);
        if (view === "projects") {
          const remove = doc.createElement("button");
          remove.type = "button";
          remove.textContent = "Remover";
          remove.setAttribute("aria-label", `Remover projeto ${entry.name}`);
          remove.addEventListener("click", () => void this.run(async () => {
            await this.actions.removeProject(entry);
            this.showView("projects");
          }));
          row.append(remove);
        }
        this.results.append(row);
      }
    } catch { this.message("Não foi possível ler os projetos neste navegador. Pode continuar a abrir e exportar ficheiros .mdv no computador."); }
  }

  async perform(action) {
    if (["new", "projects", "library", "project"].includes(action)) { this.showView(action); return; }
    if (action === "close") { this.root.close(); return; }
    if (action === "file") { this.fileSlot = this.slot; this.fileInput.click(); return; }
    if (action === "all") { this.root.close(); this.actions.all(); return; }
    if (action === "guide") { this.root.close(); this.actions.guide(); return; }
    await this.run((slot) => this.actions[action](slot));
  }
}
