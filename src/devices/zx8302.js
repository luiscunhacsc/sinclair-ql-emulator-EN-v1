import { MicrodriveImage, MICRODRIVE_FORMAT, MICRODRIVE_COUNT } from "./microdrive.js";
import { decodeIpcSoundBits, QL_SOUND_TICK_HZ } from "./ql-sound.js";

const TRANSMIT_CONTROL = 0x18_002;
const IPC_WRITE = 0x18_003;
const IPC_READ = 0x18_020;
const INTERRUPT_REGISTER = 0x18_021;
const MICRODRIVE_TRACK_1 = 0x18_022;
const MICRODRIVE_TRACK_2 = 0x18_023;

// With no Microdrive running, the GAP input is high.  COMCTL (bit 6) is low
// once the IPC has consumed the bit; bit 7 is the return bit from the IPC.
const IDLE_IPC_STATUS = 0x08;
const FRAME_INTERRUPT = 0x08;
const GAP_INTERRUPT = 0x01;
const GAP_INTERRUPT_MASK = 0x20;
const IPC_STATUS_COMMAND = 0x01;
const IPC_READ_SERIAL_1_COMMAND = 0x06;
const IPC_READ_SERIAL_2_COMMAND = 0x07;
const IPC_READ_KEYBOARD_COMMAND = 0x08;
const IPC_DIRECT_KEYBOARD_COMMAND = 0x09;
const IPC_SOUND_COMMAND = 0x0a;
const IPC_STOP_SOUND_COMMAND = 0x0b;
const IPC_MDV_SENSITIVITY_COMMAND = 0x0c;
const IPC_BAUD_COMMAND = 0x0d;
const IPC_RANDOM_COMMAND = 0x0e;
const IPC_TEST_COMMAND = 0x0f;
const CPU_HZ = 7_500_000;
const FRAME_HZ = 50;
const FRAME_CYCLES = CPU_HZ / FRAME_HZ;
const MICRODRIVE_MODE = 0x10;
const MODE_MASK = 0x18;
const MICRODRIVE_READ_READY = 0x04;
const MICRODRIVE_GAP = 0x08;
const MICRODRIVE_GAP_POLLS = 24;
// One sector: two 2.84 ms gaps and 652 bytes at the nominal 40 us/byte.
// Servicing a sector every 5 ms ran the ROM's motor rundown counter too fast:
// DELETE could update its buffers after the drive had already stopped.
const MICRODRIVE_GAP_CYCLES = CPU_HZ * 0.03176;
const MICRODRIVE_DRIVE_COUNT = MICRODRIVE_COUNT;
const SERIAL_BAUD = [19200, 9600, 4800, 2400, 1200, 600, 300, 75];
const SERIAL_CAPACITY = 8192;

/**
 * Initial ZX8302 peripheral-controller register block.
 *
 * Models the synchronous IPC link, keyboard and virtual SER1/SER2 byte queues.
 * Sound commands are decoded and exposed to a host audio adapter. Serial
 * transmission is timed; electrical signalling and receive parity are not.
 */
export class ZX8302 {
  constructor({ onSound = null, onSerial = null } = {}) {
    this.onSound = onSound;
    this.onSerial = onSerial;
    this.microdrives = Array(MICRODRIVE_DRIVE_COUNT).fill(null);
    this.reset();
  }

  reset() {
    const soundWasActive = this.soundActive;
    this.transmitControl = 0;
    this.interruptMask = 0;
    this.ipcWrite = 0;
    this.ipcWrites = 0;
    this.ipcCommandBits = [];
    this.ipcArgumentBits = [];
    this.ipcArgumentBitsRemaining = 0;
    this.ipcCommand = null;
    this.ipcResponseBits = [];
    this.ipcReturnBit = 0;
    this.keyboardQueue = [];
    this.keyboardMatrix = new Uint8Array(8);
    this.serialReceive = [[], []];
    this.serialOpen = [false, false];
    this.serialTransmit = null;
    this.serialTransmitCycles = 0;
    this.serialBaudCode = 0;
    this.pendingInterrupts = 0;
    this.frameCycleAccumulator = 0;
    this.soundActive = false;
    this.sound = null;
    this.soundCyclesRemaining = 0;
    this.activeMicrodrive = 0;
    this.microdriveSelection = 0;
    this.microdrivePositions = Array(MICRODRIVE_DRIVE_COUNT).fill(0);
    this.microdriveControl = -1;
    this.microdrivePhase = "header-gap";
    this.microdriveGapPolls = 0;
    this.microdriveReadyPolls = 0;
    this.microdriveStreamRegion = null;
    this.microdriveDataOffset = 0;
    this.microdrivePhysicalOffset = 0;
    this.microdriveWriting = false;
    this.microdriveFormatting = false;
    this.microdriveSector = 0;
    this.microdriveAdvanceSectorPending = false;
    this.microdriveDataReads = 0;
    this.microdriveDataWrites = 0;
    this.microdriveGapCycleAccumulator = 0;
    if (soundWasActive) this.emitSound({ type: "stop", reason: "reset" });
  }

