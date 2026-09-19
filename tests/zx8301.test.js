import assert from "node:assert/strict";
import test from "node:test";
import { QLBus } from "../src/core/bus.js";
import { ZX8301, ZX8301_DISPLAY } from "../src/devices/zx8301.js";

function pixel(frame, x, y = 0) {
  const offset = (y * ZX8301_DISPLAY.width + x) * 4;
  return [...frame.slice(offset, offset + 4)];
}

test("o barramento encaminha MC_STAT e o registo continua write-only", () => {
  const zx8301 = new ZX8301();
  const bus = new QLBus({ devices: [zx8301] });

  bus.write8(ZX8301_DISPLAY.mcStatAddress, 0xff);
  assert.equal(zx8301.displayControl, 0x8a);
  assert.equal(zx8301.mode, 8);
  assert.equal(zx8301.blanked, true);
  assert.equal(zx8301.screenBase, ZX8301_DISPLAY.screenBase1);
  assert.equal(bus.read8(ZX8301_DISPLAY.mcStatAddress), 0xff);
});

test("RESET dos dispositivos repõe MODE 4, primeiro banco e vídeo ativo", () => {
  const zx8301 = new ZX8301();
  const bus = new QLBus({ devices: [zx8301] });
  bus.write8(ZX8301_DISPLAY.mcStatAddress, 0x8a);
  bus.resetDevices();

  assert.equal(zx8301.displayControl, 0);
  assert.equal(zx8301.mode, 4);
  assert.equal(zx8301.blanked, false);
  assert.equal(zx8301.screenBase, ZX8301_DISPLAY.screenBase0);
});

test("MODE 4 converte os planos G/R em preto, vermelho, verde e branco", () => {
  const zx8301 = new ZX8301();
  const bus = new QLBus({ devices: [zx8301] });
  bus.write8(0x20_000, 0x30); // G nos píxeis 2 e 3
  bus.write8(0x20_001, 0x50); // R nos píxeis 1 e 3
  const frame = zx8301.renderFrame(bus);

  assert.deepEqual(pixel(frame, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(frame, 1), [255, 0, 0, 255]);
  assert.deepEqual(pixel(frame, 2), [0, 255, 0, 255]);
  assert.deepEqual(pixel(frame, 3), [255, 255, 255, 255]);
});

test("MODE 8 produz quatro píxeis largos RGB por palavra", () => {
  const zx8301 = new ZX8301();
  const bus = new QLBus({ devices: [zx8301] });
  bus.write8(ZX8301_DISPLAY.mcStatAddress, 0x08);
  bus.write8(0x20_000, 0x88); // G nos píxeis 0 e 2
  bus.write8(0x20_001, 0xa5); // R em 0/1; B em 2/3
  const frame = zx8301.renderFrame(bus);

  assert.deepEqual(pixel(frame, 0), [255, 255, 0, 255]);
  assert.deepEqual(pixel(frame, 1), [255, 255, 0, 255]);
  assert.deepEqual(pixel(frame, 2), [255, 0, 0, 255]);
  assert.deepEqual(pixel(frame, 4), [0, 255, 255, 255]);
  assert.deepEqual(pixel(frame, 6), [0, 0, 255, 255]);
});

test("o bit F do MODE 8 alterna o fundo até ao próximo bit F", () => {
  const zx8301 = new ZX8301();
  const bus = new QLBus({ devices: [zx8301] });
  bus.write8(ZX8301_DISPLAY.mcStatAddress, 0x08);
  bus.write8(0x20_000, 0x60); // F vermelho no píxel 0; G no píxel 1
  bus.write8(0x20_001, 0x90); // R no píxel 0; B no píxel 1

  assert.deepEqual(pixel(zx8301.renderFrame(bus, { flashPhase: false }), 2), [0, 255, 255, 255]);
  assert.deepEqual(pixel(zx8301.renderFrame(bus, { flashPhase: true }), 2), [255, 0, 0, 255]);
});

test("blanking devolve um frame negro e o bit 7 escolhe o segundo banco", () => {
  const zx8301 = new ZX8301();
  const bus = new QLBus({ devices: [zx8301] });
  bus.write8(0x20_000, 0x80);
  bus.write8(0x28_000, 0x00);
  bus.write8(0x28_001, 0x80);
  bus.write8(ZX8301_DISPLAY.mcStatAddress, 0x80);
  assert.deepEqual(pixel(zx8301.renderFrame(bus), 0), [255, 0, 0, 255]);

  bus.write8(ZX8301_DISPLAY.mcStatAddress, 0x82);
  assert.deepEqual(pixel(zx8301.renderFrame(bus), 0), [0, 0, 0, 255]);
});
