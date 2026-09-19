import assert from "node:assert/strict";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { MICRODRIVE_FORMAT } from "../src/devices/microdrive.js";
import { ZX8302, ZX8302_REGISTERS } from "../src/devices/zx8302.js";

function transferBit(bus, bit) {
  bus.write8(ZX8302_REGISTERS.ipcWrite, 0x0c | ((bit & 1) << 1));
  return bus.read8(ZX8302_REGISTERS.ipcRead) >>> 7;
}

function transferValue(bus, value, width) {
  for (let bit = width - 1; bit >= 0; bit -= 1) transferBit(bus, value >>> bit);
}

function readValue(bus, width) {
  let value = 0;
  for (let bit = 0; bit < width; bit += 1) value = (value << 1) | transferBit(bus, 1);
  return value;
}

function command(bus, value) {
  transferValue(bus, value, 4);
}

function selectMicrodrive(bus, slot = 1) {
  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x03);
  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x01);
  for (let drive = 1; drive < slot; drive += 1) {
    bus.write8(ZX8302_REGISTERS.microdriveControl, 0x02);
    bus.write8(ZX8302_REGISTERS.microdriveControl, 0x00);
  }
}

function finishGap(bus) {
  assert.equal(
    bus.read8(ZX8302_REGISTERS.microdriveControl) & ZX8302_REGISTERS.microdriveGap,
    ZX8302_REGISTERS.microdriveGap,
  );
  for (let poll = 0; poll < ZX8302_REGISTERS.microdriveGapPolls; poll += 1) {
    assert.equal(bus.read8(ZX8302_REGISTERS.microdriveControl) & 0x0c, 0);
  }
  assert.equal(
    bus.read8(ZX8302_REGISTERS.microdriveControl) & ZX8302_REGISTERS.microdriveReadReady,
    ZX8302_REGISTERS.microdriveReadReady,
  );
}

function readReadyBytes(bus, length, address = ZX8302_REGISTERS.microdriveTrack1) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    if (index > 0) {
      assert.equal(
        bus.read8(ZX8302_REGISTERS.microdriveControl)
          & ZX8302_REGISTERS.microdriveReadReady,
        ZX8302_REGISTERS.microdriveReadReady,
      );
    }
    bytes.push(bus.read8(address));
  }
  return bytes;
}

test("o handshake IPC inativo confirma imediatamente cada bit", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  bus.write8(ZX8302_REGISTERS.ipcWrite, 0x0e);
  assert.equal(bus.read8(ZX8302_REGISTERS.ipcRead), ZX8302_REGISTERS.idleIpcStatus);
  assert.equal(bus.read8(ZX8302_REGISTERS.ipcRead) & 0x40, 0);
  assert.equal(zx8302.ipcWrite, 0x0e);
  assert.equal(zx8302.ipcWrites, 1);
});

test("o bloco conserva controlo de transmissão e máscara de interrupções", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  bus.write8(ZX8302_REGISTERS.transmitControl, 0xa5);
  bus.write8(ZX8302_REGISTERS.interrupt, 0xff);
  assert.equal(zx8302.transmitControl, 0xa5);
  assert.equal(zx8302.interruptMask, 0xe0);

  bus.resetDevices();
  assert.equal(zx8302.transmitControl, 0);
  assert.equal(zx8302.interruptMask, 0);
  assert.equal(zx8302.ipcWrites, 0);
});

test("gera e reconhece a interrupção de frame de 50 Hz", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  bus.tick(ZX8302_REGISTERS.frameCycles - 1);
  assert.equal(bus.interruptLevel, 0);
  bus.tick(1);
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt), ZX8302_REGISTERS.frameInterrupt);
  assert.equal(bus.interruptLevel, 2);

  bus.write8(ZX8302_REGISTERS.interrupt, ZX8302_REGISTERS.frameInterrupt);
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt), 0);
  assert.equal(bus.interruptLevel, 0);
});

test("conserva a fase de frame e valida o avanço temporal", () => {
  const zx8302 = new ZX8302();
  zx8302.tick(ZX8302_REGISTERS.frameCycles * 2 + 17);
  assert.equal(zx8302.frameCycleAccumulator, 17);
  assert.throws(() => zx8302.tick(-1), RangeError);
});

