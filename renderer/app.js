const $ = (id) => document.getElementById(id);

const MAX_LINES = 20000;
const TRIM_TO = 15000;
const MAX_CAPTURED = 5000;
const RULE_COLORS = ['#e5484d', '#f5a524', '#30a46c', '#3e63dd', '#8e4ec6', '#12a594'];
const MIN_NET = 90;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) el.append(c instanceof Node ? c : document.createTextNode(c ?? ''));
  return el;
}

const ctx = () => ({ profile: $('profile').value || undefined, region: $('region').value.trim() || undefined });

/* ---------- overlay de carga ---------- */

const OVERLAY_DELAY_MS = 150;
const INERT_IDS = ['header', 'banner', 'tabs', 'panels'];
const overlay = { count: 0, timer: 0 };

function setOverlayVisible(visible) {
  $('overlay').hidden = !visible;
  for (const id of INERT_IDS) $(id).inert = visible;
}

function setBusyText(text) {
  $('overlay-text').textContent = text;
}

async function busy(message, fn) {
  overlay.count++;
  setBusyText(message);
  if (overlay.count === 1) overlay.timer = setTimeout(() => setOverlayVisible(true), OVERLAY_DELAY_MS);
  try {
    return await fn();
  } finally {
    overlay.count--;
    if (!overlay.count) {
      clearTimeout(overlay.timer);
      setOverlayVisible(false);
    }
  }
}

function bindGroupSuggest(input, datalist, getRegion) {
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 3) return;
      const res = await window.api.listLogGroups({ ...ctx(), region: getRegion() || ctx().region }, q);
      if (res.ok) datalist.replaceChildren(...res.data.map((g) => h('option', { value: g })));
    }, 300);
  });
}

/* ---------- sesión ---------- */

function showBanner(message, isError = false) {
  const b = $('banner');
  b.textContent = message || '';
  b.className = isError ? 'banner error' : 'banner';
  b.hidden = !message;
}

function setAuth(status) {
  const el = $('auth');
  if (status.ok) {
    el.className = 'pill pill-ok';
    el.textContent = `Sesión activa · ${status.account}`;
    el.title = status.arn;
    showBanner('');
    return;
  }
  el.className = 'pill pill-bad';
  el.title = status.message || '';
  if (status.code === 'NOT_INSTALLED') el.textContent = 'AWS CLI no encontrado';
  else if (status.code === 'EXPIRED') el.textContent = 'Sesión expirada';
  else if (status.code === 'NO_CREDENTIALS') el.textContent = 'Sin credenciales';
  else el.textContent = 'Error de sesión';
  const needsLogin = status.code === 'EXPIRED' || status.code === 'NO_CREDENTIALS';
  showBanner(needsLogin ? 'Tu sesión SAML no está activa. Pulsa "Iniciar sesión SAML" y completa el login en el navegador.' : status.message, !needsLogin);
}

async function call(promise) {
  const res = await promise;
  if (res.ok) return res.data;
  if (res.code === 'EXPIRED' || res.code === 'NO_CREDENTIALS') setAuth({ ok: false, code: res.code, message: res.error });
  else showBanner(res.error, true);
  throw new Error(res.error);
}

async function checkAuth() {
  const res = await window.api.authStatus(ctx());
  setAuth(res.ok ? res.data : { ok: false, code: res.code, message: res.error });
  return res.ok && res.data.ok;
}

function loginError(res) {
  return res.code === 'NOT_INSTALLED' ? 'saml2aws no está instalado o no está en el PATH.' : `Login fallido: ${res.error}`;
}

function readPref(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: no se recuerda la elección */
  }
}

const readLastRole = () => readPref('lastRole');
const rememberRole = (role) => writePref('lastRole', role);

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'af-south-1',
  'ap-east-1', 'ap-south-1', 'ap-south-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3', 'ap-southeast-4', 'ap-southeast-5',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
  'ca-central-1', 'ca-west-1',
  'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1', 'eu-south-1', 'eu-south-2',
  'il-central-1', 'me-central-1', 'me-south-1', 'mx-central-1', 'sa-east-1'
];

function setRegion(selected) {
  const regions = selected && !AWS_REGIONS.includes(selected) ? [selected, ...AWS_REGIONS] : AWS_REGIONS;
  $('region').replaceChildren(h('option', { value: '' }, 'Elige una región'), ...regions.map((r) => h('option', { value: r }, r)));
  $('region').value = selected || '';
}

function describeRole(arn) {
  return { account: /::(\d{12}):/.exec(arn)?.[1] ?? '', name: arn.split('role/')[1] ?? arn };
}

function chooseRole(roles) {
  return new Promise((resolve) => {
    const last = readLastRole();
    const selected = roles.includes(last) ? last : roles[0];

    const items = roles.map((arn) => {
      const { account, name } = describeRole(arn);
      const input = h('input', { type: 'radio', name: 'role', value: arn });
      input.checked = arn === selected;
      return h('label', { class: 'role-item' }, input,
        h('span', { class: 'role-text' },
          h('strong', {}, name),
          h('span', { class: 'muted' }, ` · cuenta ${account}`),
          h('div', { class: 'role-arn muted mono' }, arn)));
    });

    const okBtn = h('button', { class: 'primary' }, 'Continuar');
    const cancelBtn = h('button', {}, 'Cancelar');
    const dialog = h('div', { class: 'overlay dialog-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Elegir rol de AWS' },
      h('div', { class: 'overlay-box dialog-box' },
        h('h3', {}, 'Elige el rol'),
        h('p', { class: 'muted' }, 'Tu usuario tiene acceso a varios roles de AWS. ¿Con cuál quieres continuar?'),
        h('div', { class: 'role-list' }, items),
        h('div', { class: 'dialog-actions' }, cancelBtn, okBtn)));

    const chosen = () => dialog.querySelector('input[name="role"]:checked')?.value ?? null;
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') close(chosen());
    };
    function close(value) {
      document.removeEventListener('keydown', onKey);
      dialog.remove();
      for (const id of INERT_IDS) $(id).inert = false;
      resolve(value);
    }

    okBtn.addEventListener('click', () => close(chosen()));
    cancelBtn.addEventListener('click', () => close(null));
    document.addEventListener('keydown', onKey);
    for (const id of INERT_IDS) $(id).inert = true;
    document.body.append(dialog);
    dialog.querySelector('input[name="role"]:checked')?.focus();
  });
}

