const MC_STAT_ADDRESS = 0x18_063;
const SCREEN_BASE_0 = 0x20_000;
const SCREEN_BASE_1 = 0x28_000;
const SCREEN_BYTES = 32 * 1024;
const FRAME_WIDTH = 512;
const FRAME_HEIGHT = 256;
const DISPLAY_CONTROL_MASK = 0x8a;

const BLACK = Object.freeze([0x00, 0x00, 0x00, 0xff]);

function writePixel(frame, offset, red, green, blue) {
  frame[offset] = red ? 0xff : 0x00;
  frame[offset + 1] = green ? 0xff : 0x00;
  frame[offset + 2] = blue ? 0xff : 0x00;
  frame[offset + 3] = 0xff;
}

/**
 * Primeiro bloco do ZX8301: controlo do ecrã e conversão da display RAM.
 *
 * MC_STAT é write-only. Só os bits 1 (blank), 3 (MODE 8) e 7 (segundo
 * banco) têm significado documentado; os restantes ficam mascarados.
 */
export class ZX8301 {
  constructor() {
    this.reset();
  }

  reset() {
    this.displayControl = 0;
    this.displayControlWrites = 0;
  }

  // Motherboard RAM is shared with video/refresh, even outside the visible
  // frame. Each 480-clock line has 32 contended 12-clock slots (8 for the
  // ZX8301, 4 for the CPU), then 96 clocks of unrestricted CPU access.
  // A byte access must fit entirely in a CPU slot. Host rendering reads
  // bypass this method; only MC68008 bus accesses advance the clock.
  // Hardware measurements: Nasta, 29 Nov 2017, "Accessing video data":
  // https://theqlforum.com/viewtopic.php?start=50&t=1780
  ramWaitCycles(cycles) {
    const phase = cycles % 480;
    if (phase >= 384) return phase <= 476 ? 0 : 488 - phase;
    const slot = Math.floor(phase / 12) * 12;
    const available = slot + 8;
    if (phase <= available) return available - phase;
    return Math.min(slot + 20, 384) - phase;
  }

  handles(address) {
    return address === MC_STAT_ADDRESS;
  }

  read8() {
    return 0xff;
  }

  write8(address, value) {
    if (address !== MC_STAT_ADDRESS) return;
    this.displayControl = value & DISPLAY_CONTROL_MASK;
    this.displayControlWrites += 1;
  }

  get blanked() {
    return Boolean(this.displayControl & 0x02);
  }

  get mode() {
    return this.displayControl & 0x08 ? 8 : 4;
  }

  get screenBase() {
    return this.displayControl & 0x80 ? SCREEN_BASE_1 : SCREEN_BASE_0;
  }

  renderFrame(bus, { flashPhase = false, target } = {}) {
    const frame = target ?? new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * 4);
    if (!(frame instanceof Uint8ClampedArray) || frame.length !== FRAME_WIDTH * FRAME_HEIGHT * 4) {
      throw new RangeError("O frame RGBA deve ter exatamente 512 × 256 × 4 bytes.");
    }

    if (this.blanked) {
      for (let offset = 0; offset < frame.length; offset += 4) frame.set(BLACK, offset);
      return frame;
    }

    let output = 0;
    let input = this.screenBase;
    for (let y = 0; y < FRAME_HEIGHT; y += 1) {
      let flashing = false;
      let flashRed = false;
      let flashGreen = false;
      let flashBlue = false;

      for (let word = 0; word < 64; word += 1) {
        const high = bus.read8(input);
        const low = bus.read8(input + 1);
        input += 2;

        if (this.mode === 4) {
          for (let bit = 7; bit >= 0; bit -= 1) {
            const green = Boolean(high & (1 << bit));
            const red = Boolean(low & (1 << bit));
            writePixel(frame, output, red, green, red && green);
            output += 4;
          }
          continue;
        }

        for (let bit = 6; bit >= 0; bit -= 2) {
          const green = Boolean(high & (1 << (bit + 1)));
          const flash = Boolean(high & (1 << bit));
          const red = Boolean(low & (1 << (bit + 1)));
          const blue = Boolean(low & (1 << bit));
          const shownRed = flashPhase && flashing ? flashRed : red;
          const shownGreen = flashPhase && flashing ? flashGreen : green;
          const shownBlue = flashPhase && flashing ? flashBlue : blue;

          writePixel(frame, output, shownRed, shownGreen, shownBlue);
          writePixel(frame, output + 4, shownRed, shownGreen, shownBlue);
          output += 8;

          if (flash) {
            if (flashing) {
              flashing = false;
            } else {
              flashRed = red;
              flashGreen = green;
              flashBlue = blue;
              flashing = true;
            }
          }
        }
      }
    }
    return frame;
  }
}

export const ZX8301_DISPLAY = Object.freeze({
  mcStatAddress: MC_STAT_ADDRESS,
  screenBase0: SCREEN_BASE_0,
  screenBase1: SCREEN_BASE_1,
  screenBytes: SCREEN_BYTES,
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
});
