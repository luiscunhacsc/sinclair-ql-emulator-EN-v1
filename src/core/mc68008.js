const ADDRESS_MASK = 0x0f_ffff;
const SR_TRACE = 0x8000;
const SR_SUPERVISOR = 0x2000;
const SR_INTERRUPT_MASK = 0x0700;
const SR_EXTEND = 0x0010;
const SR_NEGATIVE = 0x0008;
const SR_ZERO = 0x0004;
const SR_OVERFLOW = 0x0002;
const SR_CARRY = 0x0001;
const SR_IMPLEMENTED = 0xa71f;
const SIZE_BYTE = 1;
const SIZE_WORD = 2;
const SIZE_LONG = 4;

export const M68K_VECTOR = Object.freeze({
  RESET_STACK_POINTER: 0,
  RESET_PROGRAM_COUNTER: 1,
  BUS_ERROR: 2,
  ADDRESS_ERROR: 3,
  ILLEGAL_INSTRUCTION: 4,
  DIVIDE_BY_ZERO: 5,
  CHK: 6,
  TRAPV: 7,
  PRIVILEGE_VIOLATION: 8,
  TRACE: 9,
  LINE_1010_EMULATOR: 10,
  LINE_1111_EMULATOR: 11,
  AUTOVECTOR_BASE: 24,
  TRAP_BASE: 32,
});

export const M68K_SR = Object.freeze({
  TRACE: SR_TRACE,
  SUPERVISOR: SR_SUPERVISOR,
  INTERRUPT_MASK: SR_INTERRUPT_MASK,
  EXTEND: SR_EXTEND,
  NEGATIVE: SR_NEGATIVE,
  ZERO: SR_ZERO,
  OVERFLOW: SR_OVERFLOW,
  CARRY: SR_CARRY,
});

export class AddressError extends Error {
  constructor(address, operation) {
    super(`Unaligned ${operation} access at 0x${address.toString(16)}.`);
    this.name = "AddressError";
    this.address = address >>> 0;
    this.operation = operation;
    this.vector = M68K_VECTOR.ADDRESS_ERROR;
  }
}

class IllegalEffectiveAddress extends Error {}

function signExtend8(value) {
  return value & 0x80 ? value | 0xffff_ff00 : value;
}

function signExtend16(value) {
  return value & 0x8000 ? value | 0xffff_0000 : value;
}

function maskForSize(size) {
  if (size === SIZE_BYTE) return 0xff;
  if (size === SIZE_WORD) return 0xffff;
  return 0xffff_ffff;
}

function signBitForSize(size) {
  if (size === SIZE_BYTE) return 0x80;
  if (size === SIZE_WORD) return 0x8000;
  return 0x8000_0000;
}

function sizeFromCode(code) {
  return [SIZE_BYTE, SIZE_WORD, SIZE_LONG][code] ?? null;
}

function signExtend(value, size) {
  if (size === SIZE_BYTE) return signExtend8(value);
  if (size === SIZE_WORD) return signExtend16(value);
  return value >>> 0;
}

function addPackedBcd(source, destination, extend) {
  const binary = destination + source + extend;
  let adjusted = binary;
  if ((destination & 0x0f) + (source & 0x0f) + extend > 9) adjusted += 0x06;
  const carry = binary > 0x99;
  if (carry) adjusted += 0x60;
  return { result: adjusted & 0xff, carry };
}

function subtractPackedBcd(source, destination, extend) {
  const binary = destination - source - extend;
  let adjusted = binary;
  if ((destination & 0x0f) - (source & 0x0f) - extend < 0) adjusted -= 0x06;
  const carry = binary < 0;
  if (carry) adjusted -= 0x60;
  return { result: adjusted & 0xff, carry };
}

export class MC68008 {
  constructor(bus) {
    this.bus = bus;
    this.d = new Uint32Array(8);
    this.a = new Uint32Array(8);
    this.pc = 0;
    this.sr = 0x2700;
    this.usp = 0;
    this.ssp = 0;
    this.cycles = 0;
    this.stopped = false;
    this.lastException = null;
    this.interruptLevel = 0;
    this.level7Pending = false;
  }

  reset() {
    this.d.fill(0);
    this.a.fill(0);
    this.sr = 0x2700;
    this.usp = 0;
    this.cycles = 0;
    this.stopped = false;
    this.lastException = null;
    this.interruptLevel = 0;
    this.level7Pending = false;
    this.ssp = this.read32(0);
    this.a[7] = this.ssp;
    this.pc = this.read32(4);
  }

  get supervisor() {
    return Boolean(this.sr & SR_SUPERVISOR);
  }

  setStatusRegister(value) {
    const next = value & SR_IMPLEMENTED;
    const wasSupervisor = this.supervisor;
    const willBeSupervisor = Boolean(next & SR_SUPERVISOR);

    if (wasSupervisor !== willBeSupervisor) {
      if (wasSupervisor) {
        this.ssp = this.a[7];
        this.a[7] = this.usp;
      } else {
        this.usp = this.a[7];
        this.a[7] = this.ssp;
      }
    }
    this.sr = next;
  }

  setInterruptLevel(level) {
    if (!Number.isInteger(level) || level < 0 || level > 7) {
      throw new RangeError("The interrupt level must be an integer between 0 and 7.");
    }
    if (level === 7 && this.interruptLevel !== 7) this.level7Pending = true;
    if (level !== 7 && this.interruptLevel === 7) this.level7Pending = false;
    this.interruptLevel = level;
  }

  pendingInterruptLevel() {
    if (this.interruptLevel === 7) return this.level7Pending ? 7 : 0;
    const mask = (this.sr & SR_INTERRUPT_MASK) >>> 8;
    return this.interruptLevel > mask ? this.interruptLevel : 0;
  }

  acceptInterrupt(level) {
    this.exception(M68K_VECTOR.AUTOVECTOR_BASE + level, this.pc);
    this.sr = (this.sr & ~SR_INTERRUPT_MASK) | (level << 8);
    if (level === 7) this.level7Pending = false;
  }

  read8(address) {
    this.cycles += this.bus.cpuAccessCycles?.(address, this.cycles) ?? 4;
    return this.bus.read8(address);
  }

  read16(address) {
    if (address & 1) throw new AddressError(address, "word");
    return (this.read8(address) << 8) | this.read8(address + 1);
  }

  read32(address) {
    if (address & 1) throw new AddressError(address, "long word");
    return (this.read16(address) * 0x1_0000 + this.read16(address + 2)) >>> 0;
  }

  write8(address, value) {
    this.cycles += this.bus.cpuAccessCycles?.(address, this.cycles) ?? 4;
    this.bus.write8(address, value);
  }

  write16(address, value) {
    if (address & 1) throw new AddressError(address, "word write");
    this.write8(address, value >>> 8);
    this.write8(address + 1, value);
  }

  write32(address, value) {
    if (address & 1) throw new AddressError(address, "long word write");
    this.write16(address, value >>> 16);
    this.write16(address + 2, value);
  }