async function login() {
  const btn = $('btn-login');
  btn.disabled = true;
  let ok = false;
  try {
    btn.textContent = 'Esperando login…';
    showBanner('Completa el inicio de sesión en la ventana del navegador (MFA incluido).');
    const roles = await window.api.listRoles();
    if (!roles.ok) {
      showBanner(loginError(roles), true);
      return;
    }

    let role = roles.data[0];
    if (roles.data.length > 1) {
      btn.textContent = 'Elige un rol…';
      showBanner('Elige el rol con el que quieres continuar.');
      role = await chooseRole(roles.data);
      if (!role) {
        await window.api.cancelLogin();
        showBanner('Inicio de sesión cancelado.');
        return;
      }
    }
    rememberRole(role);

    btn.textContent = 'Obteniendo credenciales…';
    showBanner('Obteniendo las credenciales del rol elegido…');
    const res = await window.api.login({ profile: $('profile').value || undefined, role });
    if (!res.ok) {
      showBanner(loginError(res), true);
      return;
    }
    ok = true;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Iniciar sesión SAML';
  }
  if (ok) refreshAll();
}

function refreshAll() {
  return busy('Verificando sesión…', async () => {
    if (!(await checkAuth())) return;
    if (!$('region').value) {
      showBanner('Elige una región de AWS para listar los servicios.');
      return;
    }
    setBusyText('Cargando clusters…');
    await loadClusters();
  });
}

/* ---------- pestañas ---------- */

const tabs = [];
let activeTab = null;

function addTab(tab) {
  tabs.push(tab);
  $('tabs').append(tab.button);
  $('panels').append(tab.panel);
  activateTab(tab);
}

function activateTab(tab) {
  if (activeTab === tab) return;
  activeTab?.onHide?.();
  activeTab = tab;
  for (const t of tabs) {
    t.button.classList.toggle('active', t === tab);
    t.panel.hidden = t !== tab;
  }
  tab.onShow?.();
}

function closeTab(tab) {
  const i = tabs.indexOf(tab);
  tab.destroy?.();
  tabs.splice(i, 1);
  tab.button.remove();
  tab.panel.remove();
  if (activeTab === tab) {
    activeTab = null;
    activateTab(tabs[Math.min(i, tabs.length - 1)]);
  }
}

function makeTabButton(title, { closable, onClick, onClose }) {
  const titleEl = h('span', { class: 'title' }, title);
  const live = h('span', { class: 'live', hidden: '' });
  const btn = h('div', { class: 'tab', role: 'tab', title }, live, titleEl);
  if (closable) btn.append(h('button', { class: 'close', title: 'Cerrar pestaña', onclick: (e) => { e.stopPropagation(); onClose(); } }, '×'));
  btn.addEventListener('click', onClick);
  btn.addEventListener('auxclick', (e) => { if (e.button === 1 && closable) onClose(); });
  return { btn, titleEl, live };
}

/* ---------- pestaña Servicios (solo estado general) ---------- */

const servicesTab = {
  button: null,
  panel: $('panel-services'),
  services: [],
  cluster: '',
  targets: new Map()
};
{
  const { btn } = makeTabButton('Servicios', { closable: false, onClick: () => activateTab(servicesTab) });
  servicesTab.button = btn;
}

function serviceHealth(s) {
  if (s.status !== 'ACTIVE') return { text: s.status, cls: 'warn' };
  if (s.desired === 0) return { text: 'Detenido', cls: 'muted' };
  if (s.running === s.desired) return { text: 'Saludable', cls: 'ok' };
  if (s.running === 0) return { text: 'Caído', cls: 'bad' };
  return { text: 'Degradado', cls: 'warn' };
}

async function loadClusters() {
  const sel = $('cluster');
  try {
    const clusters = await call(window.api.listClusters(ctx()));
    sel.replaceChildren(...clusters.map((c) => h('option', { value: c }, c)));
    if (clusters.includes(servicesTab.cluster)) sel.value = servicesTab.cluster;
    servicesTab.cluster = sel.value;
    if (clusters.length) {
      setBusyText(`Cargando servicios de ${servicesTab.cluster}… (puede tardar unos segundos)`);
      await loadServices();
    } else renderServices();
  } catch {
    sel.replaceChildren();
  }
}

async function loadServices() {
  if (!servicesTab.cluster) return;
  servicesTab.targets.clear();
  $('services').tBodies[0].replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'muted' }, 'Cargando…')));
  try {
    servicesTab.services = await call(window.api.listServices(ctx(), servicesTab.cluster));
    renderServices();
  } catch {
    $('services').tBodies[0].replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'bad' }, 'No se pudo cargar')));
  }
}

