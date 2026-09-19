// Scrollback belongs to the browser; typing still goes through the QL keyboard.
export class ChatHistory {
  constructor(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.root.hidden = true;
    this.viewport = root.querySelector("#chat-transcript");
    this.latest = root.querySelector("#chat-latest");
    this.status = root.querySelector("#chat-history-status");
    this.content = root.querySelector("#chat-history-content");
    this.toggle = root.querySelector("#chat-history-toggle");
    this.toggleLabel = root.querySelector("#chat-history-toggle-label");
    this.toggleIcon = root.querySelector("#chat-history-toggle-icon");
    this.collapsed = false;
    this.savedPosition = 0;
    this.following = true;
    this.unread = 0;
    this.target = null;
    this.toggle.addEventListener("click", () => this.setCollapsed(!this.collapsed));
    this.setCollapsed(true);
    this.status.textContent = "Start QL Chat to begin a conversation.";
    this.viewport.addEventListener("scroll", () => this.update());
    this.viewport.addEventListener("scrollend", () => { this.target = null; });
    // Native wheel/touch scrolling takes over from button animations.
    for (const type of ["wheel", "touchstart", "pointerdown"]) {
      this.viewport.addEventListener(type, () => { this.target = null; }, { passive: true });
    }
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chat-scroll]");
      if (button) this.move(button.dataset.chatScroll);
    });
    this.latest.addEventListener("click", () => this.move("end"));
    root.querySelector("#chat-type").addEventListener("click", () => canvas.focus());
    this.viewport.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const action = { ArrowUp: "-line", ArrowDown: "line", PageUp: "-page", PageDown: "page", Home: "home", End: "end" }[event.key];
      if (!action) return;
      event.preventDefault();
      this.move(action);
    });
  }

  setCollapsed(collapsed) {
    if (collapsed === this.collapsed) return;
    if (collapsed) {
      this.savedPosition = this.viewport.scrollTop;
      this.target = null;
      this.viewport.scrollTo({ top: this.savedPosition, behavior: "instant" });
      if (this.content.contains(this.root.ownerDocument.activeElement)) this.toggle.focus();
    }
    this.collapsed = collapsed;
    this.content.hidden = collapsed;
    this.toggle.setAttribute("aria-expanded", String(!collapsed));
    this.toggleLabel.textContent = collapsed ? "Show conversation" : "Hide conversation";
    this.toggleIcon.textContent = collapsed ? "▼" : "▲";
    if (!collapsed) {
      this.viewport.scrollTop = this.following ? this.viewport.scrollHeight : this.savedPosition;
      this.update();
    }
  }

  hide() {
    const restoreFocus = this.root.contains(this.root.ownerDocument.activeElement);
    this.setCollapsed(true);
    this.root.hidden = true;
    if (restoreFocus) this.canvas.focus();
  }

  reset() {
    this.root.hidden = false;
    this.viewport.replaceChildren();
    this.viewport.scrollTop = 0;
    this.following = true;
    this.unread = 0;
    this.target = null;
    this.savedPosition = 0;
    this.setCollapsed(false);
    this.status.textContent = "Messages appear here after the terminal starts.";
    this.latest.textContent = "Latest ↓";
  }

  append({ role, text }) {
    const message = this.root.ownerDocument.createElement("article");
    message.className = `chat-message chat-message-${role}`;
    const author = this.root.ownerDocument.createElement("strong");
    author.textContent = role === "user" ? "You" : "QL";
    const body = this.root.ownerDocument.createElement("p");
    body.textContent = text;
    message.append(author, body);
    this.viewport.append(message);
    if (this.following && !this.collapsed) {
      this.target = null;
      this.viewport.scrollTop = this.viewport.scrollHeight;
      this.status.textContent = "Following the latest messages.";
    } else {
      this.unread++;
      this.status.textContent = "New messages — your position has been kept.";
    }
    this.updateLabel();
  }

  move(action) {
    const max = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
    const line = parseFloat(getComputedStyle(this.viewport).lineHeight) || 24;
    const step = action.includes("page") ? Math.max(line, this.viewport.clientHeight - line) : line;
    const position = this.target ?? this.viewport.scrollTop;
    const top = action === "home" ? 0 : action === "end" ? max
      : Math.max(0, Math.min(max, position + (action.startsWith("-") ? -step : step)));
    this.target = top;
    this.following = top >= max - 2;
    this.viewport.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    if (this.following) this.unread = 0;
    this.updateLabel();
  }

  update() {
    if (this.collapsed) return;
    const position = this.target ?? this.viewport.scrollTop;
    this.following = this.viewport.scrollHeight - this.viewport.clientHeight - position <= 2;
    if (this.following) {
      this.unread = 0;
      this.status.textContent = "Following the latest messages.";
    } else if (!this.unread) this.status.textContent = "Reading the history. Latest returns to the end of the conversation.";
    this.updateLabel();
  }

  updateLabel() {
    this.latest.textContent = this.unread ? `Latest (${this.unread}) ↓` : "Latest ↓";
  }
}