  handles(address) {
    return address === TRANSMIT_CONTROL
      || address === IPC_WRITE
      || address === IPC_READ
      || address === INTERRUPT_REGISTER
      || address === MICRODRIVE_TRACK_1
      || address === MICRODRIVE_TRACK_2;
  }

  read8(address) {
    if (address === IPC_READ) return this.readSharedStatus();
    if (address === INTERRUPT_REGISTER) return this.pendingInterrupts;
    if (address === MICRODRIVE_TRACK_1 || address === MICRODRIVE_TRACK_2) {
      return this.readMicrodriveData();
    }
    return 0xff;
  }

  write8(address, value) {
    if (address === TRANSMIT_CONTROL) {
      this.transmitControl = value & 0xff;
    } else if (address === IPC_WRITE) {
      this.ipcWrite = value & 0xff;
      this.ipcWrites += 1;
      this.receiveIpcBit(value);
    } else if (address === IPC_READ) {
      this.writeMicrodriveControl(value);
    } else if (address === INTERRUPT_REGISTER) {
      // Bits 7..5 are masks; writing ones to bits 4..0 acknowledges sources.
      this.interruptMask = value & 0xe0;
      this.pendingInterrupts &= ~(value & 0x1f);
      // With no cartridge inserted the GAP input remains asserted. Enabling
      // its source therefore requests service immediately, as on a real QL.
      if ((this.interruptMask & GAP_INTERRUPT_MASK) && !this.microdrives.some(Boolean)) {
        this.pendingInterrupts |= GAP_INTERRUPT;
      }
    } else if (address === MICRODRIVE_TRACK_1 || address === MICRODRIVE_TRACK_2) {
      if (address === MICRODRIVE_TRACK_1 && !(this.transmitControl & 0x10)) {
        if (!this.serialTransmit) {
          this.serialTransmit = { port: (this.transmitControl & 8) ? 2 : 1, byte: value & 255 };
          this.serialTransmitCycles = CPU_HZ * 11 / SERIAL_BAUD[this.transmitControl & 7];
        }
      } else this.writeMicrodriveData(value);
    }
  }

  // Host-side bounded receive spool; IPC reads deliver at most 20 bytes at a time.
  // This is a virtual cable, not an electrical/parity simulation of an 8049.
  receiveSerial(port, bytes) {
    if (port !== 1 && port !== 2) throw new RangeError("Serial port must be 1 or 2.");
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Serial data must be bytes.");
    const queue = this.serialReceive[port - 1];
    if (!this.serialOpen[port - 1]) return false;
    if (queue.length + bytes.length > SERIAL_CAPACITY) return false;
    queue.push(...bytes);
    return true;
  }

  mountMicrodrive(
    slot,
    bytes,
    {
      name = `mdv${slot}.mdv`,
      writeProtected = true,
      physicalSectorCount = MICRODRIVE_FORMAT.sectorCount,
      spliceSector = null,
    } = {},
  ) {
    this.validateMicrodriveSlot(slot);
    const image = bytes instanceof MicrodriveImage
      ? bytes
      : new MicrodriveImage(bytes, {
        name,
        writeProtected,
        physicalSectorCount,
        spliceSector,
      });
    this.microdrives[slot - 1] = image;
    this.microdrivePositions[slot - 1] = 0;
    if (this.activeMicrodrive === slot) this.resetMicrodriveStream();
    return image;
  }