function renderServices() {
  const q = $('services-filter').value.trim().toLowerCase();
  const list = servicesTab.services.filter((s) => s.name.toLowerCase().includes(q));
  $('services-count').textContent = `${list.length} servicios`;
  const rows = list.map((s) => {
    const hl = serviceHealth(s);
    const action = h('td', {});
    resetActions(s.name, action);
    return h('tr', {},
      h('td', {}, s.name),
      h('td', { class: hl.cls }, hl.text),
      h('td', { class: 'mono' }, `${s.running} / ${s.desired}`),
      action);
  });
  $('services').tBodies[0].replaceChildren(...(rows.length ? rows : [h('tr', {}, h('td', { colspan: 4, class: 'muted' }, 'Sin servicios'))]));
}

function openFromGroupField(mode) {
  const input = $('open-group');
  const group = input.value.trim();
  if (!group) {
    input.focus();
    return;
  }
  const title = group.split('/').filter(Boolean).pop() || group;
  if (mode === 'search') openSearchTab({ title, group });
  else openLogTab({ title, group, since: '15m', follow: true, autoStart: true });
}

function resetActions(service, cell) {
  cell.replaceChildren(
    h('button', { class: 'link', title: 'Seguir los logs a medida que se escriben', onclick: () => openServiceTab(service, cell, 'tail') }, 'Logs en vivo'),
    h('button', { class: 'link', title: 'Buscar un término en un periodo pasado', onclick: () => openServiceTab(service, cell, 'search') }, 'Logs históricos'));
}

async function serviceLogTargets(service) {
  const key = `${servicesTab.cluster}/${service}`;
  if (!servicesTab.targets.has(key)) {
    const targets = await busy('Buscando el log group del servicio…', () => call(window.api.logTargets(ctx(), servicesTab.cluster, service)));
    servicesTab.targets.set(key, targets);
  }
  return servicesTab.targets.get(key);
}

async function openServiceTab(service, cell, mode) {
  let targets;
  try {
    targets = await serviceLogTargets(service);
  } catch {
    return;
  }
  if (!targets.length) {
    cell.replaceChildren(h('span', { class: 'muted' }, 'Sin logs en CloudWatch'));
    return;
  }
  const open = (t) => {
    const title = targets.length > 1 ? `${service}/${t.container}` : service;
    if (mode === 'search') openSearchTab({ title, group: t.group, prefix: t.prefix, region: t.region });
    else openLogTab({ title, group: t.group, prefix: t.prefix, region: t.region, since: '15m', follow: true, autoStart: true });
  };
  if (targets.length === 1) {
    open(targets[0]);
    return;
  }
  cell.replaceChildren(
    h('span', { class: 'muted' }, mode === 'search' ? 'Histórico:' : 'En vivo:'),
    ...targets.map((t) => h('button', { class: 'link', title: t.group, onclick: () => { open(t); resetActions(service, cell); } }, t.container)),
    h('button', { class: 'link', title: 'Cancelar', onclick: () => resetActions(service, cell) }, '×'));
}

/* ---------- pestaña de logs ---------- */

let tabSeq = 0;

class LogTab {
  constructor(opts = {}) {
    this.id = `log-${++tabSeq}`;
    this.lines = [];
    this.els = new Map();
    this.nextN = 1;
    this.rules = [];
    this.ruleSeq = 0;
    this.rows = [];
    this.rowByN = new Map();
    this.queue = [];
    this.raf = 0;
    this.running = false;
    this.rowsDirty = false;
    this.netState = 'normal';
    this.netHeight = 230;
    this.savedScroll = 0;
    this.region = opts.region;

    this.build(opts);
    const tb = makeTabButton(`En vivo · ${opts.title || 'nueva'}`, { closable: true, onClick: () => activateTab(this), onClose: () => closeTab(this) });
    this.button = tb.btn;
    this.titleEl = tb.titleEl;
    this.liveEl = tb.live;
    this.setNet('normal');
  }

