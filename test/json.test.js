const test = require('node:test');
const assert = require('node:assert');
const { locate, parse, tokens } = require('../renderer/json');

test('locate devuelve la posicion exacta del JSON dentro de la linea', () => {
  const line = '2026-11-19T10:00:00Z INFO {"a":1} fin';
  const found = locate(line);
  assert.strictEqual(line.slice(found.start, found.end), '{"a":1}');
  assert.deepStrictEqual(found.value, { a: 1 });
  assert.strictEqual(locate('sin json'), null);
});

test('parse encuentra el JSON tras la hora y el nivel', () => {
  assert.deepStrictEqual(parse('2026-11-19T10:00:00.000Z INFO {"user":"ana","ok":true}'), { user: 'ana', ok: true });
});

test('parse soporta el formato de Lambda con request id y tabs', () => {
  const line = '2026-11-19T10:00:00.000Z\tc0ffee-1234\tERROR\t{"error":{"code":500}}';
  assert.deepStrictEqual(parse(line), { error: { code: 500 } });
});

test('parse salta corchetes de prefijo que no son JSON', () => {
  assert.deepStrictEqual(parse('[INFO] [worker-1] {"job":7}'), { job: 7 });
  assert.deepStrictEqual(parse('items: [{"id":1},{"id":2}]'), [{ id: 1 }, { id: 2 }]);
});

test('parse no toma como JSON los event ids de .NET ni arreglos de valores simples', () => {
  assert.strictEqual(parse('info: System.Net.Http.HttpClient.IngressHttpClient.ClientHandler[101]'), null);
  assert.strictEqual(parse('warn: Microsoft.AspNetCore.Server[3] retry [1, 2, 3]'), null);
  assert.deepStrictEqual(parse('info: App.Orders[7] {"orderId":42}'), { orderId: 42 });
});

test('parse ignora texto sin JSON y valores que no son objetos', () => {
  assert.strictEqual(parse('GET /health 200'), null);
  assert.strictEqual(parse('map {roto: 1}'), null);
  assert.strictEqual(parse('"solo un string"'), null);
});

test('tokens clasifica claves, strings, numeros y literales', () => {
  const types = (value) => tokens(value).filter((t) => t.type !== 'plain').map((t) => [t.type, t.text]);
  assert.deepStrictEqual(types({ a: 'x 1', b: -2.5, c: null, d: [true] }), [
    ['key', '"a"'], ['string', '"x 1"'],
    ['key', '"b"'], ['number', '-2.5'],
    ['key', '"c"'], ['literal', 'null'],
    ['key', '"d"'], ['literal', 'true']
  ]);
});

test('tokens reconstruye exactamente el JSON indentado', () => {
  const value = { msg: 'con "comillas" y \\ barra', n: [1, { x: false }] };
  assert.strictEqual(tokens(value).map((t) => t.text).join(''), JSON.stringify(value, null, 2));
});