test("a ausência de cartucho solicita serviço quando a interrupção de gap é ativada", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  bus.write8(ZX8302_REGISTERS.interrupt, ZX8302_REGISTERS.gapInterruptMask);
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt), ZX8302_REGISTERS.gapInterrupt);
  assert.equal(bus.interruptLevel, 2);

  bus.write8(
    ZX8302_REGISTERS.interrupt,
    ZX8302_REGISTERS.gapInterruptMask | ZX8302_REGISTERS.gapInterrupt,
  );
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt), ZX8302_REGISTERS.gapInterrupt);

  bus.write8(ZX8302_REGISTERS.interrupt, ZX8302_REGISTERS.gapInterrupt);
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt), 0);
  assert.equal(bus.interruptLevel, 0);
});

test("o IPC reporta e entrega teclas no formato esperado pela Minerva", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  command(bus, 1);
  assert.equal(readValue(bus, 8), 0);

  zx8302.enqueueKey(57, { shift: true, alt: true });
  command(bus, 1);
  assert.equal(readValue(bus, 8), 1);

  command(bus, 8);
  assert.equal(readValue(bus, 4), 1);
  assert.equal(readValue(bus, 4), 0x05);
  assert.equal(readValue(bus, 8), 57);

  command(bus, 1);
  assert.equal(readValue(bus, 8), 0);
});

test("comandos IPC com parâmetros conservam o alinhamento do fluxo de bits", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  bus.write8(ZX8302_REGISTERS.ipcWrite, 0x01);
  command(bus, 13);
  transferValue(bus, 1, 4);
  command(bus, 15);
  transferValue(bus, 0xa5, 8);
  assert.equal(readValue(bus, 8), 0xa5);

  command(bus, 1);
  assert.equal(readValue(bus, 8), 0);
});

test("a leitura direta IPC mantém cursores premidos e distingue todas as linhas da matriz", () => {
  const io = new ZX8302();
  const bus = new QLBus({ devices: [io] });
  const row = (number) => {
    command(bus, 9);
    transferValue(bus, number, 4);
    return readValue(bus, 8);
  };
  for (const [keycode, expected] of [[49, 2], [50, 4], [52, 16], [55, 128]]) {
    io.setKeyboardState([keycode]);
    assert.equal(row(1), expected);
    assert.equal(row(1), expected, "consultar uma tecla não a deve libertar");
    io.setKeyboardState([]);
    assert.equal(row(1), 0);
  }
  io.setKeyboardState([0, 1, 2, 28, 49, 50, 57]);
  assert.equal(row(7), 7); // Shift, Ctrl, Alt
  assert.equal(row(4), 16); // A
  assert.equal(row(1), 6); // Left + Up
  assert.equal(row(0), 2); // F1
  assert.equal(row(8), 0);
  io.enqueueKey(28);
  assert.equal(row(4), 16);
  command(bus, 8);
  assert.equal(readValue(bus, 4), 1);
  assert.equal(readValue(bus, 4), 0);
  assert.equal(readValue(bus, 8), 28);
  assert.equal(row(4), 16, "ler a fila de texto não altera a matriz física");
  io.clearKeyboardQueue();
  assert.equal(row(1), 6);
  assert.throws(() => io.setKeyboardState([64]), RangeError);
  io.reset();
  assert.equal(row(1), 0);
  assert.equal(row(7), 0);
});

test("serial IPC opens each port, reports pending input, drains batches and clears on close", () => {
  const io = new ZX8302();
  const bus = new QLBus({ devices: [io] });
  assert.equal(io.receiveSerial(1, Uint8Array.of(65)), false);
  command(bus, 2);
  command(bus, 3);
  assert.equal(io.receiveSerial(1, Uint8Array.from({ length: 25 }, (_, n) => n)), true);
  assert.equal(io.receiveSerial(2, Uint8Array.of(90)), true);
  command(bus, 1);
  assert.equal(readValue(bus, 8), 0x30);
  command(bus, 6);
  assert.equal(readValue(bus, 8), 20);
  for (let n = 0; n < 20; n++) assert.equal(readValue(bus, 8), n);
  command(bus, 7);
  assert.equal(readValue(bus, 8), 1);
  assert.equal(readValue(bus, 8), 90);
  command(bus, 4);
  command(bus, 1);
  assert.equal(readValue(bus, 8), 0);
  assert.equal(io.receiveSerial(2, new Uint8Array(8193)), false);
  io.reset();
  assert.equal(io.receiveSerial(2, Uint8Array.of(90)), false);
});