  build(opts) {
    const listId = `groups-${this.id}`;
    this.groupInput = h('input', { class: 'group', list: listId, placeholder: '/aws/lambda/mi-funcion', spellcheck: 'false', value: opts.group || '' });
    this.groupList = h('datalist', { id: listId });
    this.prefixInput = h('input', { class: 'prefix', placeholder: 'prefijo de stream', spellcheck: 'false', value: opts.prefix || '' });
    this.sinceSel = h('select', {}, ...[['5m', '5 min'], ['15m', '15 min'], ['1h', '1 hora'], ['6h', '6 horas'], ['1d', '1 día'], ['3d', '3 días']].map(([v, t]) => h('option', { value: v }, t)));
    this.sinceSel.value = opts.since || '15m';
    this.formatSel = h('select', { title: 'Formato de salida de aws logs tail' }, h('option', { value: 'short' }, 'Formato corto'), h('option', { value: 'detailed' }, 'Con nombre de stream'));
    this.filterInput = h('input', { class: 'filter', placeholder: 'filtro del servidor', spellcheck: 'false', title: 'Patrón de filtro de CloudWatch Logs (se aplica en AWS antes de descargar)' });
    this.followChk = h('input', { type: 'checkbox' });
    this.followChk.checked = opts.follow !== false;
    this.autoChk = h('input', { type: 'checkbox' });
    this.autoChk.checked = true;
    this.startBtn = h('button', { class: 'primary', onclick: () => (this.running ? this.stop() : this.start()) }, 'Iniciar');
    this.statusEl = h('span', { class: 'log-status' }, 'Detenido');

    const toolbar = h('div', { class: 'toolbar log-toolbar' },
      this.groupInput, this.groupList, this.prefixInput,
      h('label', {}, 'Desde', this.sinceSel),
      this.formatSel,
      this.filterInput,
      h('label', {}, this.followChk, 'Seguir'),
      this.startBtn,
      h('button', { onclick: () => this.clearLog() }, 'Limpiar'),
      h('label', {}, this.autoChk, 'Auto-scroll'),
      this.statusEl);

    this.view = h('div', { class: 'log-view', 'data-placeholder': 'Escribe un log group (por ejemplo /aws/lambda/mi-funcion) y pulsa Iniciar.' });
    this.view.addEventListener('scroll', () => {
      this.autoChk.checked = this.view.scrollHeight - this.view.scrollTop - this.view.clientHeight < 30;
    });

    this.splitter = h('div', { class: 'splitter', title: 'Arrastra para cambiar la altura' });
    this.splitter.addEventListener('pointerdown', (e) => this.dragStart(e));

    this.net = this.buildNet();

    this.panel = h('section', { class: 'panel log-tab', hidden: '' }, toolbar, this.view, this.splitter, this.net);

    bindGroupSuggest(this.groupInput, this.groupList, () => this.region);
    for (const input of [this.groupInput, this.prefixInput, this.filterInput]) {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.start(); });
    }
  }

  buildNet() {
    this.patternInput = h('input', { class: 'pattern', placeholder: 'texto a capturar (ej. ERROR, timeout)', spellcheck: 'false' });
    this.regexChk = h('input', { type: 'checkbox' });
    this.caseChk = h('input', { type: 'checkbox' });
    this.netError = h('span', { class: 'net-error' });
    this.netCount = h('span', { class: 'muted' }, '0 capturas');
    this.minBtn = h('button', { title: 'Minimizar / restaurar', onclick: () => this.setNet(this.netState === 'min' ? 'normal' : 'min') }, 'Minimizar');
    this.maxBtn = h('button', { title: 'Ocupar toda la pantalla de logs / restaurar', onclick: () => this.setNet(this.netState === 'max' ? 'normal' : 'max') }, 'Maximizar');
    this.rulesEl = h('div', { class: 'rules' });
    this.tableAuto = true;
    this.tbody = h('tbody', {});
    this.emptyEl = h('div', { class: 'empty' }, 'Agrega un filtro arriba: las líneas que coincidan quedarán capturadas aquí.');
    this.tableWrap = h('div', { class: 'net-body' },
      h('table', {}, h('thead', {}, h('tr', {}, h('th', { class: 'col-time' }, 'Hora'), h('th', { class: 'col-rule' }, 'Regla'), h('th', {}, 'Línea'), h('th', { class: 'col-act' }))), this.tbody),
      this.emptyEl);

    const head = h('div', { class: 'net-head' },
      h('span', { class: 'net-title' }, 'Red de pesca'),
      this.patternInput,
      h('label', {}, this.regexChk, 'Regex'),
      h('label', {}, this.caseChk, 'Aa'),
      h('button', { class: 'primary', onclick: () => this.addRule() }, 'Capturar'),
      this.netError,
      h('span', { class: 'spacer' }),
      this.netCount,
      h('button', { onclick: () => this.copyRows() }, 'Copiar'),
      h('button', { onclick: () => this.clearRows() }, 'Vaciar'),
      this.minBtn,
      this.maxBtn);
    this.tableWrap.addEventListener('scroll', () => {
      this.tableAuto = this.tableWrap.scrollHeight - this.tableWrap.scrollTop - this.tableWrap.clientHeight < 30;
    });
    head.addEventListener('dblclick', (e) => { if (e.target === head || e.target.classList.contains('net-title')) this.setNet(this.netState === 'min' ? 'normal' : 'min'); });
    this.patternInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addRule(); });

    return h('div', { class: 'net' }, head, this.rulesEl, this.tableWrap);
  }

  /* --- ciclo de vida --- */

  onShow() {
    this.view.scrollTop = this.autoChk.checked ? this.view.scrollHeight : this.savedScroll;
  }

  onHide() {
    this.savedScroll = this.view.scrollTop;
  }

  destroy() {
    window.api.stopLogs(this.id);
    cancelAnimationFrame(this.raf);
  }

  setRunning(running, text, cls = '') {
    this.running = running;
    this.startBtn.textContent = running ? 'Detener' : 'Iniciar';
    this.startBtn.className = running ? 'danger' : 'primary';
    this.liveEl.hidden = !(running && this.followChk.checked);
    this.statusEl.textContent = text;
    this.statusEl.className = `log-status ${cls}`;
  }

  async start() {
    const group = this.groupInput.value.trim();
    if (!group) {
      this.groupInput.focus();
      return;
    }
    this.titleEl.textContent = `En vivo · ${this.titleOverride || group.split('/').filter(Boolean).pop() || group}`;
    this.button.title = group;
    this.clearLog();
    this.clearRows();
    this.setRunning(true, this.followChk.checked ? 'Escuchando…' : 'Descargando…', 'live');
    const res = await window.api.startLogs({ ...ctx(), region: this.region || ctx().region }, this.id, {
      group,
      prefix: this.prefixInput.value.trim(),
      since: this.sinceSel.value,
      follow: this.followChk.checked,
      filter: this.filterInput.value.trim(),
      format: this.formatSel.value
    });
    if (!res.ok) {
      this.setRunning(false, 'Error', 'err');
      this.note(res.error, true);
    }
  }

  stop() {
    window.api.stopLogs(this.id);
    this.setRunning(false, 'Detenido');
  }

  finish(result) {
    if (result.stopped) return;
    if (result.error) {
      this.setRunning(false, 'Error', 'err');
      this.note(result.error, true);
      if (result.code === 'EXPIRED') setAuth({ ok: false, code: 'EXPIRED', message: result.error });
    } else {
      this.setRunning(false, `Completado · ${this.lines.length} líneas`);
    }
  }

  note(text, isError = false) {
    this.view.append(h('div', { class: `ln note${isError ? ' err' : ''}` }, text));
    this.scrollIfAuto();
  }

  /* --- líneas --- */

  ingest(lines) {
    this.queue.push(...lines);
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }

  flush() {
    this.raf = 0;
    const batch = this.queue.splice(0);
    const frag = document.createDocumentFragment();
    const fresh = [];
    for (const text of batch) {
      const n = this.nextN++;
      this.lines.push({ n, text });
      const el = h('div', { class: 'ln' }, text || ' ');
      this.els.set(n, el);
      frag.append(el);
      const row = this.capture(n, text);
      if (row) {
        fresh.push(row);
        this.markLine(el, row);
      }
    }
    this.view.append(frag);
    this.trim();
    if (this.rowsDirty) this.renderRows();
    else if (fresh.length) this.appendRows(fresh);
    this.updateCounts();
    this.scrollIfAuto();
  }

  scrollIfAuto() {
    if (this.autoChk.checked) this.view.scrollTop = this.view.scrollHeight;
  }

  trim() {
    if (this.lines.length <= MAX_LINES) return;
    const drop = this.lines.splice(0, this.lines.length - TRIM_TO);
    for (const { n } of drop) {
      this.els.get(n)?.remove();
      this.els.delete(n);
    }
  }

  clearLog() {
    this.queue = [];
    this.lines = [];
    this.els.clear();
    this.view.replaceChildren();
  }

  /* --- red de pesca --- */

  ruleById(id) {
    return this.rules.find((r) => r.id === id);
  }

  addRule() {
    const pattern = this.patternInput.value.trim();
    if (!pattern) {
      this.patternInput.focus();
      return;
    }
    const regex = this.regexChk.checked;
    const caseSensitive = this.caseChk.checked;
    let test;
    try {
      test = Matcher.compile(pattern, { regex, caseSensitive });
    } catch (e) {
      this.netError.textContent = `Regex inválida: ${e.message}`;
      return;
    }
    this.netError.textContent = '';
    if (this.rules.some((r) => r.pattern === pattern && r.regex === regex && r.caseSensitive === caseSensitive)) return;

    const rule = { id: ++this.ruleSeq, pattern, regex, caseSensitive, test, color: RULE_COLORS[this.rules.length % RULE_COLORS.length], count: 0 };
    rule.countEl = h('span', { class: 'count' }, '0');
    rule.chip = h('span', { class: 'chip', title: `${regex ? 'Regex' : 'Texto'}${caseSensitive ? ', distingue mayúsculas' : ''}` },
      h('span', { class: 'dot' }), pattern, rule.countEl,
      h('button', { title: 'Quitar regla', onclick: () => this.removeRule(rule.id) }, '×'));
    rule.chip.style.setProperty('--c', rule.color);
    this.rules.push(rule);
    this.rulesEl.append(rule.chip);
    this.patternInput.value = '';

    for (const { n, text } of this.lines) {
      if (!rule.test(text)) continue;
      rule.count++;
      const row = this.rowByN.get(n);
      if (row) row.ruleIds.push(rule.id);
      else this.addRow(n, text, [rule.id]);
    }
    this.rows.sort((a, b) => a.n - b.n);
    this.refreshHighlights();
    this.renderRows();
    this.updateCounts();
  }

  removeRule(id) {
    this.rules = this.rules.filter((r) => r.id !== id);
    this.rulesEl.replaceChildren(...this.rules.map((r) => r.chip));
    this.rows = this.rows.filter((row) => {
      row.ruleIds = row.ruleIds.filter((x) => x !== id);
      if (!row.ruleIds.length) this.rowByN.delete(row.n);
      return row.ruleIds.length;
    });
    this.refreshHighlights();
    this.renderRows();
    this.updateCounts();
  }

  capture(n, text) {
    const ids = [];
    for (const rule of this.rules) {
      if (rule.test(text)) {
        rule.count++;
        ids.push(rule.id);
      }
    }
    return ids.length ? this.addRow(n, text, ids) : null;
  }

  addRow(n, text, ruleIds) {
    const row = { n, text, time: Matcher.extractTime(text), ruleIds };
    this.rows.push(row);
    this.rowByN.set(n, row);
    if (this.rows.length > MAX_CAPTURED) {
      this.rowByN.delete(this.rows.shift().n);
      this.rowsDirty = true;
    }
    return row;
  }

  markLine(el, row) {
    const rule = this.ruleById(row.ruleIds[0]);
    el.classList.add('hit');
    if (rule) el.style.setProperty('--c', rule.color);
  }

  refreshHighlights() {
    for (const [n, el] of this.els) {
      const row = this.rowByN.get(n);
      el.classList.toggle('hit', Boolean(row));
      if (row) this.markLine(el, row);
    }
  }

  rowEl(row) {
    const rules = row.ruleIds.map((id) => this.ruleById(id)).filter(Boolean);
    const tr = h('tr', { title: 'Ir a la línea en el log' },
      h('td', { class: 'time' }, row.time || '—'),
      h('td', {}, rules.map((r) => r.pattern).join(', ')),
      h('td', { class: 'msg' }, row.time ? Matcher.stripTime(row.text) : row.text),
      h('td', { class: 'act' }, this.copyButton(row)));
    if (rules[0]) tr.style.setProperty('--c', rules[0].color);
    tr.addEventListener('click', () => this.jumpTo(row.n));
    return tr;
  }

  copyButton(row) {
    const btn = h('button', { class: 'link', title: 'Copiar esta línea' }, 'Copiar');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(row.text);
        btn.textContent = 'Copiado';
      } catch {
        btn.textContent = 'Error';
      }
      setTimeout(() => { btn.textContent = 'Copiar'; }, 1200);
    });
    return btn;
  }

  renderRows() {
    this.rowsDirty = false;
    this.tbody.replaceChildren(...this.rows.map((r) => this.rowEl(r)));
    this.emptyEl.hidden = this.rows.length > 0;
    this.followTable();
  }

  appendRows(rows) {
    this.tbody.append(...rows.map((r) => this.rowEl(r)));
    this.emptyEl.hidden = true;
    this.followTable();
  }

  followTable() {
    if (this.tableAuto) this.tableWrap.scrollTop = this.tableWrap.scrollHeight;
  }

  updateCounts() {
    for (const r of this.rules) r.countEl.textContent = String(r.count);
    this.netCount.textContent = `${this.rows.length} capturas${this.rows.length >= MAX_CAPTURED ? ' (límite)' : ''}`;
  }

  clearRows() {
    this.rows = [];
    this.rowByN.clear();
    for (const r of this.rules) r.count = 0;
    this.refreshHighlights();
    this.renderRows();
    this.updateCounts();
  }

  async copyRows() {
    const text = this.rows.map((r) => [r.time, r.ruleIds.map((id) => this.ruleById(id)?.pattern).filter(Boolean).join(','), r.text].join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.netCount.textContent = `${this.rows.length} capturas · copiadas`;
    } catch {
      this.netCount.textContent = 'No se pudo copiar';
    }
  }

  jumpTo(n) {
    if (this.netState === 'max') this.setNet('normal');
    const el = this.els.get(n);
    if (!el) {
      this.statusEl.textContent = 'Esa línea ya salió del búfer';
      return;
    }
    this.autoChk.checked = false;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /* --- panel redimensionable --- */

  setNet(state) {
    this.netState = state;
    this.panel.classList.toggle('net-min', state === 'min');
    this.panel.classList.toggle('net-max', state === 'max');
    this.net.style.height = state === 'normal' ? `${this.netHeight}px` : '';
    this.minBtn.textContent = state === 'min' ? 'Restaurar' : 'Minimizar';
    this.maxBtn.textContent = state === 'max' ? 'Restaurar' : 'Maximizar';
  }

  dragStart(e) {
    e.preventDefault();
    this.splitter.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const rect = this.panel.getBoundingClientRect();
      const toolbarH = this.panel.firstElementChild.offsetHeight;
      const max = rect.height - toolbarH - 60;
      this.netHeight = Math.max(MIN_NET, Math.min(max, rect.bottom - ev.clientY));
      this.net.style.height = `${this.netHeight}px`;
    };
    const up = () => {
      this.splitter.removeEventListener('pointermove', move);
      this.splitter.removeEventListener('pointerup', up);
      this.splitter.removeEventListener('pointercancel', up);
    };
    this.splitter.addEventListener('pointermove', move);
    this.splitter.addEventListener('pointerup', up);
    this.splitter.addEventListener('pointercancel', up);
  }
}

