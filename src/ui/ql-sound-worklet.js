import { QLSoundSynthesizer } from "../devices/ql-sound.js";

class QLSoundProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synthesizer = new QLSoundSynthesizer({ sampleRate });
    this.port.onmessage = ({ data }) => {
      if (data.type === "start") this.synthesizer.start(data.sound);
      else if (data.type === "stop") this.synthesizer.stop();
      else if (data.type === "pause") this.synthesizer.setPaused(data.paused);
    };
  }

  process(_inputs, outputs) {
    const channels = outputs[0];
    if (channels.length === 0) return true;
    this.synthesizer.render(channels[0]);
    for (let channel = 1; channel < channels.length; channel += 1) {
      channels[channel].set(channels[0]);
    }
    return true;
  }
}

registerProcessor("sinclair-ql-sound", QLSoundProcessor);