test("serial transmitter times bytes, latches the selected port and requests enabled interrupts", () => {
  const sent = [];
  const io = new ZX8302({ onSerial: (event) => sent.push(event) });
  const bus = new QLBus({ devices: [io] });
  bus.write8(0x18021, 0x80);
  bus.write8(0x18002, 8); // SER2 at 19200 baud
  bus.write8(0x18022, 65);
  bus.write8(0x18022, 66); // busy: do not overwrite
  assert.equal(bus.read8(0x18020) & 2, 2);
  io.tick(4296);
  assert.equal(sent.length, 0);
  bus.write8(0x18002, 0); // current byte remains assigned to SER2
  io.tick(1);
  assert.deepEqual(sent, [{ port: 2, byte: 65 }]);
  assert.equal(bus.read8(0x18020) & 2, 0);
  assert.equal(bus.read8(0x18021) & 4, 4);
  bus.write8(0x18021, 4);
  assert.equal(bus.read8(0x18021) & 4, 0);
  bus.write8(0x18002, 0x10); // MDV must not leak into serial
  bus.write8(0x18022, 67);
  io.tick(5000);
  assert.equal(sent.length, 1);
  bus.write8(0x18002, 0);
  bus.write8(0x18022, 68);
  io.reset();
  io.tick(5000);
  assert.equal(sent.length, 1);
});

test("inicia, reporta, termina e interrompe o som do IPC", () => {
  const events = [];
  const zx8302 = new ZX8302({ onSound: (event) => events.push(event) });
  const bus = new QLBus({ devices: [zx8302] });
  const parameters = [21, 81, 0x02, 0x00, 0x03, 0x00, 0x23, 0x9a];

  command(bus, 10);
  for (const parameter of parameters) transferValue(bus, parameter, 8);
  assert.equal(zx8302.soundActive, true);
  assert.deepEqual(zx8302.sound, {
    pitch: 21,
    pitch2: 81,
    interval: 2,
    duration: 3,
    step: 2,
    wrap: 3,
    randomness: 9,
    fuzziness: 10,
  });
  assert.deepEqual(events, [{ type: "start", sound: zx8302.sound }]);

  command(bus, 1);
  assert.equal(readValue(bus, 8), 0x02);
  bus.tick(zx8302.soundCyclesRemaining);
  assert.equal(zx8302.soundActive, false);
  assert.equal(events.at(-1).reason, "duration");

  command(bus, 10);
  for (const parameter of [21, 21, 0, 0, 0, 0, 0, 0]) transferValue(bus, parameter, 8);
  assert.equal(zx8302.soundCyclesRemaining, Number.POSITIVE_INFINITY);
  command(bus, 11);
  assert.equal(zx8302.soundActive, false);
  assert.equal(events.at(-1).reason, "command");

  command(bus, 15);
  transferValue(bus, 0xa5, 8);
  assert.equal(readValue(bus, 8), 0xa5);
});

test("a fila do teclado valida keyrows e pode ser limpa diretamente ou pelo RESET", () => {
  const zx8302 = new ZX8302();
  assert.throws(() => zx8302.enqueueKey(-1), RangeError);
  assert.throws(() => zx8302.enqueueKey(64), RangeError);

  zx8302.enqueueKey(48);
  assert.equal(zx8302.keyboardQueue.length, 1);
  zx8302.clearKeyboardQueue();
  assert.equal(zx8302.keyboardQueue.length, 0);
  zx8302.enqueueKey(48);
  zx8302.reset();
  assert.equal(zx8302.keyboardQueue.length, 0);
});

test("monta e ejeta imagens .mdv sem as remover durante RESET", () => {
  const zx8302 = new ZX8302();
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);

  const image = zx8302.mountMicrodrive(1, bytes, { name: "programas.mdv" });
  assert.equal(zx8302.microdriveAt(1), image);
  assert.equal(image.name, "programas.mdv");
  assert.throws(() => zx8302.mountMicrodrive(0, bytes), RangeError);
  assert.equal(zx8302.microdrives.length, 2);
  assert.throws(() => zx8302.mountMicrodrive(3, bytes), RangeError);
  assert.throws(() => zx8302.microdriveAt(3), RangeError);

  zx8302.reset();
  assert.equal(zx8302.microdriveAt(1), image);
  assert.equal(zx8302.activeMicrodrive, 0);
  assert.equal(zx8302.unmountMicrodrive(1), image);
  assert.equal(zx8302.microdriveAt(1), null);
});