function openLogTab(opts = {}) {
  const tab = new LogTab(opts);
  if (opts.title) tab.titleOverride = opts.title;
  addTab(tab);
  if (opts.autoStart) tab.start();
  else tab.groupInput.focus();
  return tab;
}

/* ---------- pestaña de búsqueda (periodo concreto, sin tiempo real) ---------- */

const SEARCH_LIMIT = 20000;
const SEARCH_PRESETS = [['15m', '15 min', 15 * 60e3], ['1h', '1 hora', 3600e3], ['6h', '6 horas', 6 * 3600e3], ['24h', '24 horas', 24 * 3600e3], ['3d', '3 días', 3 * 86400e3], ['7d', '7 días', 7 * 86400e3]];

const pad = (n, w = 2) => String(n).padStart(w, '0');
const fmtNum = (n) => Number(n).toLocaleString('es-CL');

function fmtLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function toInputValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function appendHighlighted(el, text, needle, ignoreCase) {
  const hay = ignoreCase ? text.toLowerCase() : text;
  const n = ignoreCase ? needle.toLowerCase() : needle;
  if (!n || hay.length !== text.length) {
    el.append(text);
    return;
  }
  let i = 0;
  let at;
  while ((at = hay.indexOf(n, i)) !== -1) {
    if (at > i) el.append(text.slice(i, at));
    el.append(h('mark', {}, text.slice(at, at + n.length)));
    i = at + n.length;
  }
  if (i < text.length) el.append(text.slice(i));
}