  readSize(address, size) {
    if (size === SIZE_BYTE) return this.read8(address);
    if (size === SIZE_WORD) return this.read16(address);
    return this.read32(address);
  }

  writeSize(address, size, value) {
    if (size === SIZE_BYTE) this.write8(address, value);
    else if (size === SIZE_WORD) this.write16(address, value);
    else this.write32(address, value);
  }

  fetch16() {
    const value = this.read16(this.pc);
    this.pc = (this.pc + 2) >>> 0;
    return value;
  }

  push16(value) {
    this.a[7] = (this.a[7] - 2) >>> 0;
    this.write16(this.a[7], value);
  }

  push32(value) {
    this.a[7] = (this.a[7] - 4) >>> 0;
    this.write32(this.a[7], value);
  }

  pop16() {
    const value = this.read16(this.a[7]);
    this.a[7] = (this.a[7] + 2) >>> 0;
    return value;
  }

  pop32() {
    const value = this.read32(this.a[7]);
    this.a[7] = (this.a[7] + 4) >>> 0;
    return value;
  }

  writeDataRegister(register, size, value) {
    const mask = maskForSize(size);
    this.d[register] = size === SIZE_LONG
      ? value >>> 0
      : ((this.d[register] & ~mask) | (value & mask)) >>> 0;
  }

  indexValue(extension) {
    const register = (extension >>> 12) & 0x07;
    const fromAddressRegister = Boolean(extension & 0x8000);
    const isLong = Boolean(extension & 0x0800);
    const raw = fromAddressRegister ? this.a[register] : this.d[register];
    return isLong ? raw | 0 : signExtend16(raw & 0xffff);
  }

  memoryOperand(address, size, postIncrementRegister = null) {
    let adjusted = false;
    const adjust = () => {
      if (adjusted || postIncrementRegister === null) return;
      const increment = size === SIZE_BYTE && postIncrementRegister === 7 ? 2 : size;
      this.a[postIncrementRegister] = (this.a[postIncrementRegister] + increment) >>> 0;
      adjusted = true;
    };

    return {
      address: address >>> 0,
      read: () => {
        const value = this.readSize(address, size);
        adjust();
        return value;
      },
      write: (value) => {
        this.writeSize(address, size, value);
        adjust();
      },
    };
  }

  effectiveAddress(mode, register, size, { immediate = false, writable = false } = {}) {
    if (mode === 0) {
      return {
        read: () => this.d[register] & maskForSize(size),
        write: (value) => this.writeDataRegister(register, size, value),
      };
    }

    if (mode === 1) {
      if (size === SIZE_BYTE || writable) throw new IllegalEffectiveAddress();
      return { read: () => this.a[register] & maskForSize(size) };
    }

    let address;
    if (mode === 2) {
      address = this.a[register];
    } else if (mode === 3) {
      address = this.a[register];
      return this.memoryOperand(address, size, register);
    } else if (mode === 4) {
      const decrement = size === SIZE_BYTE && register === 7 ? 2 : size;
      this.a[register] = (this.a[register] - decrement) >>> 0;
      address = this.a[register];
    } else if (mode === 5) {
      address = (this.a[register] + signExtend16(this.fetch16())) >>> 0;
    } else if (mode === 6) {
      const extension = this.fetch16();
      address = (
        this.a[register] + this.indexValue(extension) + signExtend8(extension & 0xff)
      ) >>> 0;
    } else if (mode === 7 && register === 0) {
      address = signExtend16(this.fetch16()) >>> 0;
    } else if (mode === 7 && register === 1) {
      address = this.readImmediate(SIZE_LONG);
    } else if (mode === 7 && register === 2 && !writable) {
      const base = this.pc;
      address = (base + signExtend16(this.fetch16())) >>> 0;
    } else if (mode === 7 && register === 3 && !writable) {
      const base = this.pc;
      const extension = this.fetch16();
      address = (base + this.indexValue(extension) + signExtend8(extension & 0xff)) >>> 0;
    } else if (mode === 7 && register === 4 && immediate && !writable) {
      const value = this.readImmediate(size);
      return { read: () => value };
    } else {
      throw new IllegalEffectiveAddress();
    }

    return this.memoryOperand(address, size);
  }

  controlAddress(mode, register) {
    if (mode === 2) return this.a[register];
    if (mode === 5) return (this.a[register] + signExtend16(this.fetch16())) >>> 0;
    if (mode === 6) {
      const extension = this.fetch16();
      return (this.a[register] + this.indexValue(extension) + signExtend8(extension & 0xff)) >>> 0;
    }
    if (mode === 7 && register === 0) return signExtend16(this.fetch16()) >>> 0;
    if (mode === 7 && register === 1) return this.readImmediate(SIZE_LONG);
    if (mode === 7 && register === 2) {
      const base = this.pc;
      return (base + signExtend16(this.fetch16())) >>> 0;
    }
    if (mode === 7 && register === 3) {
      const base = this.pc;
      const extension = this.fetch16();
      return (base + this.indexValue(extension) + signExtend8(extension & 0xff)) >>> 0;
    }
    throw new IllegalEffectiveAddress();
  }

  readImmediate(size) {
    if (size === SIZE_BYTE) return this.fetch16() & 0xff;
    if (size === SIZE_WORD) return this.fetch16();
    const high = this.fetch16();
    return (high * 0x1_0000 + this.fetch16()) >>> 0;
  }

  exception(vector, stackedPc = this.pc) {
    const previousSr = this.sr;
    if (!this.supervisor) this.setStatusRegister(this.sr | SR_SUPERVISOR);
    this.sr &= ~SR_TRACE;
    this.push32(stackedPc);
    this.push16(previousSr);
    this.pc = this.read32(vector * 4);
    this.stopped = false;
    this.lastException = { vector, pc: stackedPc >>> 0 };
  }

  conditionTrue(condition) {
    const carry = Boolean(this.sr & SR_CARRY);
    const overflow = Boolean(this.sr & SR_OVERFLOW);
    const zero = Boolean(this.sr & SR_ZERO);
    const negative = Boolean(this.sr & SR_NEGATIVE);

    switch (condition & 0x0f) {
      case 0x0: return true;
      case 0x1: return false;
      case 0x2: return !carry && !zero;
      case 0x3: return carry || zero;
      case 0x4: return !carry;
      case 0x5: return carry;
      case 0x6: return !zero;
      case 0x7: return zero;
      case 0x8: return !overflow;
      case 0x9: return overflow;
      case 0xa: return !negative;
      case 0xb: return negative;
      case 0xc: return negative === overflow;
      case 0xd: return negative !== overflow;
      case 0xe: return !zero && negative === overflow;
      case 0xf: return zero || negative !== overflow;
      default: return false;
    }
  }

  executeBranch(opcode) {
    const condition = (opcode >>> 8) & 0x0f;
    const encodedDisplacement = opcode & 0xff;
    // 68000 word displacements are relative to the extension word address,
    // not to the PC after that word has been fetched.
    const displacementBase = this.pc;
    const displacement = encodedDisplacement === 0
      ? signExtend16(this.fetch16())
      : signExtend8(encodedDisplacement);
    const returnAddress = this.pc;

    if (condition === 1) {
      this.push32(returnAddress);
      this.pc = (displacementBase + displacement) >>> 0;
      this.cycles += 2;
    } else if (this.conditionTrue(condition)) {
      this.pc = (displacementBase + displacement) >>> 0;
      this.cycles += 2;
    } else {
      this.cycles += encodedDisplacement === 0 ? 4 : 0;
    }
  }