test("seleciona Microdrives pela cadeia de controlo do ZX8302", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });

  selectMicrodrive(bus, 2);
  assert.equal(zx8302.activeMicrodrive, 2);

  for (let pulse = 2; pulse <= 8; pulse += 1) {
    bus.write8(ZX8302_REGISTERS.microdriveControl, 0x02);
    bus.write8(ZX8302_REGISTERS.microdriveControl, 0x00);
    assert.equal(zx8302.microdriveSelection, 0, "não há motores MDV3–MDV8");
  }
  assert.equal(zx8302.activeMicrodrive, 0);
});

test("inserir em MDV2 com MDV1 em uso conserva o cartucho e a leitura de MDV1", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });
  const first = zx8302.mountMicrodrive(1, new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  selectMicrodrive(bus, 1);
  zx8302.advanceMicrodriveSector();
  const second = zx8302.mountMicrodrive(2, new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  assert.equal(zx8302.microdriveAt(1), first);
  assert.equal(zx8302.microdriveAt(2), second);
  assert.equal(zx8302.activeMicrodrive, 1);
  assert.equal(zx8302.microdriveSector, 1);
});

test("não anuncia um GAP fantasma no modo Microdrive sem motor ativo", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });
  bus.write8(ZX8302_REGISTERS.transmitControl, ZX8302_REGISTERS.microdriveMode);
  assert.equal(bus.read8(ZX8302_REGISTERS.microdriveControl), 0);
});

test("lê cabeçalho e dados de um setor .mdv no modo Microdrive", () => {
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  const headerStart = MICRODRIVE_FORMAT.headerPreambleSize;
  const recordStart = headerStart
    + MICRODRIVE_FORMAT.headerSize
    + MICRODRIVE_FORMAT.dataPreambleSize;
  for (let index = 0; index < MICRODRIVE_FORMAT.headerSize; index += 1) {
    bytes[headerStart + index] = 0x20 + index;
  }
  for (let index = 0; index < MICRODRIVE_FORMAT.recordSize; index += 1) {
    bytes[recordStart + index] = index & 0xff;
  }

  const zx8302 = new ZX8302();
  zx8302.mountMicrodrive(1, bytes);
  const bus = new QLBus({ devices: [zx8302] });
  bus.write8(ZX8302_REGISTERS.transmitControl, ZX8302_REGISTERS.microdriveMode);
  selectMicrodrive(bus);

  finishGap(bus);
  const header = readReadyBytes(bus, MICRODRIVE_FORMAT.headerSize);
  assert.deepEqual(header, Array.from({ length: 16 }, (_, index) => 0x20 + index));

  finishGap(bus);
  const blockHeader = readReadyBytes(bus, 4);
  assert.deepEqual(blockHeader, [0, 1, 2, 3]);

  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x02);
  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x02);
  assert.equal(bus.read8(ZX8302_REGISTERS.microdriveTrack2), 12);

  for (let poll = 0; poll < MICRODRIVE_FORMAT.recordSize; poll += 1) {
    bus.read8(ZX8302_REGISTERS.microdriveControl);
  }
  assert.equal(zx8302.microdriveSector, 0, "o setor só avança quando começa o GAP seguinte");
  assert.equal(
    bus.read8(ZX8302_REGISTERS.microdriveControl) & ZX8302_REGISTERS.microdriveGap,
    ZX8302_REGISTERS.microdriveGap,
  );
  assert.equal(zx8302.microdriveSector, 1);
});

test("consultar o estado duas vezes por byte não perde o fim do cabeçalho", () => {
  const bytes = new Uint8Array(MICRODRIVE_FORMAT.imageSize);
  for (let i = 0; i < 16; i += 1) bytes[12 + i] = 0x40 + i;
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });
  zx8302.mountMicrodrive(1, bytes);
  bus.write8(ZX8302_REGISTERS.transmitControl, ZX8302_REGISTERS.microdriveMode);
  selectMicrodrive(bus);
  finishGap(bus);
  for (let i = 0; i < 16; i += 1) {
    for (let poll = 0; poll < 2; poll += 1) {
      assert.ok(bus.read8(ZX8302_REGISTERS.ipcRead) & ZX8302_REGISTERS.microdriveReadReady);
    }
    assert.equal(bus.read8(i & 1 ? ZX8302_REGISTERS.microdriveTrack2 : ZX8302_REGISTERS.microdriveTrack1), 0x40 + i);
  }
  assert.ok(bus.read8(ZX8302_REGISTERS.ipcRead) & ZX8302_REGISTERS.microdriveGap);
});

