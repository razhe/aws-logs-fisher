const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  listProfiles: invoke('profiles:list'),
  defaultRegion: invoke('region:default'),
  authStatus: invoke('auth:status'),
  listRoles: invoke('auth:roles'),
  login: invoke('auth:login'),
  cancelLogin: invoke('auth:cancel'),
  listClusters: invoke('ecs:clusters'),
  listServices: invoke('ecs:services'),
  logTargets: invoke('ecs:logtargets'),
  listLogGroups: invoke('logs:groups'),
  startLogs: invoke('logs:start'),
  stopLogs: invoke('logs:stop'),
  startSearch: invoke('search:start'),
  cancelSearch: invoke('search:cancel'),
  onSearchPage: (cb) => ipcRenderer.on('search:page', (_e, id, page) => cb(id, page)),
  onSearchEnd: (cb) => ipcRenderer.on('search:end', (_e, id, result) => cb(id, result)),
  onLogData: (cb) => ipcRenderer.on('logs:data', (_e, id, lines) => cb(id, lines)),
  onLogEnd: (cb) => ipcRenderer.on('logs:end', (_e, id, result) => cb(id, result))
});