  executeMoveQ(opcode) {
    const register = (opcode >>> 9) & 0x07;
    const value = signExtend8(opcode & 0xff) >>> 0;
    this.d[register] = value;
    this.sr &= ~(SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (value === 0) this.sr |= SR_ZERO;
    if (value & 0x8000_0000) this.sr |= SR_NEGATIVE;
  }

  setLogicalFlags(value, size) {
    const result = value & maskForSize(size);
    this.sr &= ~(SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (result === 0) this.sr |= SR_ZERO;
    if (result & signBitForSize(size)) this.sr |= SR_NEGATIVE;
  }

  setAddFlags(source, destination, result, size) {
    const mask = maskForSize(size);
    const sign = signBitForSize(size);
    const src = (source & mask) >>> 0;
    const dst = (destination & mask) >>> 0;
    const res = (result & mask) >>> 0;
    const carry = src + dst > mask;
    const overflow = Boolean((~(dst ^ src) & (dst ^ res) & sign) >>> 0);

    this.sr &= ~(SR_EXTEND | SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (res === 0) this.sr |= SR_ZERO;
    if (res & sign) this.sr |= SR_NEGATIVE;
    if (overflow) this.sr |= SR_OVERFLOW;
    if (carry) this.sr |= SR_CARRY | SR_EXTEND;
  }

  setSubFlags(source, destination, result, size, affectExtend) {
    const mask = maskForSize(size);
    const sign = signBitForSize(size);
    const src = (source & mask) >>> 0;
    const dst = (destination & mask) >>> 0;
    const res = (result & mask) >>> 0;
    const carry = src > dst;
    const overflow = Boolean(((dst ^ src) & (dst ^ res) & sign) >>> 0);
    const preservedExtend = this.sr & SR_EXTEND;

    this.sr &= ~(SR_EXTEND | SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (!affectExtend) this.sr |= preservedExtend;
    if (res === 0) this.sr |= SR_ZERO;
    if (res & sign) this.sr |= SR_NEGATIVE;
    if (overflow) this.sr |= SR_OVERFLOW;
    if (carry) {
      this.sr |= SR_CARRY;
      if (affectExtend) this.sr |= SR_EXTEND;
    }
  }

  setExtendArithmeticFlags(source, destination, result, size, subtract, extend) {
    const mask = maskForSize(size);
    const sign = signBitForSize(size);
    const src = (source & mask) >>> 0;
    const dst = (destination & mask) >>> 0;
    const res = (result & mask) >>> 0;
    const carry = subtract ? src + extend > dst : src + dst + extend > mask;
    const overflow = subtract
      ? Boolean(((dst ^ src) & (dst ^ res) & sign) >>> 0)
      : Boolean((~(dst ^ src) & (dst ^ res) & sign) >>> 0);
    const oldZero = Boolean(this.sr & SR_ZERO);

    this.sr &= ~(SR_EXTEND | SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (res & sign) this.sr |= SR_NEGATIVE;
    if (oldZero && res === 0) this.sr |= SR_ZERO;
    if (overflow) this.sr |= SR_OVERFLOW;
    if (carry) this.sr |= SR_CARRY | SR_EXTEND;
  }

  setBcdFlags(result, carry) {
    const oldZero = Boolean(this.sr & SR_ZERO);
    this.sr &= ~(SR_EXTEND | SR_ZERO | SR_CARRY);
    if (oldZero && result === 0) this.sr |= SR_ZERO;
    if (carry) this.sr |= SR_CARRY | SR_EXTEND;
  }

  executeMove(opcode) {
    const size = opcode >>> 12 === 1
      ? SIZE_BYTE
      : opcode >>> 12 === 2
        ? SIZE_LONG
        : SIZE_WORD;
    const sourceMode = (opcode >>> 3) & 0x07;
    const sourceRegister = opcode & 0x07;
    const destinationMode = (opcode >>> 6) & 0x07;
    const destinationRegister = (opcode >>> 9) & 0x07;
    const validSource = sourceMode <= 6 || (sourceMode === 7 && sourceRegister <= 4);
    const validDestination = destinationMode === 0
      || (destinationMode >= 2 && destinationMode <= 6)
      || (destinationMode === 7 && destinationRegister <= 1)
      || (destinationMode === 1 && size !== SIZE_BYTE);
    if (!validSource || !validDestination || (sourceMode === 1 && size === SIZE_BYTE)) {
      throw new IllegalEffectiveAddress();
    }
    const source = this.effectiveAddress(sourceMode, sourceRegister, size, { immediate: true });
    const value = source.read();

    if (destinationMode === 1) {
      if (size === SIZE_BYTE) throw new IllegalEffectiveAddress();
      this.a[destinationRegister] = signExtend(value, size) >>> 0;
      return;
    }

    const destination = this.effectiveAddress(
      destinationMode,
      destinationRegister,
      size,
      { writable: true },
    );
    destination.write(value);
    this.setLogicalFlags(value, size);
  }

  executeLea(opcode) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    this.a[destinationRegister] = this.controlAddress(mode, register) >>> 0;
  }

  executeClr(opcode) {
    const size = sizeFromCode((opcode >>> 6) & 0x03);
    if (size === null) throw new IllegalEffectiveAddress();
    const destination = this.effectiveAddress(
      (opcode >>> 3) & 0x07,
      opcode & 0x07,
      size,
      { writable: true },
    );
    destination.write(0);
    this.setLogicalFlags(0, size);
  }

  executeTst(opcode) {
    const size = sizeFromCode((opcode >>> 6) & 0x03);
    if (size === null) throw new IllegalEffectiveAddress();
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    if (mode === 1 || (mode === 7 && register >= 2)) throw new IllegalEffectiveAddress();
    const source = this.effectiveAddress(mode, register, size);
    this.setLogicalFlags(source.read(), size);
  }

  executeUnary(opcode, operation) {
    const size = sizeFromCode((opcode >>> 6) & 0x03);
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (size === null || !validDestination) throw new IllegalEffectiveAddress();

    const destination = this.effectiveAddress(mode, register, size, { writable: true });
    const oldValue = destination.read() & maskForSize(size);
    if (operation === "not") {
      const result = ~oldValue;
      destination.write(result);
      this.setLogicalFlags(result, size);
      return;
    }

    const extend = operation === "negx" && Boolean(this.sr & SR_EXTEND) ? 1 : 0;
    const mask = maskForSize(size);
    const sign = signBitForSize(size);
    const source = (oldValue + extend) & mask;
    const result = (-oldValue - extend) & mask;
    const borrow = oldValue !== 0 || extend !== 0;
    const overflow = Boolean((source & result & sign) >>> 0);
    const oldZero = Boolean(this.sr & SR_ZERO);

    destination.write(result);
    this.sr &= ~(SR_EXTEND | SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (result & sign) this.sr |= SR_NEGATIVE;
    if (operation === "negx" ? oldZero && result === 0 : result === 0) this.sr |= SR_ZERO;
    if (overflow) this.sr |= SR_OVERFLOW;
    if (borrow) this.sr |= SR_CARRY | SR_EXTEND;
  }

  executeExt(opcode) {
    const register = opcode & 0x07;
    const toLong = Boolean(opcode & 0x0040);
    const size = toLong ? SIZE_LONG : SIZE_WORD;
    const result = toLong
      ? signExtend16(this.d[register] & 0xffff) >>> 0
      : signExtend8(this.d[register] & 0xff) & 0xffff;
    this.writeDataRegister(register, size, result);
    this.setLogicalFlags(result, size);
  }

  executeMovem(opcode) {
    const memoryToRegisters = Boolean(opcode & 0x0400);
    const size = opcode & 0x0040 ? SIZE_LONG : SIZE_WORD;
    const mode = (opcode >>> 3) & 0x07;
    const addressRegister = opcode & 0x07;
    const validAddress = memoryToRegisters
      ? mode === 2
        || mode === 3
        || mode === 5
        || mode === 6
        || (mode === 7 && addressRegister <= 3)
      : mode === 2
        || mode === 4
        || mode === 5
        || mode === 6
        || (mode === 7 && addressRegister <= 1);
    if (!validAddress) throw new IllegalEffectiveAddress();

    const registerMask = this.fetch16();

    if (mode === 4) {
      const dataRegisters = Uint32Array.from(this.d);
      const addressRegisters = Uint32Array.from(this.a);
      let address = this.a[addressRegister];

      for (let bit = 0; bit < 16; bit += 1) {
        if (!(registerMask & (1 << bit))) continue;
        address = (address - size) >>> 0;
        const registerIndex = 15 - bit;
        const value = registerIndex < 8
          ? dataRegisters[registerIndex]
          : addressRegisters[registerIndex - 8];
        this.writeSize(address, size, value);
      }

      this.a[addressRegister] = address;
      return;
    }

    const postIncrement = mode === 3;
    let address = postIncrement
      ? this.a[addressRegister]
      : this.controlAddress(mode, addressRegister);

    for (let registerIndex = 0; registerIndex < 16; registerIndex += 1) {
      if (!(registerMask & (1 << registerIndex))) continue;

      if (memoryToRegisters) {
        const rawValue = this.readSize(address, size);
        const value = size === SIZE_WORD ? signExtend16(rawValue) >>> 0 : rawValue;
        const isPostIncrementRegister = postIncrement && registerIndex === addressRegister + 8;
        if (!isPostIncrementRegister) {
          if (registerIndex < 8) this.d[registerIndex] = value;
          else this.a[registerIndex - 8] = value;
        }
      } else {
        const value = registerIndex < 8
          ? this.d[registerIndex]
          : this.a[registerIndex - 8];
        this.writeSize(address, size, value);
      }

      address = (address + size) >>> 0;
    }

    if (postIncrement) this.a[addressRegister] = address;
  }

  executeMovep(opcode) {
    const dataRegister = (opcode >>> 9) & 0x07;
    const operationMode = (opcode >>> 6) & 0x07;
    const addressRegister = opcode & 0x07;
    const size = operationMode & 0x01 ? SIZE_LONG : SIZE_WORD;
    const registerToMemory = Boolean(operationMode & 0x02);
    const address = (this.a[addressRegister] + signExtend16(this.fetch16())) >>> 0;
    const byteCount = size === SIZE_LONG ? 4 : 2;

    if (registerToMemory) {
      const value = this.d[dataRegister];
      for (let index = 0; index < byteCount; index += 1) {
        const shift = (byteCount - index - 1) * 8;
        this.write8(address + index * 2, value >>> shift);
      }
      return;
    }

    let value = 0;
    for (let index = 0; index < byteCount; index += 1) {
      value = ((value << 8) | this.read8(address + index * 2)) >>> 0;
    }
    this.writeDataRegister(dataRegister, size, value);
  }

  executeSwap(register) {
    const value = this.d[register];
    const result = ((value << 16) | (value >>> 16)) >>> 0;
    this.d[register] = result;
    this.setLogicalFlags(result, SIZE_LONG);
  }

  executeTas(opcode) {
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (!validDestination) throw new IllegalEffectiveAddress();

    const destination = this.effectiveAddress(mode, register, SIZE_BYTE, { writable: true });
    const oldValue = destination.read();
    this.setLogicalFlags(oldValue, SIZE_BYTE);
    destination.write(oldValue | 0x80);
  }

  executeNbcd(opcode) {
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (!validDestination) throw new IllegalEffectiveAddress();

    const destination = this.effectiveAddress(mode, register, SIZE_BYTE, { writable: true });
    const oldValue = destination.read();
    const extend = this.sr & SR_EXTEND ? 1 : 0;
    const { result, carry } = subtractPackedBcd(oldValue, 0, extend);
    destination.write(result);
    this.setBcdFlags(result, carry);
  }

  executeMultiply(opcode, signed) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validSource = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 4);
    if (!validSource) throw new IllegalEffectiveAddress();

    const sourceWord = this.effectiveAddress(
      mode,
      register,
      SIZE_WORD,
      { immediate: true },
    ).read();
    const destinationWord = this.d[destinationRegister] & 0xffff;
    const source = signed ? signExtend16(sourceWord) : sourceWord;
    const destination = signed ? signExtend16(destinationWord) : destinationWord;
    const result = (source * destination) >>> 0;
    this.d[destinationRegister] = result;
    this.setLogicalFlags(result, SIZE_LONG);
  }

  executeDivide(opcode, signed) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validSource = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 4);
    if (!validSource) throw new IllegalEffectiveAddress();

    const sourceWord = this.effectiveAddress(
      mode,
      register,
      SIZE_WORD,
      { immediate: true },
    ).read();
    const divisor = signed ? signExtend16(sourceWord) : sourceWord;
    if (divisor === 0) {
      this.exception(M68K_VECTOR.DIVIDE_BY_ZERO);
      return;
    }

    const original = this.d[destinationRegister];
    const dividend = signed ? original | 0 : original;
    const quotient = Math.trunc(dividend / divisor);
    const overflow = signed
      ? quotient < -0x8000 || quotient > 0x7fff
      : quotient > 0xffff;
    if (overflow) {
      this.sr = (this.sr & ~(SR_OVERFLOW | SR_CARRY)) | SR_OVERFLOW;
      return;
    }

    const remainder = dividend - quotient * divisor;
    this.d[destinationRegister] = (
      (remainder & 0xffff) * 0x1_0000 + (quotient & 0xffff)
    ) >>> 0;
    this.setLogicalFlags(quotient, SIZE_WORD);
  }

  executeChk(opcode) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validSource = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 4);
    if (!validSource) throw new IllegalEffectiveAddress();