test("seleção segue o flanco do relógio e conserva a posição de cada fita", () => {
  const zx8302 = new ZX8302();
  const bus = new QLBus({ devices: [zx8302] });
  const control = ZX8302_REGISTERS.microdriveControl;
  bus.write8(control, 0x0b);
  bus.write8(control, 0x09);
  assert.equal(zx8302.activeMicrodrive, 1);
  assert.equal(zx8302.microdriveSelection, 1);
  zx8302.advanceMicrodriveSector();
  bus.write8(control, 0x0a);
  bus.write8(control, 0x08);
  assert.equal(zx8302.activeMicrodrive, 2);
  assert.equal(zx8302.microdriveSelection, 2);
  for (let i = 0; i < 8; i += 1) {
    bus.write8(control, 2);
    bus.write8(control, 0);
  }
  assert.equal(zx8302.microdriveSelection, 0);
  selectMicrodrive(bus, 1);
  assert.equal(zx8302.microdriveSector, 1);
  zx8302.reset();
  assert.equal(zx8302.microdriveSelection, 0);
});

test("gera interrupções de gap periódicas enquanto um motor está ativo", () => {
  const zx8302 = new ZX8302();
  zx8302.mountMicrodrive(1, new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  const bus = new QLBus({ devices: [zx8302] });
  selectMicrodrive(bus);
  bus.write8(ZX8302_REGISTERS.interrupt, ZX8302_REGISTERS.gapInterruptMask);

  bus.tick(ZX8302_REGISTERS.microdriveGapCycles - 1);
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt) & ZX8302_REGISTERS.gapInterrupt, 0);
  bus.tick(1);
  assert.ok(bus.read8(ZX8302_REGISTERS.interrupt) & ZX8302_REGISTERS.gapInterrupt);

  bus.write8(
    ZX8302_REGISTERS.interrupt,
    ZX8302_REGISTERS.gapInterruptMask | ZX8302_REGISTERS.gapInterrupt,
  );
  assert.equal(bus.read8(ZX8302_REGISTERS.interrupt) & ZX8302_REGISTERS.gapInterrupt, 0);
});

test("escreve sequências físicas num cartucho gravável e avança após um registo", () => {
  const zx8302 = new ZX8302();
  const image = zx8302.mountMicrodrive(
    1,
    new Uint8Array(MICRODRIVE_FORMAT.imageSize),
    { name: "virgem.mdv", writeProtected: false },
  );
  const bus = new QLBus({ devices: [zx8302] });
  bus.write8(ZX8302_REGISTERS.transmitControl, ZX8302_REGISTERS.microdriveMode);
  selectMicrodrive(bus, 1);

  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x0a);
  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x0e);
  bus.write8(ZX8302_REGISTERS.microdriveTrack1, 0x12);
  bus.write8(ZX8302_REGISTERS.microdriveTrack2, 0x34);
  assert.deepEqual([...image.toUint8Array().subarray(0, 2)], [0x12, 0x34]);
  assert.equal(zx8302.microdriveSector, 0);

  for (let index = 2; index < 652; index += 1) {
    bus.write8(ZX8302_REGISTERS.microdriveTrack1, index);
  }
  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x0a);
  assert.equal(zx8302.microdriveSector, 1);
  assert.equal(zx8302.microdrivePhysicalOffset, 0);
  assert.equal(image.dirty, true);
});

test("ignora escritas físicas em imagens protegidas", () => {
  const zx8302 = new ZX8302();
  const image = zx8302.mountMicrodrive(1, new Uint8Array(MICRODRIVE_FORMAT.imageSize));
  const bus = new QLBus({ devices: [zx8302] });
  bus.write8(ZX8302_REGISTERS.transmitControl, ZX8302_REGISTERS.microdriveMode);
  selectMicrodrive(bus, 1);
  bus.write8(ZX8302_REGISTERS.microdriveControl, 0x0e);
  bus.write8(ZX8302_REGISTERS.microdriveTrack1, 0xff);
  assert.equal(image.toUint8Array()[0], 0);
  assert.equal(image.dirty, false);
  assert.equal(zx8302.microdrivePhysicalOffset, 1, "a fita continua a avançar fisicamente");
});
