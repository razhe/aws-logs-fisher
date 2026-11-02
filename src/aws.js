const { execFile, spawn } = require('node:child_process');

const NAME_RE = /^(?!-)[A-Za-z0-9._\-/:]{1,512}$/;
const LOG_GROUP_RE = /^(?!-)[A-Za-z0-9._\-/#]{1,512}$/;
const STREAM_PREFIX_RE = /^(?!-)[A-Za-z0-9._\-/#$[\]=+@]{1,512}$/;
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
const SINCE_RE = /^\d{1,4}[smhd]$/;
const FORMATS = ['short', 'detailed'];

function assertMatch(value, re, label) {
  if (typeof value !== 'string' || !re.test(value)) throw new Error(`Valor inválido para ${label}`);
  return value;
}

function baseArgs({ profile, region }) {
  const args = [];
  if (profile) args.push('--profile', assertMatch(profile, NAME_RE, 'profile'));
  if (region) args.push('--region', assertMatch(region, REGION_RE, 'region'));
  return args;
}

function classifyError(stderr) {
  if (/ExpiredToken|expired/i.test(stderr)) return 'EXPIRED';
  if (/Unable to locate credentials|NoCredentialProviders|could not be found/i.test(stderr)) return 'NO_CREDENTIALS';
  if (/AccessDenied|not authorized/i.test(stderr)) return 'DENIED';
  return 'ERROR';
}

function run(file, args, { timeout = 60000, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error((stderr || err.message).trim());
        e.code = err.code === 'ENOENT' ? 'NOT_INSTALLED' : classifyError(stderr || '');
        return reject(e);
      }
      resolve(stdout);
    });
  });
}

