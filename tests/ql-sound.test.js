import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeIpcSoundBits,
  qlPitchFrequency,
  QL_SOUND_TICK_HZ,
  QLSoundSynthesizer,
} from "../src/devices/ql-sound.js";

function bytesToBits(bytes) {
  return bytes.flatMap((value) => (
    Array.from({ length: 8 }, (_, index) => (value >>> (7 - index)) & 1)
  ));
}

test("descodifica o bloco IPC de som, incluindo words little-endian e nibbles assinados", () => {
  assert.deepEqual(
    decodeIpcSoundBits(bytesToBits([21, 81, 0x34, 0x12, 0x78, 0x56, 0xe3, 0x9a])),
    {
      pitch: 21,
      pitch2: 81,
      interval: 0x1234,
      duration: 0x5678,
      step: -2,
      wrap: 3,
      randomness: 9,
      fuzziness: 10,
    },
  );
  assert.throws(() => decodeIpcSoundBits([0, 1]), RangeError);
});

test("converte o pitch transmitido pela ROM na frequência fundamental do QL", () => {
  assert.ok(Math.abs(qlPitchFrequency(1) - 1_312.98) < 0.01);
  assert.ok(Math.abs(qlPitchFrequency(21) - 395.90) < 0.01);
});

test("o sintetizador produz uma onda quadrada e respeita duração e pausa", () => {
  const synth = new QLSoundSynthesizer({ sampleRate: QL_SOUND_TICK_HZ, amplitude: 0.25 });
  synth.start({
    pitch: 21,
    pitch2: 21,
    interval: 0,
    duration: 4,
    step: 0,
    wrap: 0,
    randomness: 0,
    fuzziness: 0,
  });

  synth.setPaused(true);
  assert.deepEqual([...synth.render(new Float32Array(2))], [0, 0]);
  assert.equal(synth.remainingSamples, 4);
  synth.setPaused(false);
  assert.deepEqual([...synth.render(new Float32Array(4))], [-0.25, -0.25, -0.25, -0.25]);
  assert.equal(synth.active, false);
});

test("o sintetizador aplica gradiente ao fim do intervalo indicado", () => {
  const synth = new QLSoundSynthesizer({ sampleRate: QL_SOUND_TICK_HZ });
  synth.start({
    pitch: 20,
    pitch2: 80,
    interval: 2,
    duration: 20,
    step: 3,
    wrap: 0,
    randomness: 0,
    fuzziness: 0,
  });

  synth.render(new Float32Array(2));
  assert.equal(synth.currentPitch, 23);
  synth.stop();
  assert.equal(synth.active, false);
});

test("randomness e fuzziness só atuam quando o bit de ativação está definido", () => {
  const randomSynth = new QLSoundSynthesizer({
    sampleRate: QL_SOUND_TICK_HZ,
    random: () => 0.99,
  });
  randomSynth.start({
    pitch: 1,
    pitch2: 80,
    interval: 1,
    duration: 20,
    step: 1,
    wrap: 0,
    randomness: 9,
    fuzziness: 7,
  });
  randomSynth.render(new Float32Array(1));
  assert.equal(randomSynth.randomOffset, 3);
  assert.equal(randomSynth.fuzzOffset, 0);

  const fuzzSynth = new QLSoundSynthesizer({
    sampleRate: QL_SOUND_TICK_HZ,
    random: () => 0.99,
  });
  fuzzSynth.start({ ...randomSynth.sound, interval: 0, step: 0, fuzziness: 9 });
  fuzzSynth.render(new Float32Array(6));
  assert.equal(fuzzSynth.fuzzOffset, 3);
});
