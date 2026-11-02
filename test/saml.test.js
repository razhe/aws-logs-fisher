const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const { listRoles, login, discardCache, parseRoles, ROLE_RE } = require('../src/saml');

const account = (digit) => String(digit).repeat(12);
const DEV = `arn:aws:iam::${account(1)}:role/example_dev_admin`;
const PROD = `arn:aws:iam::${account(2)}:role/example_prod_readonly`;
const GOV = `arn:aws-us-gov:iam::${account(3)}:role/gov-role`;
const USER = `arn:aws:iam::${account(4)}:user/alguien`;

function cacheArg(args) {
  return args.find((a) => a.startsWith('--cache-file='))?.slice('--cache-file='.length);
}

function stubSaml(t, handler) {
  const calls = [];
  t.mock.method(cp, 'execFile', (file, args, opts, cb) => {
    calls.push({ file, args });
    handler(args, cb);
    return {};
  });
  t.after(() => discardCache());
  return calls;
}

test('parseRoles extrae roles de stdout y stderr, sin duplicados y ordenados', () => {
  const text = [
    'time="2026-10-30" level=info msg="Using IDP Account default"',
    PROD,
    `Roles: ${DEV}, y otra vez ${PROD}.`,
    USER,
    GOV
  ].join('\n');
  assert.deepStrictEqual(parseRoles(text), [DEV, PROD, GOV].sort());
  assert.deepStrictEqual(parseRoles('sin roles aqui'), []);
});

test('ROLE_RE acepta ARNs de rol y rechaza intentos de inyectar opciones', () => {
  assert.ok(ROLE_RE.test(DEV));
  assert.ok(ROLE_RE.test(`arn:aws:iam::${account(5)}:role/path/to/Role-Name_1`));
  assert.ok(!ROLE_RE.test(`${DEV} --profile otro`));
  assert.ok(!ROLE_RE.test('--role=x'));
  assert.ok(!ROLE_RE.test(USER));
});

test('listRoles autentica una vez, guarda la respuesta SAML y devuelve los roles (aunque salgan por stderr)', async (t) => {
  const calls = stubSaml(t, (args, cb) => {
    fs.writeFileSync(cacheArg(args), '<saml/>');
    cb(null, '', `time=... msg="roles"\n${PROD}\n${DEV}\n`);
  });
  const roles = await listRoles();
  assert.deepStrictEqual(roles, [DEV, PROD]);
  assert.strictEqual(calls[0].file, 'saml2aws');
  assert.deepStrictEqual(calls[0].args.slice(0, 3), ['list-roles', '--skip-prompt', '--cache-saml']);
  assert.ok(fs.existsSync(cacheArg(calls[0].args)));
});

test('login usa el rol elegido, reutiliza la misma respuesta SAML y la borra al terminar', async (t) => {
  const calls = stubSaml(t, (args, cb) => {
    if (args[0] === 'list-roles') {
      fs.writeFileSync(cacheArg(args), '<saml/>');
      cb(null, `${DEV}\n${PROD}\n`, '');
    } else cb(null, '', '');
  });
  await listRoles();
  const result = await login({ profile: 'default', role: PROD });

  const [listCall, loginCall] = calls;
  assert.deepStrictEqual(result, { usedCache: true });
  assert.strictEqual(loginCall.args[0], 'login');
  assert.ok(loginCall.args.includes(`--role=${PROD}`));
  assert.ok(loginCall.args.includes('--skip-prompt'));
  const at = loginCall.args.indexOf('--profile');
  assert.deepStrictEqual(loginCall.args.slice(at, at + 2), ['--profile', 'default']);
  assert.ok(loginCall.args.includes('--cache-saml'));
  assert.strictEqual(cacheArg(loginCall.args), cacheArg(listCall.args));
  assert.ok(!fs.existsSync(cacheArg(listCall.args)), 'el archivo temporal debe borrarse');
});

test('login sin respuesta SAML guardada no pasa flags de cache (saml2aws vuelve a autenticar)', async (t) => {
  const calls = stubSaml(t, (args, cb) => cb(null, '', ''));
  const result = await login({ role: DEV });
  assert.deepStrictEqual(result, { usedCache: false });
  assert.ok(!calls[0].args.includes('--cache-saml'));
  assert.ok(!calls[0].args.includes('--profile'));
});

test('listRoles sin roles lanza el mensaje de saml2aws y no deja archivo temporal', async (t) => {
  const calls = stubSaml(t, (args, cb) => {
    fs.writeFileSync(cacheArg(args), '<saml/>');
    cb(Object.assign(new Error('exit 1'), { code: 1 }), '', 'authentication failed: timeout');
  });
  await assert.rejects(listRoles(), (e) => e.message.includes('authentication failed') && e.code === 'ERROR');
  assert.ok(!fs.existsSync(cacheArg(calls[0].args)));
});

test('saml2aws no instalado se reporta como NOT_INSTALLED', async (t) => {
  stubSaml(t, (args, cb) => cb(Object.assign(new Error('spawn saml2aws ENOENT'), { code: 'ENOENT' }), '', ''));
  await assert.rejects(listRoles(), (e) => e.code === 'NOT_INSTALLED');
  await assert.rejects(login({ role: DEV }), (e) => e.code === 'NOT_INSTALLED');
});

test('si login falla, igualmente se borra la respuesta SAML', async (t) => {
  const calls = stubSaml(t, (args, cb) => {
    if (args[0] === 'list-roles') {
      fs.writeFileSync(cacheArg(args), '<saml/>');
      cb(null, `${DEV}\n`, '');
    } else cb(Object.assign(new Error('exit 1'), { code: 1 }), '', 'role not allowed');
  });
  await listRoles();
  await assert.rejects(login({ role: DEV }), /role not allowed/);
  assert.ok(!fs.existsSync(cacheArg(calls[0].args)));
});

test('login rechaza un rol invalido sin lanzar saml2aws', async (t) => {
  const calls = stubSaml(t, (args, cb) => cb(null, '', ''));
  await assert.rejects(login({ role: '--profile=otro' }), /inválido/);
  await assert.rejects(login({ role: `${DEV} --force` }), /inválido/);
  assert.strictEqual(calls.length, 0);
});
