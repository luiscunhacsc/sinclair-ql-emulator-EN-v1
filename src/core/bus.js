const ADDRESS_MASK = 0x0f_ffff;
const INTERNAL_ROM_SIZE = 48 * 1024;
const INTERNAL_RAM_START = 0x20_000;
const INTERNAL_RAM_SIZE = 128 * 1024;

export class QLBus {
  constructor({ devices = [] } = {}) {
    this.rom = new Uint8Array(INTERNAL_ROM_SIZE);
    this.ram = new Uint8Array(INTERNAL_RAM_SIZE);
    this.romLoaded = false;
    this.devices = [];
    this.ramTiming = null;
    for (const device of devices) this.registerDevice(device);
  }

  registerDevice(device) {
    if (!device || typeof device.handles !== "function") {
      throw new TypeError("A device must implement handles(address).");
    }
    this.devices.push(device);
    if (typeof device.ramWaitCycles === "function") this.ramTiming = device;
    return device;
  }

  cpuAccessCycles(address, cycles) {
    const normalized = address & ADDRESS_MASK;
    const inRam = normalized >= INTERNAL_RAM_START
      && normalized < INTERNAL_RAM_START + INTERNAL_RAM_SIZE;
    return 4 + (inRam && this.ramTiming ? this.ramTiming.ramWaitCycles(cycles) : 0);
  }

  deviceAt(address) {
    return this.devices.find((device) => device.handles(address)) ?? null;
  }

  loadRom(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError("The ROM must be supplied as a Uint8Array.");
    }
    if (bytes.byteLength !== INTERNAL_ROM_SIZE) {
      throw new RangeError("The internal ROM must be exactly 48 KiB.");
    }
    this.rom.set(bytes);
    this.romLoaded = true;
  }

  resetRam() {
    this.ram.fill(0);
  }

  resetDevices() {
    for (const device of this.devices) device.reset?.();
  }

  tick(cycles) {
    for (const device of this.devices) device.tick?.(cycles);
  }

  get interruptLevel() {
    let level = 0;
    for (const device of this.devices) level = Math.max(level, device.interruptLevel ?? 0);
    return level;
  }

  loadRam(address, bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError("Data must be supplied as a Uint8Array.");
    }
    const normalized = address & ADDRESS_MASK;
    const offset = normalized - INTERNAL_RAM_START;
    if (offset < 0 || offset + bytes.byteLength > INTERNAL_RAM_SIZE) {
      throw new RangeError("The block does not fit in the QL’s internal RAM.");
    }
    this.ram.set(bytes, offset);
  }

  read8(address) {
    const normalized = address & ADDRESS_MASK;
    if (normalized < INTERNAL_ROM_SIZE) return this.rom[normalized];
    const device = this.deviceAt(normalized);
    if (device) return device.read8?.(normalized) ?? 0xff;
    if (
      normalized >= INTERNAL_RAM_START &&
      normalized < INTERNAL_RAM_START + INTERNAL_RAM_SIZE
    ) {
      return this.ram[normalized - INTERNAL_RAM_START];
    }
    return 0xff;
  }

  write8(address, value) {
    const normalized = address & ADDRESS_MASK;
    const device = this.deviceAt(normalized);
    if (device) {
      device.write8?.(normalized, value & 0xff);
      return;
    }
    if (
      normalized >= INTERNAL_RAM_START &&
      normalized < INTERNAL_RAM_START + INTERNAL_RAM_SIZE
    ) {
      this.ram[normalized - INTERNAL_RAM_START] = value & 0xff;
    }
  }

  read16(address) {
    return (this.read8(address) << 8) | this.read8(address + 1);
  }

  read32(address) {
    return (this.read16(address) * 0x1_0000 + this.read16(address + 2)) >>> 0;
  }

  write16(address, value) {
    this.write8(address, value >>> 8);
    this.write8(address + 1, value);
  }

  write32(address, value) {
    this.write16(address, value >>> 16);
    this.write16(address + 2, value);
  }
}

export const QL_MEMORY = Object.freeze({
  addressMask: ADDRESS_MASK,
  internalRomSize: INTERNAL_ROM_SIZE,
  internalRamStart: INTERNAL_RAM_START,
  internalRamSize: INTERNAL_RAM_SIZE,
});