async function aws(ctx, args, opts) {
  const out = await run('aws', [...args, ...baseArgs(ctx), '--output', 'json'], opts);
  return out.trim() ? JSON.parse(out) : {};
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function listProfiles() {
  const out = await run('aws', ['configure', 'list-profiles']);
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

async function defaultRegion(profile) {
  const args = ['configure', 'get', 'region'];
  if (profile) args.push('--profile', assertMatch(profile, NAME_RE, 'profile'));
  try {
    return (await run('aws', args)).trim();
  } catch {
    return '';
  }
}

async function authStatus(ctx) {
  try {
    const id = await aws(ctx, ['sts', 'get-caller-identity'], { timeout: 20000 });
    return { ok: true, account: id.Account, arn: id.Arn };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

async function listClusters(ctx) {
  const { clusterArns = [] } = await aws(ctx, ['ecs', 'list-clusters']);
  return clusterArns.map((arn) => arn.split('/').pop()).sort((a, b) => a.localeCompare(b));
}

async function listServices(ctx, cluster) {
  assertMatch(cluster, NAME_RE, 'cluster');
  const { serviceArns = [] } = await aws(ctx, ['ecs', 'list-services', '--cluster', cluster]);
  const responses = await mapLimit(chunk(serviceArns, 10), 6, (group) =>
    aws(ctx, ['ecs', 'describe-services', '--cluster', cluster, '--services', ...group]));
  return responses
    .flatMap((res) => res.services)
    .map((s) => ({ name: s.serviceName, status: s.status, desired: s.desiredCount, running: s.runningCount, pending: s.pendingCount }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function serviceLogTargets(ctx, cluster, service) {
  assertMatch(cluster, NAME_RE, 'cluster');
  assertMatch(service, NAME_RE, 'service');
  const { services } = await aws(ctx, ['ecs', 'describe-services', '--cluster', cluster, '--services', service]);
  if (!services[0]) throw new Error('Servicio no encontrado');
  const { taskDefinition } = await aws(ctx, ['ecs', 'describe-task-definition', '--task-definition', services[0].taskDefinition]);
  return taskDefinition.containerDefinitions
    .filter((c) => c.logConfiguration?.logDriver === 'awslogs')
    .map((c) => {
      const o = c.logConfiguration.options || {};
      return {
        container: c.name,
        group: o['awslogs-group'],
        prefix: o['awslogs-stream-prefix'] ? `${o['awslogs-stream-prefix']}/${c.name}` : '',
        region: o['awslogs-region'] || ''
      };
    });
}

async function listLogGroups(ctx, pattern) {
  assertMatch(pattern, LOG_GROUP_RE, 'logGroup');
  const res = await aws(ctx, ['logs', 'describe-log-groups', `--log-group-name-pattern=${pattern}`, '--max-items', '50'], { timeout: 30000 });
  return (res.logGroups || []).map((g) => g.logGroupName).sort((a, b) => a.localeCompare(b));
}

const MAX_RESULTS = 20000;
const MAX_PAGES = 400;
const searches = new Map();

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill();
}

function caseVariants(term) {
  const capitalized = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();
  return [...new Set([term, term.toLowerCase(), term.toUpperCase(), capitalized])];
}

function quoteTerm(term) {
  return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildFilterPattern(term, { raw = false, ignoreCase = false } = {}) {
  const t = String(term ?? '').trim();
  if (!t) return '';
  if (raw) return t.slice(0, 1024);
  const variants = ignoreCase ? caseVariants(t.slice(0, 256)) : [t.slice(0, 256)];
  return variants.length === 1 ? quoteTerm(variants[0]) : variants.map((v) => `?${quoteTerm(v)}`).join(' ');
}

function runCancellable(args, state) {
  return new Promise((resolve, reject) => {
    state.child = execFile('aws', args, { windowsHide: true, timeout: 120000, maxBuffer: 128 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (state.cancelled) return resolve(null);
      if (err) {
        const e = new Error((stderr || err.message).trim());
        e.code = err.code === 'ENOENT' ? 'NOT_INSTALLED' : classifyError(stderr || '');
        return reject(e);
      }
      resolve(stdout);
    });
  });
}

async function runSearch(ctx, state, { group, prefix, pattern, startMs, endMs }, onPage, onEnd) {
  let token = '';
  let total = 0;
  let pages = 0;
  let cut = false;
  try {
    do {
      const args = ['logs', 'filter-log-events', '--log-group-name', group, '--start-time', String(startMs), '--end-time', String(endMs), '--no-paginate', ...baseArgs(ctx), '--output', 'json'];
      if (prefix) args.push(`--log-stream-name-prefix=${prefix}`);
      if (pattern) args.push(`--filter-pattern=${pattern}`);
      if (token) args.push(`--next-token=${token}`);
      const out = await runCancellable(args, state);
      if (out === null) return onEnd({ cancelled: true, total, pages });
      const res = JSON.parse(out);
      pages++;
      const all = (res.events || []).map((e) => ({ t: e.timestamp, s: e.logStreamName, m: e.message }));
      const events = all.slice(0, MAX_RESULTS - total);
      cut = events.length < all.length;
      total += events.length;
      onPage({ events, total, pages });
      token = res.nextToken || '';
    } while (token && !cut && pages < MAX_PAGES && total < MAX_RESULTS);
    onEnd({ total, pages, truncated: cut || Boolean(token) });
  } catch (e) {
    onEnd({ error: e.message, code: e.code || 'ERROR', total, pages });
  }
}

function startSearch(ctx, id, { group, prefix, term, raw = false, ignoreCase = false, startMs, endMs }, onPage, onEnd) {
  assertMatch(group, LOG_GROUP_RE, 'logGroup');
  if (prefix) assertMatch(prefix, STREAM_PREFIX_RE, 'prefix');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) throw new Error('El rango de fechas no es válido');

  stopSearch(id);
  const state = { cancelled: false, child: null };
  searches.set(id, state);
  const params = { group, prefix: prefix || '', pattern: buildFilterPattern(term, { raw, ignoreCase }), startMs: Math.trunc(startMs), endMs: Math.trunc(endMs) };
  runSearch(ctx, state, params, onPage, (result) => {
    if (searches.get(id) === state) searches.delete(id);
    onEnd(result);
  });
}

function stopSearch(id) {
  const state = searches.get(id);
  if (!state) return;
  state.cancelled = true;
  searches.delete(id);
  killTree(state.child);
}

function stopAllSearches() {
  for (const id of [...searches.keys()]) stopSearch(id);
}

const streams = new Map();

function startLogs(ctx, id, { group, prefix, since = '15m', follow = false, filter = '', format = 'short' }, onLine, onEnd) {
  assertMatch(group, LOG_GROUP_RE, 'logGroup');
  assertMatch(since, SINCE_RE, 'since');
  if (!FORMATS.includes(format)) throw new Error('Formato inválido');
  const args = ['logs', 'tail', group, '--since', since, '--format', format, ...baseArgs(ctx)];
  if (prefix) args.push(`--log-stream-name-prefix=${assertMatch(prefix, STREAM_PREFIX_RE, 'prefix')}`);
  if (filter) args.push(`--filter-pattern=${String(filter).slice(0, 256)}`);
  if (follow) args.push('--follow');

  stopLogs(id);
  const child = spawn('aws', args, { windowsHide: true });
  streams.set(id, child);
  let errBuf = '';
  let outBuf = '';
  child.stdout.on('data', (d) => {
    outBuf += d.toString('utf8');
    const lines = outBuf.split(/\r?\n/);
    outBuf = lines.pop();
    if (lines.length) onLine(lines);
  });
  child.stderr.on('data', (d) => { errBuf += d.toString('utf8'); });
  child.on('error', (e) => onEnd({ error: e.message, code: e.code === 'ENOENT' ? 'NOT_INSTALLED' : 'ERROR' }));
  child.on('close', (code) => {
    const stopped = streams.get(id) !== child;
    if (!stopped) streams.delete(id);
    if (outBuf) onLine([outBuf]);
    onEnd(code === 0 || stopped ? { stopped } : { error: errBuf.trim(), code: classifyError(errBuf) });
  });
}

function stopLogs(id) {
  const child = streams.get(id);
  if (!child) return;
  streams.delete(id);
  killTree(child);
}

function stopAllLogs() {
  for (const id of [...streams.keys()]) stopLogs(id);
}

module.exports = {
  assertMatch, NAME_RE, baseArgs, classifyError, chunk, mapLimit,
  listProfiles, defaultRegion, authStatus,
  listClusters, listServices, serviceLogTargets, listLogGroups,
  startLogs, stopLogs, stopAllLogs,
  buildFilterPattern, startSearch, stopSearch, stopAllSearches
};