  unmountMicrodrive(slot) {
    this.validateMicrodriveSlot(slot);
    const image = this.microdrives[slot - 1];
    this.microdrives[slot - 1] = null;
    this.microdrivePositions[slot - 1] = 0;
    if (this.activeMicrodrive === slot) this.resetMicrodriveStream();
    return image;
  }

  microdriveAt(slot) {
    this.validateMicrodriveSlot(slot);
    return this.microdrives[slot - 1];
  }

  validateMicrodriveSlot(slot) {
    if (!Number.isInteger(slot) || slot < 1 || slot > MICRODRIVE_DRIVE_COUNT) {
      throw new RangeError("O número do Microdrive deve ser 1 ou 2.");
    }
  }

  readSharedStatus() {
    const ipcBit = this.ipcReturnBit << 7;
    if ((this.transmitControl & MODE_MASK) !== MICRODRIVE_MODE) {
      return IDLE_IPC_STATUS | ipcBit | (this.serialTransmit ? 2 : 0);
    }

    if (this.activeMicrodrive === 0) return ipcBit;
    if (!this.microdrives[this.activeMicrodrive - 1]) return ipcBit;
    if (this.microdriveWriting) return ipcBit;

    if (this.microdrivePhase === "header-gap" || this.microdrivePhase === "record-gap") {
      if (
        this.microdrivePhase === "header-gap"
        && this.microdriveGapPolls === 0
        && this.microdriveAdvanceSectorPending
      ) {
        this.advanceMicrodriveSector();
        this.microdriveAdvanceSectorPending = false;
      }
      const status = this.microdriveGapPolls === 0 ? MICRODRIVE_GAP : 0;
      this.microdriveGapPolls += 1;
      if (this.microdriveGapPolls > MICRODRIVE_GAP_POLLS) {
        this.microdrivePhase = this.microdrivePhase === "header-gap" ? "header" : "record";
        this.microdriveGapPolls = 0;
        this.microdriveReadyPolls = 0;
        this.microdriveStreamRegion = this.microdrivePhase;
        this.microdriveDataOffset = 0;
        this.microdrivePhysicalOffset = this.microdrivePhase === "header"
          ? MICRODRIVE_FORMAT.headerPreambleSize
          : MICRODRIVE_FORMAT.headerPreambleSize
            + MICRODRIVE_FORMAT.headerSize
            + MICRODRIVE_FORMAT.dataPreambleSize;
      }
      return status | ipcBit;
    }

    this.microdriveReadyPolls += 1;
    const readyPollLimit = this.microdrivePhase === "header"
      ? MICRODRIVE_FORMAT.headerSize
      : MICRODRIVE_FORMAT.recordSize;
    if (this.microdriveReadyPolls >= readyPollLimit) {
      if (this.microdrivePhase === "record") this.microdriveAdvanceSectorPending = true;
      this.microdrivePhase = this.microdrivePhase === "header" ? "record-gap" : "header-gap";
      this.microdriveReadyPolls = 0;
      this.microdriveGapPolls = 0;
    }
    return MICRODRIVE_READ_READY | ipcBit;
  }

  readMicrodriveData() {
    if ((this.transmitControl & MODE_MASK) !== MICRODRIVE_MODE) return 0;
    const image = this.microdrives[this.activeMicrodrive - 1];
    if (!image) return 0;

    let value = 0;
    if (
      this.microdriveStreamRegion === "header"
      && this.microdriveDataOffset < MICRODRIVE_FORMAT.headerSize
    ) {
      value = image.readHeaderByte(this.microdriveSector, this.microdriveDataOffset);
      this.microdriveDataOffset += 1;
      this.microdrivePhysicalOffset += 1;
      this.microdriveDataReads += 1;
    } else if (
      this.microdriveStreamRegion === "record"
      && this.microdriveDataOffset < MICRODRIVE_FORMAT.recordSize
    ) {
      value = image.readRecordByte(this.microdriveSector, this.microdriveDataOffset);
      this.microdriveDataOffset += 1;
      this.microdrivePhysicalOffset += 1;
      this.microdriveDataReads += 1;
    }

    // Reading either track consumes a byte. Extra status checks must not
    // prematurely end a header (some loaders poll more than once per byte).
    this.microdriveReadyPolls = 0;
    const length = this.microdriveStreamRegion === "header"
      ? MICRODRIVE_FORMAT.headerSize : MICRODRIVE_FORMAT.recordSize;
    if (this.microdrivePhase === this.microdriveStreamRegion && this.microdriveDataOffset === length) {
      if (this.microdrivePhase === "record") this.microdriveAdvanceSectorPending = true;
      this.microdrivePhase = this.microdrivePhase === "header" ? "record-gap" : "header-gap";
      this.microdriveGapPolls = 0;
    }
    return value;
  }

