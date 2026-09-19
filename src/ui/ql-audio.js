const DEFAULT_WORKLET_URL = new URL("./ql-sound-worklet.js", import.meta.url);

function browserAudioContext() {
  return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
}

function browserNodeFactory(context) {
  return new AudioWorkletNode(context, "sinclair-ql-sound", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
}

/** Lazy Web Audio bridge. No AudioContext is created before a user gesture. */
export class QLAudio {
  constructor({
    AudioContextClass = browserAudioContext(),
    nodeFactory = browserNodeFactory,
    workletUrl = DEFAULT_WORKLET_URL,
    enabled = true,
    onStateChange = null,
  } = {}) {
    this.AudioContextClass = AudioContextClass;
    this.nodeFactory = nodeFactory;
    this.workletUrl = workletUrl;
    this.enabled = Boolean(enabled);
    this.onStateChange = onStateChange;
    this.context = null;
    this.node = null;
    this.initializing = null;
    this.pendingSound = null;
    this.paused = true;
    this.failed = false;
  }

  get supported() {
    return this.AudioContextClass !== null && !this.failed;
  }

  notifyStateChange() {
    if (typeof this.onStateChange === "function") this.onStateChange(this);
  }

  handleIpcEvent(event) {
    if (event.type === "start") {
      this.pendingSound = event.sound;
      if (this.enabled && this.node) this.node.port.postMessage(event);
    } else if (event.type === "stop") {
      this.pendingSound = null;
      if (this.node) this.node.port.postMessage({ type: "stop" });
    }
  }

  async initialize() {
    if (!this.supported) return false;
    if (this.node) return true;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      try {
        this.context = new this.AudioContextClass();
        if (!this.context.audioWorklet) throw new Error("AudioWorklet unavailable");
        // Resume immediately while the browser still considers this call part
        // of the user gesture; loading the worklet may otherwise outlive it.
        await Promise.all([
          this.context.resume(),
          this.context.audioWorklet.addModule(this.workletUrl),
        ]);
        this.node = this.nodeFactory(this.context);
        this.node.connect(this.context.destination);
        if (this.pendingSound && this.enabled) {
          this.node.port.postMessage({ type: "start", sound: this.pendingSound });
        }
        this.node.port.postMessage({ type: "pause", paused: this.paused });
        return true;
      } catch {
        this.failed = true;
        this.enabled = false;
        if (this.context?.close) await this.context.close().catch(() => {});
        this.context = null;
        this.node = null;
        this.notifyStateChange();
        return false;
      } finally {
        this.initializing = null;
      }
    })();
    return this.initializing;
  }

  async resume() {
    if (!this.enabled || !this.supported) return false;
    this.paused = false;
    if (!await this.initialize()) return false;
    if (this.context.state !== "running") await this.context.resume();
    this.node.port.postMessage({ type: "pause", paused: false });
    this.notifyStateChange();
    return true;
  }

  pause() {
    this.paused = true;
    if (this.node) this.node.port.postMessage({ type: "pause", paused: true });
  }

  setEnabled(enabled, activeSound = null) {
    this.enabled = Boolean(enabled) && this.supported;
    if (!this.enabled) {
      if (this.node) this.node.port.postMessage({ type: "stop" });
      this.pendingSound = null;
    } else if (activeSound) {
      this.pendingSound = activeSound;
      if (this.node) this.node.port.postMessage({ type: "start", sound: activeSound });
    }
    this.notifyStateChange();
  }
}
