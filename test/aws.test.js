const test = require('node:test');
const assert = require('node:assert');
const { assertMatch, baseArgs, classifyError, chunk, mapLimit, buildFilterPattern, startSearch } = require('../src/aws');

test('buildFilterPattern cita el termino y escapa comillas y barras', () => {
  assert.strictEqual(buildFilterPattern('timeout'), '"timeout"');
  assert.strictEqual(buildFilterPattern('say "hi"'), '"say \\"hi\\""');
  assert.strictEqual(buildFilterPattern('a\\b'), '"a\\\\b"');
  assert.strictEqual(buildFilterPattern('  '), '');
});

test('buildFilterPattern con ignoreCase genera variantes unicas', () => {
  assert.strictEqual(buildFilterPattern('timeout', { ignoreCase: true }), '?"timeout" ?"TIMEOUT" ?"Timeout"');
  assert.strictEqual(buildFilterPattern('12345', { ignoreCase: true }), '"12345"');
});

test('buildFilterPattern en modo raw respeta el patron tal cual', () => {
  assert.strictEqual(buildFilterPattern('?ERROR ?WARN', { raw: true }), '?ERROR ?WARN');
});

test('startSearch rechaza rangos y grupos invalidos antes de lanzar nada', () => {
  const noop = () => {};
  assert.throws(() => startSearch({}, 'x', { group: '/ok', startMs: 10, endMs: 5 }, noop, noop), /rango/);
  assert.throws(() => startSearch({}, 'x', { group: '--bad', startMs: 1, endMs: 5 }, noop, noop), /inválido/);
});

test('mapLimit conserva el orden y respeta el limite de concurrencia', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return x * 2;
  });
  assert.deepStrictEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});

test('baseArgs agrega profile y region validos', () => {
  assert.deepStrictEqual(baseArgs({ profile: 'default', region: 'us-east-1' }), ['--profile', 'default', '--region', 'us-east-1']);
  assert.deepStrictEqual(baseArgs({}), []);
});

test('baseArgs rechaza valores con caracteres de inyeccion', () => {
  assert.throws(() => baseArgs({ profile: 'x; calc' }));
  assert.throws(() => baseArgs({ region: 'us-east-1 --debug' }));
});

test('assertMatch acepta nombres de cluster/log group tipicos', () => {
  assert.strictEqual(assertMatch('/ecs/my-service_1', /^[A-Za-z0-9._\-/:]{1,512}$/, 'x'), '/ecs/my-service_1');
});

test('valores que empiezan con guion se rechazan (no pueden ser opciones del CLI)', () => {
  assert.throws(() => baseArgs({ profile: '--endpoint-url' }));
  assert.throws(() => assertMatch('-x', /^(?!-)[a-z-]+$/, 'x'));
});

test('classifyError distingue sesion expirada', () => {
  assert.strictEqual(classifyError('An error occurred (ExpiredToken) when calling'), 'EXPIRED');
  assert.strictEqual(classifyError('Unable to locate credentials'), 'NO_CREDENTIALS');
  assert.strictEqual(classifyError('AccessDeniedException'), 'DENIED');
  assert.strictEqual(classifyError('boom'), 'ERROR');
});

test('chunk divide en grupos', () => {
  assert.deepStrictEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
