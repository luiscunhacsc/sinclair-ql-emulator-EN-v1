// SuperBASIC documents duration and gradient intervals in 72 µs units.
export const QL_SOUND_TICK_HZ = 1_000_000 / 72;
const QL_PITCH_NUMERATOR_HZ = 11_336.256;
const QL_PITCH_OFFSET = 8.634;

function byteFromBits(bits, offset) {
  let value = 0;
  for (let index = 0; index < 8; index += 1) value = (value << 1) | bits[offset + index];
  return value;
}

/** Decode the 64-bit parameter block accepted by IPC command 10. */
export function decodeIpcSoundBits(bits) {
  if (!Array.isArray(bits) || bits.length !== 64 || bits.some((bit) => bit !== 0 && bit !== 1)) {
    throw new RangeError("O comando de som IPC requer exatamente 64 bits binários.");
  }

  const bytes = Array.from({ length: 8 }, (_, index) => byteFromBits(bits, index * 8));
  const signedStep = bytes[6] >>> 4;
  return Object.freeze({
    pitch: bytes[0],
    pitch2: bytes[1],
    interval: bytes[2] | (bytes[3] << 8),
    duration: bytes[4] | (bytes[5] << 8),
    step: signedStep > 7 ? signedStep - 16 : signedStep,
    wrap: bytes[6] & 0x0f,
    randomness: bytes[7] >>> 4,
    fuzziness: bytes[7] & 0x0f,
  });
}

/** Convert the pitch byte sent by the ROM into the fundamental frequency. */
export function qlPitchFrequency(pitch) {
  const romCorrectedPitch = ((pitch & 0xff) + 255) & 0xff;
  return QL_PITCH_NUMERATOR_HZ / (romCorrectedPitch + QL_PITCH_OFFSET);
}

/**
 * Sample-by-sample model of the QL's one-bit IPC sound generator.
 *
 * It deliberately has no Web Audio dependencies, so protocol and waveform
 * behaviour remain deterministic and can be regression-tested in Node.
 */
export class QLSoundSynthesizer {
  constructor({ sampleRate, random = Math.random, amplitude = 0.16 } = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("A frequência de amostragem deve ser positiva.");
    }
    this.sampleRate = sampleRate;
    this.random = random;
    this.amplitude = amplitude;
    this.stop();
  }

  start(sound) {
    this.sound = sound;
    this.active = true;
    this.paused = false;
    this.remainingSamples = sound.duration === 0
      ? Number.POSITIVE_INFINITY
      : sound.duration * this.sampleRate / QL_SOUND_TICK_HZ;
    this.direction = 1;
    this.wrapRemaining = sound.wrap;
    this.currentPitch = sound.step < 0 ? sound.pitch2 : sound.pitch;
    this.randomOffset = 0;
    this.fuzzOffset = 0;
    this.pitchSamplesRemaining = this.pitchDurationSamples();
    this.waveState = -1;
    this.halfCyclePosition = 0;
    this.updateHalfCycle();
  }

  stop() {
    this.sound = null;
    this.active = false;
    this.paused = false;
    this.remainingSamples = 0;
    this.pitchSamplesRemaining = 0;
    this.halfCyclePosition = 0;
    this.waveState = 0;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  pitchDurationSamples() {
    if (this.sound.interval !== 0) {
      const samples = this.sound.interval * this.sampleRate / QL_SOUND_TICK_HZ;
      return Number.isFinite(this.remainingSamples)
        ? Math.min(samples, this.remainingSamples)
        : samples;
    }
    return this.remainingSamples;
  }

  updateHalfCycle() {
    const pitch = (this.currentPitch + this.randomOffset + this.fuzzOffset) & 0xff;
    this.halfCycleSamples = this.sampleRate / (qlPitchFrequency(pitch) * 2);
  }

  fuzzAdjust() {
    this.fuzzOffset = this.sound.fuzziness > 7
      ? Math.floor(this.random() * (2 ** (this.sound.fuzziness - 7)))
      : 0;
    this.updateHalfCycle();
  }

  randomAdjust() {
    this.randomOffset = this.sound.randomness > 7
      ? Math.floor(this.random() * (2 ** (this.sound.randomness - 7)))
      : 0;
  }

  advancePitch() {
    const { pitch, pitch2, step, wrap } = this.sound;
    if (step !== 0) {
      if (step === -8) {
        this.currentPitch = (this.currentPitch + 248) & 0xff;
      } else {
        const candidate = (this.currentPitch + step * this.direction) & 0xff;
        if (candidate > pitch && candidate < pitch2) {
          this.currentPitch = candidate;
        } else if (this.wrapRemaining > 0) {
          this.currentPitch = step * this.direction < 0 ? pitch2 : pitch;
          if (this.wrapRemaining !== 15) this.wrapRemaining -= 1;
        } else {
          this.currentPitch = candidate;
          this.wrapRemaining = wrap;
          this.direction *= -1;
        }
      }
    }

    this.randomAdjust();
    this.updateHalfCycle();
    this.pitchSamplesRemaining = this.pitchDurationSamples();
  }

  render(target) {
    target.fill(0);
    if (!this.active || this.paused) return target;

    for (let index = 0; index < target.length && this.active; index += 1) {
      target[index] = this.waveState * this.amplitude;
      this.remainingSamples -= 1;
      this.pitchSamplesRemaining -= 1;
      this.halfCyclePosition += 1;

      if (this.halfCyclePosition >= this.halfCycleSamples) {
        this.waveState *= -1;
        this.halfCyclePosition = 0;
        this.fuzzAdjust();
      }

      if (this.remainingSamples <= 0) {
        this.stop();
      } else if (this.pitchSamplesRemaining <= 0) {
        this.advancePitch();
      }
    }
    return target;
  }
}
