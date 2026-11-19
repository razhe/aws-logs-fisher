const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { resolveBin, systemBin } = require('../src/bin');

const win = (PATH) => ({ env: { PATH }, platform: 'win32' });

test('resolveBin devuelve la ruta absoluta encontrada en el PATH', (t) => {
  t.mock.method(fs, 'existsSync', (p) => p === path.win32.join('C:\\Tools\\aws', 'fake-aws.exe'));
  assert.strictEqual(resolveBin('fake-aws', win('C:\\Windows;C:\\Tools\\aws')), 'C:\\Tools\\aws\\fake-aws.exe');
});

test('resolveBin ignora entradas relativas del PATH, como la carpeta actual', (t) => {
  t.mock.method(fs, 'existsSync', (p) => !path.win32.isAbsolute(p) || p.startsWith('.'));
  assert.throws(() => resolveBin('planted', win('.;bin;')), (e) => e.code === 'NOT_INSTALLED');
});

test('resolveBin informa NOT_INSTALLED si no esta en ningun directorio', (t) => {
  t.mock.method(fs, 'existsSync', () => false);
  assert.throws(() => resolveBin('missing-tool', win('C:\\Windows')), (e) => e.code === 'NOT_INSTALLED' && /missing-tool/.test(e.message));
});

test('fuera de Windows se deja el nombre tal cual', () => {
  assert.strictEqual(resolveBin('aws', { env: { PATH: '/usr/bin' }, platform: 'linux' }), 'aws');
});

test('systemBin apunta a System32', () => {
  assert.match(systemBin('taskkill'), /System32\\taskkill\.exe$/i);
});