  writeMicrodriveData(value) {
    if ((this.transmitControl & MODE_MASK) !== MICRODRIVE_MODE || !this.microdriveWriting) return;
    const image = this.microdrives[this.activeMicrodrive - 1];
    if (!image || this.microdrivePhysicalOffset >= MICRODRIVE_FORMAT.sectorSize) return;
    if (!this.microdriveFormatting && this.microdriveStreamRegion === null && this.microdrivePhysicalOffset === 0) {
      image.prepareFormat();
      if (!image.writeProtected) this.microdriveSector = 0;
      this.microdriveFormatting = true;
    }
    const written = image.writePhysicalByte(this.microdriveSector, this.microdrivePhysicalOffset, value);
    this.microdrivePhysicalOffset += 1;
    if (written) this.microdriveDataWrites += 1;
  }

  advanceMicrodriveSector() {
    const image = this.microdrives[this.activeMicrodrive - 1];
    const sectorCount = image?.physicalSectorCount ?? MICRODRIVE_FORMAT.sectorCount;
    this.microdriveSector = (this.microdriveSector + 1) % sectorCount;
  }

  writeMicrodriveControl(value) {
    const control = value & 0x0f;
    const previous = this.microdriveControl;

    if (previous >= 0 && (previous & 2) && !(control & 2)) {
      // COMMS clock falling edge shifts the select bit through the two drives.
      // Erase/write bits are independent of this chain.
      this.microdriveSelection = ((this.microdriveSelection << 1) | (control & 1)) & ((1 << MICRODRIVE_COUNT) - 1);
      const first = Array.from({ length: MICRODRIVE_DRIVE_COUNT }, (_, i) => i + 1)
        .find((slot) => this.microdriveSelection & (1 << (slot - 1))) ?? 0;
      this.selectMicrodrive(first);
    } else if (
      previous === 0x02
      && control === 0x02
      && this.microdriveStreamRegion === "record"
      && this.microdriveDataOffset === 4
    ) {
      // QDOS reads the four-byte block header, then asks the controller to
      // skip the eight-byte PLL preamble before the 512-byte payload.
      this.microdriveDataOffset += 8;
      this.microdrivePhysicalOffset += 8;
    }

    if (control === 0x0a) {
      this.microdriveWriting = false;
      if (this.microdrivePhysicalOffset > 0x40) {
        this.advanceMicrodriveSector();
        this.microdrivePhysicalOffset = 0;
        this.microdriveAdvanceSectorPending = false;
      }
    } else if (control === 0x0e) {
      this.microdriveWriting = true;
    } else if (control === 0x00 || control === 0x02) {
      this.microdriveWriting = false;
    }

    this.microdriveControl = control;
  }

  selectMicrodrive(slot) {
    if (this.activeMicrodrive) this.microdrivePositions[this.activeMicrodrive - 1] = this.microdriveSector;
    this.activeMicrodrive = slot;
    this.resetMicrodriveStream();
  }

  resetMicrodriveStream() {
    this.microdrivePhase = "header-gap";
    this.microdriveGapPolls = 0;
    this.microdriveReadyPolls = 0;
    this.microdriveStreamRegion = null;
    this.microdriveDataOffset = 0;
    this.microdrivePhysicalOffset = 0;
    this.microdriveWriting = false;
    this.microdriveFormatting = false;
    this.microdriveSector = this.microdrivePositions[this.activeMicrodrive - 1] ?? 0;
    this.microdriveAdvanceSectorPending = false;
    this.microdriveGapCycleAccumulator = 0;
  }

  enqueueKey(keyrow, { shift = false, control = false, alt = false } = {}) {
    if (!Number.isInteger(keyrow) || keyrow < 0 || keyrow > 0x3f) {
      throw new RangeError("A tecla do QL deve estar entre 0 e 63.");
    }
    const modifiers = (shift ? 0x04 : 0) | (control ? 0x02 : 0) | (alt ? 0x01 : 0);
    this.keyboardQueue.push({ keyrow, modifiers });
  }

