const test = require('node:test');
const assert = require('node:assert');
const { buildIco } = require('../scripts/ico');

test('buildIco arma un contenedor ICO valido con entradas PNG', () => {
  const png16 = Buffer.from('png16');
  const png256 = Buffer.from('png256-data');
  const ico = buildIco([{ size: 16, png: png16 }, { size: 256, png: png256 }]);

  assert.strictEqual(ico.readUInt16LE(0), 0);
  assert.strictEqual(ico.readUInt16LE(2), 1);
  assert.strictEqual(ico.readUInt16LE(4), 2);

  const first = 6;
  assert.strictEqual(ico.readUInt8(first), 16);
  assert.strictEqual(ico.readUInt32LE(first + 8), png16.length);
  const firstOffset = ico.readUInt32LE(first + 12);
  assert.strictEqual(ico.subarray(firstOffset, firstOffset + png16.length).toString(), 'png16');

  const second = 6 + 16;
  assert.strictEqual(ico.readUInt8(second), 0);
  const secondOffset = ico.readUInt32LE(second + 12);
  assert.strictEqual(secondOffset, firstOffset + png16.length);
  assert.strictEqual(ico.subarray(secondOffset).toString(), 'png256-data');
});
