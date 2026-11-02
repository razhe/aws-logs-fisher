const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertMatch, NAME_RE } = require('./aws');

const ROLE_SCAN_RE = /arn:aws[a-z-]*:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+/g;
const ROLE_RE = /^arn:aws[a-z-]*:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+$/;
const TIMEOUT_MS = 5 * 60 * 1000;

let cacheFile = null;

function parseRoles(text) {
  const found = String(text).match(ROLE_SCAN_RE) ?? [];
  return [...new Set(found.map((arn) => arn.replace(/[.,]+$/, '')))].sort();
}

function runCapture(args) {
  return new Promise((resolve) => {
    cp.execFile('saml2aws', args, { windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

function failure(res, fallback) {
  const e = new Error((res.stderr || res.stdout || res.err?.message || fallback).trim().slice(-600));
  e.code = res.err?.code === 'ENOENT' ? 'NOT_INSTALLED' : 'ERROR';
  return e;
}

function discardCache() {
  if (!cacheFile) return;
  try {
    fs.rmSync(cacheFile, { force: true });
  } catch {
    /* el archivo temporal queda en la carpeta temporal del usuario */
  }
  cacheFile = null;
}

async function listRoles() {
  discardCache();
  cacheFile = path.join(os.tmpdir(), `aws-logs-fisher-saml-${crypto.randomBytes(8).toString('hex')}.cache`);
  const res = await runCapture(['list-roles', '--skip-prompt', '--cache-saml', `--cache-file=${cacheFile}`]);
  const roles = parseRoles(`${res.stdout}\n${res.stderr}`);
  if (!roles.length) {
    discardCache();
    throw failure(res, 'No se encontraron roles en la respuesta SAML');
  }
  return roles;
}

async function login({ profile, role }) {
  assertMatch(role, ROLE_RE, 'role');
  const args = ['login', '--force', '--skip-prompt', `--role=${role}`];
  if (profile) args.push('--profile', assertMatch(profile, NAME_RE, 'profile'));
  const usedCache = Boolean(cacheFile && fs.existsSync(cacheFile));
  if (usedCache) args.push('--cache-saml', `--cache-file=${cacheFile}`);
  try {
    const res = await runCapture(args);
    if (res.err) throw failure(res, 'No se pudo iniciar sesión');
    return { usedCache };
  } finally {
    discardCache();
  }
}

module.exports = { listRoles, login, discardCache, parseRoles, ROLE_RE };