    const upperBound = signExtend16(this.effectiveAddress(
      mode,
      register,
      SIZE_WORD,
      { immediate: true },
    ).read());
    const value = signExtend16(this.d[destinationRegister] & 0xffff);
    if (value < 0) {
      this.sr |= SR_NEGATIVE;
      this.exception(M68K_VECTOR.CHK);
    } else if (value > upperBound) {
      this.sr &= ~SR_NEGATIVE;
      this.exception(M68K_VECTOR.CHK);
    }
  }

  executeMoveFromSr(opcode) {
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (!validDestination) throw new IllegalEffectiveAddress();

    const destination = this.effectiveAddress(mode, register, SIZE_WORD, { writable: true });
    if (mode !== 0) destination.read(); // The MC68000/MC68008 performs a read before the write.
    destination.write(this.sr);
  }

  executeMoveToStatus(opcode, opcodeAddress, toSr) {
    if (toSr && !this.supervisor) {
      this.exception(M68K_VECTOR.PRIVILEGE_VIOLATION, opcodeAddress);
      return;
    }

    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validSource = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 4);
    if (!validSource) throw new IllegalEffectiveAddress();
    const source = this.effectiveAddress(mode, register, SIZE_WORD, { immediate: true }).read();
    if (toSr) this.setStatusRegister(source);
    else this.sr = (this.sr & ~0x1f) | (source & 0x1f);
  }

  executeMoveUsp(opcode, opcodeAddress) {
    if (!this.supervisor) {
      this.exception(M68K_VECTOR.PRIVILEGE_VIOLATION, opcodeAddress);
      return;
    }
    const register = opcode & 0x07;
    if (opcode & 0x0008) this.a[register] = this.usp;
    else this.usp = this.a[register];
  }

  executeTrap(vector) {
    this.exception(vector);
  }

  executeJump(opcode, subroutine) {
    const target = this.controlAddress((opcode >>> 3) & 0x07, opcode & 0x07);
    if (subroutine) this.push32(this.pc);
    this.pc = target >>> 0;
  }

  executePea(opcode) {
    const address = this.controlAddress((opcode >>> 3) & 0x07, opcode & 0x07);
    this.push32(address);
  }

  executeLink(register) {
    const displacement = signExtend16(this.fetch16());
    const oldFramePointer = this.a[register];
    this.push32(oldFramePointer);
    this.a[register] = this.a[7];
    this.a[7] = (this.a[7] + displacement) >>> 0;
  }

  executeUnlk(register) {
    this.a[7] = this.a[register];
    this.a[register] = this.pop32();
  }

  executeRte(opcodeAddress) {
    if (!this.supervisor) {
      this.exception(M68K_VECTOR.PRIVILEGE_VIOLATION, opcodeAddress);
      return;
    }
    const restoredSr = this.pop16();
    const restoredPc = this.pop32();
    this.setStatusRegister(restoredSr);
    this.pc = restoredPc;
  }

  executeRtr() {
    const restoredCcr = this.pop16() & 0x1f;
    const restoredPc = this.pop32();
    this.sr = (this.sr & ~0x1f) | restoredCcr;
    this.pc = restoredPc;
  }

  executeStop(opcodeAddress) {
    if (!this.supervisor) {
      this.exception(M68K_VECTOR.PRIVILEGE_VIOLATION, opcodeAddress);
      return;
    }
    this.setStatusRegister(this.fetch16());
    this.stopped = true;
  }

  executeReset(opcodeAddress) {
    if (!this.supervisor) {
      this.exception(M68K_VECTOR.PRIVILEGE_VIOLATION, opcodeAddress);
      return;
    }
    this.bus.resetDevices?.();
  }

  executeQuick(opcode) {
    const amount = (opcode >>> 9) & 0x07 || 8;
    const subtract = Boolean(opcode & 0x0100);
    const size = sizeFromCode((opcode >>> 6) & 0x03);
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    if (size === null) throw new IllegalEffectiveAddress(); // DBcc/Scc use this size code.

    if (mode === 1) {
      if (size === SIZE_BYTE) throw new IllegalEffectiveAddress();
      this.a[register] = subtract
        ? (this.a[register] - amount) >>> 0
        : (this.a[register] + amount) >>> 0;
      return;
    }

    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (!validDestination) throw new IllegalEffectiveAddress();
    const destination = this.effectiveAddress(mode, register, size, { writable: true });
    const oldValue = destination.read();
    const result = subtract ? oldValue - amount : oldValue + amount;
    destination.write(result);
    if (subtract) this.setSubFlags(amount, oldValue, result, size, true);
    else this.setAddFlags(amount, oldValue, result, size);
  }

  executeConditional(opcode) {
    const condition = (opcode >>> 8) & 0x0f;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;

    if (mode === 1) {
      const displacementBase = this.pc;
      const displacement = signExtend16(this.fetch16());
      // MC68008 timing (Motorola manual, table 7-10): 18 clocks for a
      // taken loop, 20 for CC true, 26 for an exhausted counter. Opcode
      // and extension reads have already charged 16 clocks plus RAM waits.
      // Count the remaining time: software delay loops rely on it (Spook).
      if (this.conditionTrue(condition)) {
        this.cycles += 4;
        return;
      }

      const counter = ((this.d[register] & 0xffff) - 1) & 0xffff;
      this.d[register] = ((this.d[register] & 0xffff_0000) | counter) >>> 0;
      if (counter !== 0xffff) {
        this.pc = (displacementBase + displacement) >>> 0;
        this.cycles += 2;
      } else {
        this.cycles += 10;
      }
      return;
    }

    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (!validDestination) throw new IllegalEffectiveAddress();
    const destination = this.effectiveAddress(mode, register, SIZE_BYTE, { writable: true });
    destination.write(this.conditionTrue(condition) ? 0xff : 0x00);
  }

  executeBit(opcode, dynamic) {
    const operation = (opcode >>> 6) & 0x03;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    if (mode === 1 || (mode === 7 && register > (operation === 0 ? 4 : 1))) {
      throw new IllegalEffectiveAddress();
    }

    const bitNumber = dynamic
      ? this.d[(opcode >>> 9) & 0x07]
      : this.fetch16();
    const size = mode === 0 ? SIZE_LONG : SIZE_BYTE;
    const bit = bitNumber % (size * 8);
    const writable = operation !== 0;
    const operand = this.effectiveAddress(mode, register, size, {
      immediate: operation === 0,
      writable,
    });
    const oldValue = operand.read();
    const bitMask = 2 ** bit;

    this.sr &= ~SR_ZERO;
    if ((oldValue & bitMask) === 0) this.sr |= SR_ZERO;
    if (!writable) return;

    let result;
    if (operation === 1) result = oldValue ^ bitMask;
    else if (operation === 2) result = oldValue & ~bitMask;
    else result = oldValue | bitMask;
    operand.write(result);
  }

  shiftValue(value, size, type, left, count) {
    const mask = maskForSize(size);
    const sign = signBitForSize(size);
    let result = (value & mask) >>> 0;
    let carry = false;
    let extend = Boolean(this.sr & SR_EXTEND);
    let overflow = false;

    for (let index = 0; index < count; index += 1) {
      const previousSign = Boolean(result & sign);
      if (left) {
        carry = previousSign;
        const input = type === 2 ? Number(extend) : type === 3 ? Number(carry) : 0;
        result = ((result << 1) | input) & mask;
      } else {
        carry = Boolean(result & 1);
        let input = 0;
        if (type === 0 && previousSign) input = sign;
        else if (type === 2 && extend) input = sign;
        else if (type === 3 && carry) input = sign;
        result = ((result >>> 1) | input) & mask;
      }
      result >>>= 0;
      if (type === 0 && left && previousSign !== Boolean(result & sign)) overflow = true;
      if (type === 2) extend = carry;
    }

    const oldExtend = Boolean(this.sr & SR_EXTEND);
    this.sr &= ~(SR_NEGATIVE | SR_ZERO | SR_OVERFLOW | SR_CARRY);
    if (result === 0) this.sr |= SR_ZERO;
    if (result & sign) this.sr |= SR_NEGATIVE;
    if (overflow) this.sr |= SR_OVERFLOW;
    if ((count === 0 && type === 2) ? oldExtend : carry) this.sr |= SR_CARRY;
    if (count > 0 && type !== 3) {
      this.sr &= ~SR_EXTEND;
      if (type === 2 ? extend : carry) this.sr |= SR_EXTEND;
    }
    return result >>> 0;
  }

  executeShift(opcode) {
    const memoryForm = ((opcode >>> 6) & 0x03) === 0x03;
    if (memoryForm) {
      const operation = (opcode >>> 8) & 0x07;
      const type = operation >>> 1;
      const left = Boolean(operation & 1);
      const mode = (opcode >>> 3) & 0x07;
      const register = opcode & 0x07;
      if (mode < 2 || (mode === 7 && register > 1)) throw new IllegalEffectiveAddress();
      const destination = this.effectiveAddress(mode, register, SIZE_WORD, { writable: true });
      const result = this.shiftValue(destination.read(), SIZE_WORD, type, left, 1);
      destination.write(result);
      return;
    }

    const size = sizeFromCode((opcode >>> 6) & 0x03);
    if (size === null) throw new IllegalEffectiveAddress();
    const destinationRegister = opcode & 0x07;
    const fromRegister = Boolean(opcode & 0x0020);
    const countField = (opcode >>> 9) & 0x07;
    const count = fromRegister ? this.d[countField] & 0x3f : countField || 8;
    const type = (opcode >>> 3) & 0x03;
    const left = Boolean(opcode & 0x0100);
    const oldValue = this.d[destinationRegister] & maskForSize(size);
    const result = this.shiftValue(oldValue, size, type, left, count);
    this.writeDataRegister(destinationRegister, size, result);
    this.cycles += count * 2;
  }

  executeImmediateToStatus(opcode, opcodeAddress) {
    const operation = opcode & 0xff00;
    const toStatusRegister = (opcode & 0x00ff) === 0x7c;
    if (toStatusRegister && !this.supervisor) {
      this.exception(M68K_VECTOR.PRIVILEGE_VIOLATION, opcodeAddress);
      return;
    }

    const immediate = this.fetch16();
    if (toStatusRegister) {
      if (operation === 0x0000) this.setStatusRegister(this.sr | immediate);
      else if (operation === 0x0200) this.setStatusRegister(this.sr & immediate);
      else this.setStatusRegister(this.sr ^ immediate);
      return;
    }

    const ccr = this.sr & 0x1f;
    const operand = immediate & 0x1f;
    const result = operation === 0x0000
      ? ccr | operand
      : operation === 0x0200
        ? ccr & operand
        : ccr ^ operand;
    this.sr = (this.sr & ~0x1f) | result;
  }

  executeImmediate(opcode, opcodeAddress) {
    const operation = opcode & 0xff00;
    const lowByte = opcode & 0x00ff;
    const statusOperation = operation === 0x0000 || operation === 0x0200 || operation === 0x0a00;
    if (statusOperation && (lowByte === 0x3c || lowByte === 0x7c)) {
      this.executeImmediateToStatus(opcode, opcodeAddress);
      return;
    }

    const size = sizeFromCode((opcode >>> 6) & 0x03);
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    const validDestination = mode === 0
      || (mode >= 2 && mode <= 6)
      || (mode === 7 && register <= 1);
    if (size === null || !validDestination) throw new IllegalEffectiveAddress();

    const immediate = this.readImmediate(size);
    const destination = this.effectiveAddress(mode, register, size, { writable: true });
    const oldValue = destination.read();

    if (operation === 0x0c00) {
      this.setSubFlags(immediate, oldValue, oldValue - immediate, size, false);
      return;
    }

    let result;
    if (operation === 0x0000) result = oldValue | immediate;
    else if (operation === 0x0200) result = oldValue & immediate;
    else if (operation === 0x0400) result = oldValue - immediate;
    else if (operation === 0x0600) result = oldValue + immediate;
    else if (operation === 0x0a00) result = oldValue ^ immediate;
    else throw new IllegalEffectiveAddress();

    destination.write(result);
    if (operation === 0x0400) this.setSubFlags(immediate, oldValue, result, size, true);
    else if (operation === 0x0600) this.setAddFlags(immediate, oldValue, result, size);
    else this.setLogicalFlags(result, size);
  }

  executeLogical(opcode, operation) {
    const dataRegister = (opcode >>> 9) & 0x07;
    const operationMode = (opcode >>> 6) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;
    if (operationMode === 3 || operationMode === 7) throw new IllegalEffectiveAddress();
    const size = sizeFromCode(operationMode & 0x03);
    if (size === null) throw new IllegalEffectiveAddress();

    if (operationMode <= 2) {
      const source = this.effectiveAddress(mode, register, size, { immediate: true }).read();
      const oldValue = this.d[dataRegister] & maskForSize(size);
      const result = operation === "or" ? oldValue | source : oldValue & source;
      this.writeDataRegister(dataRegister, size, result);
      this.setLogicalFlags(result, size);
      return;
    }

    if (mode < 2) throw new IllegalEffectiveAddress(); // SBCD/ABCD/EXG encodings.
    const destination = this.effectiveAddress(mode, register, size, { writable: true });
    const oldValue = destination.read();
    const source = this.d[dataRegister] & maskForSize(size);
    const result = operation === "or" ? oldValue | source : oldValue & source;
    destination.write(result);
    this.setLogicalFlags(result, size);
  }

  executeExtendArithmetic(opcode, subtract) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const sourceRegister = opcode & 0x07;
    const size = sizeFromCode((opcode >>> 6) & 0x03);
    if (size === null) throw new IllegalEffectiveAddress();
    const memoryMode = Boolean(opcode & 0x0008);
    const extend = this.sr & SR_EXTEND ? 1 : 0;
    let source;
    let destination;
    let writeResult;

    if (memoryMode) {
      const sourceStep = size === SIZE_BYTE && sourceRegister === 7 ? 2 : size;
      this.a[sourceRegister] = (this.a[sourceRegister] - sourceStep) >>> 0;
      const sourceAddress = this.a[sourceRegister];
      source = this.readSize(sourceAddress, size);

      const destinationStep = size === SIZE_BYTE && destinationRegister === 7 ? 2 : size;
      this.a[destinationRegister] = (this.a[destinationRegister] - destinationStep) >>> 0;
      const destinationAddress = this.a[destinationRegister];
      destination = this.readSize(destinationAddress, size);
      writeResult = (value) => this.writeSize(destinationAddress, size, value);
    } else {
      source = this.d[sourceRegister] & maskForSize(size);
      destination = this.d[destinationRegister] & maskForSize(size);
      writeResult = (value) => this.writeDataRegister(destinationRegister, size, value);
    }

    const result = subtract
      ? destination - source - extend
      : destination + source + extend;
    writeResult(result);
    this.setExtendArithmeticFlags(source, destination, result, size, subtract, extend);
  }

  executeBcdPair(opcode, subtract) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const sourceRegister = opcode & 0x07;
    const memoryMode = Boolean(opcode & 0x0008);
    const extend = this.sr & SR_EXTEND ? 1 : 0;
    let source;
    let destination;
    let writeResult;

    if (memoryMode) {
      const sourceStep = sourceRegister === 7 ? 2 : 1;
      this.a[sourceRegister] = (this.a[sourceRegister] - sourceStep) >>> 0;
      const sourceAddress = this.a[sourceRegister];
      source = this.read8(sourceAddress);

      const destinationStep = destinationRegister === 7 ? 2 : 1;
      this.a[destinationRegister] = (this.a[destinationRegister] - destinationStep) >>> 0;
      const destinationAddress = this.a[destinationRegister];
      destination = this.read8(destinationAddress);
      writeResult = (value) => this.write8(destinationAddress, value);
    } else {
      source = this.d[sourceRegister] & 0xff;
      destination = this.d[destinationRegister] & 0xff;
      writeResult = (value) => this.writeDataRegister(destinationRegister, SIZE_BYTE, value);
    }

    const adjusted = subtract
      ? subtractPackedBcd(source, destination, extend)
      : addPackedBcd(source, destination, extend);
    writeResult(adjusted.result);
    this.setBcdFlags(adjusted.result, adjusted.carry);
  }

  executeCmpm(opcode) {
    const destinationRegister = (opcode >>> 9) & 0x07;
    const sourceRegister = opcode & 0x07;
    const size = sizeFromCode((opcode >>> 6) & 0x03);
    if (size === null) throw new IllegalEffectiveAddress();

    const sourceAddress = this.a[sourceRegister];
    const source = this.readSize(sourceAddress, size);
    const sourceStep = size === SIZE_BYTE && sourceRegister === 7 ? 2 : size;
    this.a[sourceRegister] = (this.a[sourceRegister] + sourceStep) >>> 0;

    const destinationAddress = this.a[destinationRegister];
    const destination = this.readSize(destinationAddress, size);
    const destinationStep = size === SIZE_BYTE && destinationRegister === 7 ? 2 : size;
    this.a[destinationRegister] = (this.a[destinationRegister] + destinationStep) >>> 0;
    this.setSubFlags(source, destination, destination - source, size, false);
  }

  executeExg(opcode) {
    const firstRegister = (opcode >>> 9) & 0x07;
    const secondRegister = opcode & 0x07;
    const operation = opcode & 0x00f8;
    const firstBank = operation === 0x0048 ? this.a : this.d;
    const secondBank = operation === 0x0088 ? this.a : firstBank;
    const temporary = firstBank[firstRegister];
    firstBank[firstRegister] = secondBank[secondRegister];
    secondBank[secondRegister] = temporary;
  }

  executeAddSub(opcode, subtract) {
    const dataRegister = (opcode >>> 9) & 0x07;
    const operationMode = (opcode >>> 6) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;

    if (operationMode === 3 || operationMode === 7) {
      const size = operationMode === 3 ? SIZE_WORD : SIZE_LONG;
      const source = this.effectiveAddress(mode, register, size, { immediate: true }).read();
      const operand = size === SIZE_WORD ? signExtend16(source) : source;
      this.a[dataRegister] = subtract
        ? (this.a[dataRegister] - operand) >>> 0
        : (this.a[dataRegister] + operand) >>> 0;
      return;
    }

    const sizeCode = operationMode & 0x03;
    const size = sizeFromCode(sizeCode);
    if (size === null) throw new IllegalEffectiveAddress();

    if (operationMode <= 2) {
      const source = this.effectiveAddress(mode, register, size, { immediate: true }).read();
      const destination = this.d[dataRegister] & maskForSize(size);
      const result = subtract ? destination - source : destination + source;
      this.writeDataRegister(dataRegister, size, result);
      if (subtract) this.setSubFlags(source, destination, result, size, true);
      else this.setAddFlags(source, destination, result, size);
      return;
    }

    if (mode < 2) throw new IllegalEffectiveAddress(); // ADDX/SUBX encodings.
    const destination = this.effectiveAddress(mode, register, size, { writable: true });
    const oldValue = destination.read();
    const source = this.d[dataRegister] & maskForSize(size);
    const result = subtract ? oldValue - source : oldValue + source;
    destination.write(result);
    if (subtract) this.setSubFlags(source, oldValue, result, size, true);
    else this.setAddFlags(source, oldValue, result, size);
  }

  executeCmp(opcode) {
    const dataRegister = (opcode >>> 9) & 0x07;
    const operationMode = (opcode >>> 6) & 0x07;
    const mode = (opcode >>> 3) & 0x07;
    const register = opcode & 0x07;

    if (operationMode === 3 || operationMode === 7) {
      const size = operationMode === 3 ? SIZE_WORD : SIZE_LONG;
      const source = this.effectiveAddress(mode, register, size, { immediate: true }).read();
      const operand = size === SIZE_WORD ? signExtend16(source) : source;
      const destination = this.a[dataRegister];
      this.setSubFlags(operand, destination, destination - operand, SIZE_LONG, false);
      return;
    }

    if (operationMode >= 4 && operationMode <= 6) {
      if (mode === 1) throw new IllegalEffectiveAddress(); // CMPM encoding.
      const size = sizeFromCode(operationMode - 4);
      const destination = this.effectiveAddress(mode, register, size, { writable: true });
      const oldValue = destination.read();
      const result = oldValue ^ (this.d[dataRegister] & maskForSize(size));
      destination.write(result);
      this.setLogicalFlags(result, size);
      return;
    }

    if (operationMode > 2) throw new IllegalEffectiveAddress();
    const size = sizeFromCode(operationMode);
    const source = this.effectiveAddress(mode, register, size, { immediate: true }).read();
    const destination = this.d[dataRegister] & maskForSize(size);
    this.setSubFlags(source, destination, destination - source, size, false);
  }

  step() {
    const initialCycles = this.cycles;
    const interruptLevel = this.pendingInterruptLevel();
    if (interruptLevel !== 0) {
      this.acceptInterrupt(interruptLevel);
      return this.cycles - initialCycles;
    }
    if (this.stopped) return 0;
    const traceEnabled = Boolean(this.sr & SR_TRACE);
    const previousException = this.lastException;
    const opcodeAddress = this.pc;
    const opcode = this.fetch16();

    try {
      if ((opcode & 0xf000) === 0xa000) {
        this.exception(M68K_VECTOR.LINE_1010_EMULATOR, opcodeAddress);
      } else if ((opcode & 0xf000) === 0xf000) {
        this.exception(M68K_VECTOR.LINE_1111_EMULATOR, opcodeAddress);
      } else if (opcode === 0x4e70) {
        this.executeReset(opcodeAddress);
      } else if (opcode === 0x4e71) {
        // NOP: on the MC68008 the 16-bit opcode fetch itself takes eight clocks.
      } else if (opcode === 0x4e72) {
        this.executeStop(opcodeAddress);
      } else if (opcode === 0x4e73) {
        this.executeRte(opcodeAddress);
      } else if (opcode === 0x4e75) {
        this.pc = this.pop32();
      } else if (opcode === 0x4e76) {
        if (this.sr & SR_OVERFLOW) this.executeTrap(M68K_VECTOR.TRAPV);
      } else if (opcode === 0x4e77) {
        this.executeRtr();
      } else if ((opcode & 0xfff0) === 0x4e40) {
        this.executeTrap(M68K_VECTOR.TRAP_BASE + (opcode & 0x0f));
      } else if ((opcode & 0xfff0) === 0x4e60) {
        this.executeMoveUsp(opcode, opcodeAddress);
      } else if ((opcode & 0xf000) === 0x6000) {
        this.executeBranch(opcode);
      } else if ((opcode & 0xf000) === 0x5000) {
        if ((opcode & 0x00c0) === 0x00c0) this.executeConditional(opcode);
        else this.executeQuick(opcode);
      } else if ((opcode & 0xf100) === 0x7000) {
        this.executeMoveQ(opcode);
      } else if (opcode >>> 12 >= 1 && opcode >>> 12 <= 3) {
        this.executeMove(opcode);
      } else if ((opcode & 0xffc0) === 0x4e80) {
        this.executeJump(opcode, true);
      } else if ((opcode & 0xffc0) === 0x4ec0) {
        this.executeJump(opcode, false);
      } else if ((opcode & 0xfff8) === 0x4840) {
        this.executeSwap(opcode & 0x07);
      } else if ((opcode & 0xffb8) === 0x4880) {
        this.executeExt(opcode);
      } else if ((opcode & 0xfb80) === 0x4880) {
        this.executeMovem(opcode);
      } else if ((opcode & 0xffc0) === 0x4800) {
        this.executeNbcd(opcode);
      } else if ((opcode & 0xffc0) === 0x4840) {
        this.executePea(opcode);
      } else if ((opcode & 0xfff8) === 0x4e50) {
        this.executeLink(opcode & 0x07);
      } else if ((opcode & 0xfff8) === 0x4e58) {
        this.executeUnlk(opcode & 0x07);
      } else if ((opcode & 0xf1c0) === 0x41c0) {
        this.executeLea(opcode);
      } else if ((opcode & 0xf1c0) === 0x4180) {
        this.executeChk(opcode);
      } else if ((opcode & 0xffc0) === 0x40c0) {
        this.executeMoveFromSr(opcode);
      } else if ((opcode & 0xffc0) === 0x44c0) {
        this.executeMoveToStatus(opcode, opcodeAddress, false);
      } else if ((opcode & 0xffc0) === 0x46c0) {
        this.executeMoveToStatus(opcode, opcodeAddress, true);
      } else if ((opcode & 0xff00) === 0x4200) {
        this.executeClr(opcode);
      } else if ((opcode & 0xff00) === 0x4000) {
        this.executeUnary(opcode, "negx");
      } else if ((opcode & 0xff00) === 0x4400) {
        this.executeUnary(opcode, "neg");
      } else if ((opcode & 0xff00) === 0x4600) {
        this.executeUnary(opcode, "not");
      } else if ((opcode & 0xffc0) === 0x4ac0) {
        this.executeTas(opcode);
      } else if ((opcode & 0xff00) === 0x4a00) {
        this.executeTst(opcode);
      } else if ((opcode & 0xf130) === 0xd100 && (opcode & 0x00c0) !== 0x00c0) {
        this.executeExtendArithmetic(opcode, false);
      } else if ((opcode & 0xf000) === 0xd000) {
        this.executeAddSub(opcode, false);
      } else if ((opcode & 0xf130) === 0x9100 && (opcode & 0x00c0) !== 0x00c0) {
        this.executeExtendArithmetic(opcode, true);
      } else if ((opcode & 0xf000) === 0x9000) {
        this.executeAddSub(opcode, true);
      } else if ((opcode & 0xf138) === 0xb108 && (opcode & 0x00c0) !== 0x00c0) {
        this.executeCmpm(opcode);
      } else if ((opcode & 0xf000) === 0xb000) {
        this.executeCmp(opcode);
      } else if ((opcode & 0xf1c0) === 0x80c0) {
        this.executeDivide(opcode, false);
      } else if ((opcode & 0xf1c0) === 0x81c0) {
        this.executeDivide(opcode, true);
      } else if ((opcode & 0xf1f0) === 0x8100) {
        this.executeBcdPair(opcode, true);
      } else if ((opcode & 0xf000) === 0x8000) {
        this.executeLogical(opcode, "or");
      } else if ((opcode & 0xf1c0) === 0xc0c0) {
        this.executeMultiply(opcode, false);
      } else if ((opcode & 0xf1c0) === 0xc1c0) {
        this.executeMultiply(opcode, true);
      } else if ([0xc140, 0xc148, 0xc188].includes(opcode & 0xf1f8)) {
        this.executeExg(opcode);
      } else if ((opcode & 0xf1f0) === 0xc100) {
        this.executeBcdPair(opcode, false);
      } else if ((opcode & 0xf000) === 0xc000) {
        this.executeLogical(opcode, "and");
      } else if ((opcode & 0xf138) === 0x0108) {
        this.executeMovep(opcode);
      } else if ((opcode & 0xf100) === 0x0100) {
        this.executeBit(opcode, true);
      } else if ((opcode & 0xff00) === 0x0800) {
        this.executeBit(opcode, false);
      } else if ((opcode & 0xf000) === 0xe000) {
        this.executeShift(opcode);
      } else if ([0x0000, 0x0200, 0x0400, 0x0600, 0x0a00, 0x0c00].includes(opcode & 0xff00)) {
        this.executeImmediate(opcode, opcodeAddress);
      } else {
        throw new IllegalEffectiveAddress();
      }
    } catch (error) {
      if (!(error instanceof IllegalEffectiveAddress)) throw error;
      this.exception(M68K_VECTOR.ILLEGAL_INSTRUCTION, opcodeAddress);
    }

    if (traceEnabled && this.lastException === previousException) {
      this.exception(M68K_VECTOR.TRACE, this.pc);
    }

    return this.cycles - initialCycles;
  }

  externalAddress(address) {
    return address & ADDRESS_MASK;
  }
}
