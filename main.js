const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const awsCli = require('./src/aws');
const saml = require('./src/saml');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AWS Logs Fisher',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code || 'ERROR' };
    }
  });
}

handle('profiles:list', () => awsCli.listProfiles());
handle('region:default', (profile) => awsCli.defaultRegion(profile));
handle('auth:status', (ctx) => awsCli.authStatus(ctx));
handle('auth:roles', () => saml.listRoles());
handle('auth:login', (opts) => saml.login(opts));
handle('auth:cancel', () => saml.discardCache());
handle('ecs:clusters', (ctx) => awsCli.listClusters(ctx));
handle('ecs:services', (ctx, cluster) => awsCli.listServices(ctx, cluster));
handle('ecs:logtargets', (ctx, cluster, service) => awsCli.serviceLogTargets(ctx, cluster, service));
handle('logs:groups', (ctx, pattern) => awsCli.listLogGroups(ctx, pattern));

handle('logs:start', (ctx, id, opts) => {
  awsCli.startLogs(
    ctx,
    id,
    opts,
    (lines) => win?.webContents.send('logs:data', id, lines),
    (result) => win?.webContents.send('logs:end', id, result)
  );
});
handle('logs:stop', (id) => awsCli.stopLogs(id));

handle('search:start', (ctx, id, opts) => {
  awsCli.startSearch(
    ctx,
    id,
    opts,
    (page) => win?.webContents.send('search:page', id, page),
    (result) => win?.webContents.send('search:end', id, result)
  );
});
handle('search:cancel', (id) => awsCli.stopSearch(id));

app.whenReady().then(createWindow);
app.on('before-quit', () => {
  awsCli.stopAllLogs();
  awsCli.stopAllSearches();
  saml.discardCache();
});
app.on('window-all-closed', () => app.quit());
