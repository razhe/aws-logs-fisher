const test = require('node:test');
const assert = require('node:assert');
const { paint } = require('../renderer/paint');

const typed = (text, opts) => paint(text, opts).filter((p) => p.type !== 'plain').map((p) => [p.type, p.text]);

test('colorea hora, nivel, request id y excepcion de una linea de Lambda', () => {
  const line = '2026-11-19T10:00:02.000Z\tc0ffee12-3456-7890-abcd-ef0123456789\tERROR\tTimeoutError: Task timed out';
  assert.deepStrictEqual(typed(line), [
    ['time', '2026-11-19T10:00:02.000Z'],
    ['id', 'c0ffee12-3456-7890-abcd-ef0123456789'],
    ['error', 'ERROR'],
    ['exception', 'TimeoutError']
  ]);
});

test('reconoce niveles y metodos HTTP sin colorear palabras comunes', () => {
  assert.deepStrictEqual(typed('[WARN] GET /api 200 · INFO ok · DEBUG x'), [['warn', 'WARN'], ['method', 'GET'], ['info', 'INFO'], ['debug', 'DEBUG']]);
  assert.deepStrictEqual(typed('no error here, get info later'), []);
  assert.deepStrictEqual(typed('Error suelto y ERRORES'), []);
});

test('los tramos reconstruyen la linea exacta', () => {
  const line = '2026-11-19 10:00:00,123 INFO POST /orders done';
  assert.strictEqual(paint(line).map((p) => p.text).join(''), line);
});

test('marca el termino buscado aunque cruce tramos de color', () => {
  const parts = paint('x INFO server up', { needle: 'info serv', ignoreCase: true });
  assert.deepStrictEqual(parts.filter((p) => p.mark).map((p) => [p.type, p.text]), [['info', 'INFO'], ['plain', ' serv']]);
  assert.strictEqual(parts.map((p) => p.text).join(''), 'x INFO server up');
});

test('sin termino o con distincion de mayusculas no marca de mas', () => {
  assert.ok(paint('INFO a').every((p) => !p.mark));
  assert.ok(paint('Info info', { needle: 'info' }).filter((p) => p.mark).every((p) => p.text === 'info'));
});