class SearchTab {
  constructor(opts = {}) {
    this.id = `search-${++tabSeq}`;
    this.region = opts.region;
    this.queue = [];
    this.results = [];
    this.raf = 0;
    this.searching = false;
    this.savedScroll = 0;
    this.term = '';
    this.raw = false;
    this.ignoreCase = true;

    this.build(opts);
    const tb = makeTabButton(`Histórico · ${opts.title || 'nueva'}`, { closable: true, onClick: () => activateTab(this), onClose: () => closeTab(this) });
    this.button = tb.btn;
    this.titleEl = tb.titleEl;
    this.liveEl = tb.live;
    this.applyPreset();
  }

  build(opts) {
    const listId = `groups-${this.id}`;
    this.groupInput = h('input', { class: 'group', list: listId, placeholder: '/aws/lambda/mi-funcion', spellcheck: 'false', value: opts.group || '' });
    this.groupList = h('datalist', { id: listId });
    this.prefixInput = h('input', { class: 'prefix', placeholder: 'prefijo de stream', spellcheck: 'false', value: opts.prefix || '' });
    this.presetSel = h('select', { title: 'Periodo' }, ...SEARCH_PRESETS.map(([v, t]) => h('option', { value: v }, `Últimos ${t}`)), h('option', { value: 'custom' }, 'Personalizado'));
    this.presetSel.value = '1h';
    this.fromInput = h('input', { type: 'datetime-local', title: 'Desde (hora local)' });
    this.toInput = h('input', { type: 'datetime-local', title: 'Hasta (hora local)' });
    this.termInput = h('input', { class: 'term', placeholder: 'término a buscar (vacío = todo el periodo)', spellcheck: 'false' });
    this.ignoreChk = h('input', { type: 'checkbox' });
    this.ignoreChk.checked = true;
    this.rawChk = h('input', { type: 'checkbox' });
    this.searchBtn = h('button', { class: 'primary', onclick: () => this.start() }, 'Buscar');
    this.statusEl = h('span', { class: 'log-status' }, 'Sin buscar');

    this.toolbar = h('div', { class: 'toolbar log-toolbar search-toolbar' },
      this.groupInput, this.groupList, this.prefixInput,
      this.presetSel,
      h('label', {}, 'Desde', this.fromInput),
      h('label', {}, 'Hasta', this.toInput),
      this.termInput,
      h('label', { title: 'CloudWatch distingue mayúsculas: prueba el término tal cual, en minúsculas, MAYÚSCULAS y Capitalizado' }, this.ignoreChk, 'Ignorar mayúsculas'),
      h('label', { title: 'Usar el término como patrón de filtro de CloudWatch (por ejemplo ?ERROR ?WARN)' }, this.rawChk, 'Patrón CloudWatch'),
      this.searchBtn,
      h('button', { onclick: () => this.copyResults() }, 'Copiar resultados'),
      h('button', { onclick: () => this.clearResults() }, 'Limpiar'),
      this.statusEl);

    this.view = h('div', { class: 'log-view', 'data-placeholder': 'Elige el periodo, escribe un término y pulsa Buscar. Los resultados no se actualizan en vivo.' });

    this.overlayText = h('div', {}, 'Buscando…');
    this.overlayEl = h('div', { class: 'overlay scoped', hidden: '' },
      h('div', { class: 'overlay-box' }, h('div', { class: 'spinner' }), this.overlayText, h('button', { class: 'danger', onclick: () => this.cancel() }, 'Cancelar')));

    this.panel = h('section', { class: 'panel log-tab', hidden: '' }, this.toolbar, this.view, this.overlayEl);

    bindGroupSuggest(this.groupInput, this.groupList, () => this.region);
    this.presetSel.addEventListener('change', () => this.applyPreset());
    for (const input of [this.fromInput, this.toInput]) input.addEventListener('input', () => { this.presetSel.value = 'custom'; });
    for (const input of [this.groupInput, this.prefixInput, this.termInput]) {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.start(); });
    }
  }

  applyPreset() {
    const preset = SEARCH_PRESETS.find(([v]) => v === this.presetSel.value);
    if (!preset) return;
    const now = Date.now();
    this.fromInput.value = toInputValue(now - preset[2]);
    this.toInput.value = toInputValue(now);
  }

  onShow() {
    this.view.scrollTop = this.savedScroll;
  }

  onHide() {
    this.savedScroll = this.view.scrollTop;
  }

  destroy() {
    window.api.cancelSearch(this.id);
    cancelAnimationFrame(this.raf);
  }

  setStatus(text, cls = '') {
    this.statusEl.textContent = text;
    this.statusEl.className = `log-status ${cls}`;
  }

  setSearching(searching) {
    this.searching = searching;
    this.overlayEl.hidden = !searching;
    this.toolbar.inert = searching;
    this.view.inert = searching;
    this.liveEl.hidden = !searching;
  }

  async start() {
    const group = this.groupInput.value.trim();
    if (!group) {
      this.groupInput.focus();
      return;
    }
    if (this.presetSel.value !== 'custom') this.applyPreset();
    const startMs = new Date(this.fromInput.value).getTime();
    const endMs = new Date(this.toInput.value).getTime() + 59999;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      this.setStatus('Revisa el periodo: "Desde" debe ser anterior a "Hasta"', 'err');
      return;
    }

    this.term = this.termInput.value.trim();
    this.raw = this.rawChk.checked;
    this.ignoreCase = this.ignoreChk.checked;
    this.clearResults();
    this.titleEl.textContent = `Histórico · ${this.titleOverride || group.split('/').filter(Boolean).pop() || group}`;
    this.button.title = group;
    this.overlayText.textContent = 'Buscando…';
    this.setStatus('Buscando…', 'live');
    this.setSearching(true);
    const res = await window.api.startSearch({ ...ctx(), region: this.region || ctx().region }, this.id, {
      group,
      prefix: this.prefixInput.value.trim(),
      term: this.term,
      raw: this.raw,
      ignoreCase: this.ignoreCase,
      startMs,
      endMs
    });
    if (!res.ok) {
      this.setSearching(false);
      this.setStatus('Error', 'err');
      this.note(res.error, true);
    }
  }

  cancel() {
    this.overlayText.textContent = 'Cancelando…';
    window.api.cancelSearch(this.id);
  }

  onPage({ events, total, pages }) {
    for (const ev of events) this.results.push(`${fmtLocal(ev.t)}\t${ev.m.replace(/\s+$/, '')}`);
    this.queue.push(...events);
    this.overlayText.textContent = `Buscando… ${fmtNum(total)} resultados · página ${pages}`;
    if (!this.raf && this.queue.length) this.raf = requestAnimationFrame(() => this.flush());
  }

  onSearchEnd(result) {
    this.setSearching(false);
    const total = fmtNum(result.total ?? 0);
    if (result.error) {
      this.setStatus('Error', 'err');
      this.note(result.error, true);
      if (result.code === 'EXPIRED') setAuth({ ok: false, code: 'EXPIRED', message: result.error });
    } else if (result.cancelled) {
      this.setStatus(`Cancelada · ${total} resultados`);
    } else {
      this.setStatus(`${total} resultados${result.truncated ? ` · límite de ${fmtNum(SEARCH_LIMIT)} alcanzado: acota el periodo o el término` : ''}`, result.truncated ? 'err' : '');
    }
    if (!result.total && !result.error && !result.cancelled) this.view.dataset.placeholder = 'Sin resultados para ese término en este periodo.';
  }

  flush() {
    this.raf = 0;
    const frag = document.createDocumentFragment();
    for (const ev of this.queue.splice(0, 1500)) {
      const el = h('div', { class: 'ln', title: ev.s }, h('span', { class: 'ts' }, fmtLocal(ev.t)));
      appendHighlighted(el, ev.m.replace(/\s+$/, ''), this.raw ? '' : this.term, this.ignoreCase);
      frag.append(el);
    }
    this.view.append(frag);
    if (this.queue.length) this.raf = requestAnimationFrame(() => this.flush());
  }

  note(text, isError = false) {
    this.view.append(h('div', { class: `ln note${isError ? ' err' : ''}` }, text));
  }

  clearResults() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.results = [];
    this.view.replaceChildren();
    this.view.dataset.placeholder = 'Elige el periodo, escribe un término y pulsa Buscar. Los resultados no se actualizan en vivo.';
  }

  async copyResults() {
    try {
      await navigator.clipboard.writeText(this.results.join('\n'));
      this.setStatus(`${fmtNum(this.results.length)} resultados copiados`);
    } catch {
      this.setStatus('No se pudo copiar', 'err');
    }
  }
}

