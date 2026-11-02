const test = require('node:test');
const assert = require('node:assert');
const { compile, extractTime, stripTime } = require('../renderer/matcher');

test('stripTime quita solo el timestamp inicial', () => {
  assert.strictEqual(stripTime('2026-10-30T12:34:56 info: hola 2026-10-30T00:00:00'), 'info: hola 2026-10-30T00:00:00');
  assert.strictEqual(stripTime('sin hora'), 'sin hora');
});

test('texto plano ignora mayusculas por defecto', () => {
  const t = compile('error');
  assert.ok(t('2026-10-30T10:00:00 ERROR algo fallo'));
  assert.ok(!t('todo bien'));
});

test('texto plano puede distinguir mayusculas', () => {
  const t = compile('ERROR', { caseSensitive: true });
  assert.ok(t('x ERROR y'));
  assert.ok(!t('x error y'));
});

test('regex y su opcion de mayusculas', () => {
  const t = compile('status=(4|5)\\d\\d', { regex: true });
  assert.ok(t('GET / status=503'));
  assert.ok(!t('GET / status=200'));
  assert.ok(!compile('^abc$', { regex: true, caseSensitive: true })('ABC'));
});

test('regex invalida y patron vacio lanzan error', () => {
  assert.throws(() => compile('(', { regex: true }));
  assert.throws(() => compile(''));
});

test('extractTime toma el timestamp inicial', () => {
  assert.strictEqual(extractTime('2026-10-30T12:34:56.789 mensaje'), '2026-10-30 12:34:56.789');
  assert.strictEqual(extractTime('sin hora'), '');
});