  clearKeyboardQueue() {
    this.keyboardQueue.length = 0;
  }

  setKeyboardState(keycodes) {
    const rows = new Uint8Array(8);
    for (const keycode of keycodes) {
      if (!Number.isInteger(keycode) || keycode < 0 || keycode > 63) {
        throw new RangeError("A tecla do QL deve estar entre 0 e 63.");
      }
      // IPC key codes enumerate the matrix from row 7 down to row 0.
      rows[7 - (keycode >>> 3)] |= 1 << (keycode & 7);
    }
    this.keyboardMatrix = rows;
  }

  receiveIpcBit(value) {
    // Normal transfers use %110x in the low nibble. The boot-time $01 write
    // is an electrical initialisation pulse rather than a protocol bit.
    if ((value & 0x0d) !== 0x0c) return;

    if (this.ipcResponseBits.length > 0) {
      this.ipcReturnBit = this.ipcResponseBits.shift();
      return;
    }

    this.ipcReturnBit = 0;
    const bit = (value >>> 1) & 1;
    if (this.ipcArgumentBitsRemaining > 0) {
      this.ipcArgumentBits.push(bit);
      this.ipcArgumentBitsRemaining -= 1;
      if (this.ipcArgumentBitsRemaining === 0) this.finishIpcArguments();
      return;
    }

    this.ipcCommandBits.push(bit);
    if (this.ipcCommandBits.length < 4) return;
    const command = this.bitsToNumber(this.ipcCommandBits);
    this.ipcCommandBits = [];
    this.startIpcCommand(command);
  }

  startIpcCommand(command) {
    this.ipcCommand = command;
    if (command === IPC_STATUS_COMMAND) {
      const status = (this.keyboardQueue.length > 0 ? 0x01 : 0)
        | (this.soundActive ? 0x02 : 0)
        | (this.serialReceive[0].length ? 0x10 : 0)
        | (this.serialReceive[1].length ? 0x20 : 0);
      this.setIpcResponse(status, 8);
    } else if (command >= 2 && command <= 5) {
      const port = command & 1;
      this.serialOpen[port] = command < 4;
      if (command >= 4) this.serialReceive[port] = [];
      this.ipcCommand = null;
    } else if (command === IPC_READ_KEYBOARD_COMMAND) {
      const keys = this.keyboardQueue.splice(0, 7);
      this.ipcResponseBits.push(...this.numberToBits(keys.length, 4));
      for (const key of keys) {
        this.ipcResponseBits.push(...this.numberToBits(key.modifiers, 4));
        this.ipcResponseBits.push(...this.numberToBits(key.keyrow, 8));
      }
      this.ipcCommand = null;
    } else if (command === IPC_READ_SERIAL_1_COMMAND || command === IPC_READ_SERIAL_2_COMMAND) {
      const bytes = this.serialReceive[command - IPC_READ_SERIAL_1_COMMAND].splice(0, 20);
      this.setIpcResponse(bytes.length, 8);
      for (const byte of bytes) this.ipcResponseBits.push(...this.numberToBits(byte, 8));
    } else if (command === IPC_DIRECT_KEYBOARD_COMMAND) {
      this.expectIpcArguments(4);
    } else if (command === IPC_SOUND_COMMAND) {
      this.expectIpcArguments(64);
    } else if (command === IPC_STOP_SOUND_COMMAND) {
      this.stopSound("command");
      this.ipcCommand = null;
    } else if (command === IPC_MDV_SENSITIVITY_COMMAND || command === IPC_BAUD_COMMAND) {
      this.expectIpcArguments(4);
    } else if (command === IPC_RANDOM_COMMAND) {
      this.setIpcResponse(0, 16);
    } else if (command === IPC_TEST_COMMAND) {
      this.expectIpcArguments(8);
    } else {
      this.ipcCommand = null;
    }
  }

  expectIpcArguments(count) {
    this.ipcArgumentBits = [];
    this.ipcArgumentBitsRemaining = count;
  }