function openSearchTab(opts = {}) {
  const tab = new SearchTab(opts);
  if (opts.title) tab.titleOverride = opts.title;
  addTab(tab);
  (opts.group ? tab.termInput : tab.groupInput).focus();
  return tab;
}

const tabById = (id) => tabs.find((t) => t.id === id);

window.api.onLogData((id, lines) => tabById(id)?.ingest?.(lines));
window.api.onLogEnd((id, result) => tabById(id)?.finish?.(result));
window.api.onSearchPage((id, page) => tabById(id)?.onPage?.(page));
window.api.onSearchEnd((id, result) => tabById(id)?.onSearchEnd?.(result));

/* ---------- arranque ---------- */

async function reloadContext() {
  servicesTab.services = [];
  servicesTab.cluster = '';
  await refreshAll();
}

async function init() {
  addTab(servicesTab);
  servicesTab.panel.hidden = false;

  const profiles = await call(window.api.listProfiles()).catch(() => []);
  $('profile').replaceChildren(...(profiles.length ? profiles : ['default']).map((p) => h('option', { value: p }, p)));
  if (profiles.includes('default')) $('profile').value = 'default';
  const profileRegion = await call(window.api.defaultRegion($('profile').value)).catch(() => '');
  setRegion(profileRegion || readPref('region'));

  $('profile').addEventListener('change', async () => {
    const res = await window.api.defaultRegion($('profile').value);
    if (res.ok && res.data) setRegion(res.data);
    reloadContext();
  });
  $('region').addEventListener('change', () => {
    writePref('region', $('region').value);
    reloadContext();
  });
  $('btn-check').addEventListener('click', () => busy('Verificando sesión…', checkAuth));
  $('btn-login').addEventListener('click', login);
  $('btn-theme').addEventListener('click', () => window.toggleTheme());
  $('btn-services').addEventListener('click', () => busy(`Cargando servicios de ${servicesTab.cluster}… (puede tardar unos segundos)`, loadServices));
  $('cluster').addEventListener('change', () => {
    servicesTab.cluster = $('cluster').value;
    busy(`Cargando servicios de ${servicesTab.cluster}… (puede tardar unos segundos)`, loadServices);
  });
  $('services-filter').addEventListener('input', renderServices);
  bindGroupSuggest($('open-group'), $('open-group-list'), () => undefined);
  $('btn-open-live').addEventListener('click', () => openFromGroupField('tail'));
  $('btn-open-history').addEventListener('click', () => openFromGroupField('search'));
  $('open-group').addEventListener('keydown', (e) => { if (e.key === 'Enter') openFromGroupField('tail'); });

  await refreshAll();
  setInterval(checkAuth, 2 * 60 * 1000);
}

init();