  finishIpcArguments() {
    const bits = this.ipcArgumentBits;
    this.ipcArgumentBits = [];
    if (this.ipcCommand === IPC_DIRECT_KEYBOARD_COMMAND) {
      this.setIpcResponse(this.keyboardMatrix[this.bitsToNumber(bits)] ?? 0, 8);
    }
    else if (this.ipcCommand === IPC_SOUND_COMMAND) {
      this.startSound(decodeIpcSoundBits(bits));
      this.ipcCommand = null;
    } else if (this.ipcCommand === IPC_TEST_COMMAND) {
      this.setIpcResponse(this.bitsToNumber(bits), 8);
    }
    else {
      if (this.ipcCommand === IPC_BAUD_COMMAND) this.serialBaudCode = this.bitsToNumber(bits) & 7;
      this.ipcCommand = null;
    }
  }

  startSound(sound) {
    this.sound = sound;
    this.soundActive = true;
    this.soundCyclesRemaining = sound.duration === 0
      ? Number.POSITIVE_INFINITY
      : sound.duration * CPU_HZ / QL_SOUND_TICK_HZ;
    this.emitSound({ type: "start", sound });
  }

  stopSound(reason = "command") {
    const wasActive = this.soundActive;
    this.soundActive = false;
    this.sound = null;
    this.soundCyclesRemaining = 0;
    if (wasActive || reason === "command") this.emitSound({ type: "stop", reason });
  }

  emitSound(event) {
    if (typeof this.onSound === "function") this.onSound(Object.freeze(event));
  }

  setIpcResponse(value, width) {
    this.ipcResponseBits.push(...this.numberToBits(value, width));
    this.ipcCommand = null;
  }

  numberToBits(value, width) {
    return Array.from({ length: width }, (_, index) => (value >>> (width - index - 1)) & 1);
  }

  bitsToNumber(bits) {
    return bits.reduce((value, bit) => (value << 1) | bit, 0) >>> 0;
  }

  tick(cycles) {
    if (!Number.isFinite(cycles) || cycles < 0) {
      throw new RangeError("O avanço do ZX8302 requer um número de ciclos não negativo.");
    }
    this.frameCycleAccumulator += cycles;
    if (this.serialTransmit) {
      this.serialTransmitCycles -= cycles;
      if (this.serialTransmitCycles <= 0) {
        const event = this.serialTransmit;
        this.serialTransmit = null;
        if (this.interruptMask & 0x80) this.pendingInterrupts |= 4;
        this.onSerial?.(Object.freeze(event));
      }
    }
    if (this.soundActive && Number.isFinite(this.soundCyclesRemaining)) {
      this.soundCyclesRemaining -= cycles;
      if (this.soundCyclesRemaining <= 0) this.stopSound("duration");
    }
    if (this.frameCycleAccumulator >= FRAME_CYCLES) {
      this.frameCycleAccumulator %= FRAME_CYCLES;
      this.pendingInterrupts |= FRAME_INTERRUPT;
    }

    if (this.activeMicrodrive > 0) {
      this.microdriveGapCycleAccumulator += cycles;
      if (this.microdriveGapCycleAccumulator >= MICRODRIVE_GAP_CYCLES) {
        this.microdriveGapCycleAccumulator %= MICRODRIVE_GAP_CYCLES;
        if (this.interruptMask & GAP_INTERRUPT_MASK) this.pendingInterrupts |= GAP_INTERRUPT;
      }
    } else {
      this.microdriveGapCycleAccumulator = 0;
    }
  }

  get interruptLevel() {
    return this.pendingInterrupts ? 2 : 0;
  }
}

export const ZX8302_REGISTERS = Object.freeze({
  transmitControl: TRANSMIT_CONTROL,
  ipcWrite: IPC_WRITE,
  ipcRead: IPC_READ,
  microdriveControl: IPC_READ,
  interrupt: INTERRUPT_REGISTER,
  idleIpcStatus: IDLE_IPC_STATUS,
  frameInterrupt: FRAME_INTERRUPT,
  gapInterrupt: GAP_INTERRUPT,
  gapInterruptMask: GAP_INTERRUPT_MASK,
  frameCycles: FRAME_CYCLES,
  microdriveTrack1: MICRODRIVE_TRACK_1,
  microdriveTrack2: MICRODRIVE_TRACK_2,
  microdriveMode: MICRODRIVE_MODE,
  microdriveReadReady: MICRODRIVE_READ_READY,
  microdriveGap: MICRODRIVE_GAP,
  microdriveGapPolls: MICRODRIVE_GAP_POLLS,
  microdriveGapCycles: MICRODRIVE_GAP_CYCLES,
});
