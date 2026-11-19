const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeTheme } = require('electron');

const WIDTH = 1440;
const HEIGHT = 900;
const OUTPUT = path.join(__dirname, '..', 'docs', 'screenshot-dark.png');

/* Abre la pestaña en vivo de un servicio con datos de ejemplo, agrega reglas a la Red de pesca y expande un JSON. */
const STAGE = `(async () => {
  const wait = async (fn) => {
    for (let i = 0; i < 200; i++) {
      const value = fn();
      if (value) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('La interfaz no llegó al estado esperado');
  };
  const row = await wait(() => [...document.querySelectorAll('#services tbody tr')].find((tr) => tr.cells[0]?.textContent === 'orders-api'));
  await wait(() => document.getElementById('overlay').hidden);
  row.querySelector('button.link').click();
  const tab = await wait(() => tabs.find((t) => t.lines?.length > 20));
  for (const pattern of ['TimeoutError', 'payments']) {
    tab.patternInput.value = pattern;
    tab.addRule();
  }
  document.querySelector('.log-view .json-toggle').click();
  tab.view.scrollTop = 0;
})()`;

app.whenReady().then(async () => {
  try {
    nativeTheme.themeSource = 'dark';
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      useContentSize: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'screenshot-preload.js'),
        contextIsolation: true,
        sandbox: true,
        offscreen: true
      }
    });
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    await win.webContents.executeJavaScript(STAGE);
    await new Promise((r) => setTimeout(r, 800));
    const image = await win.webContents.capturePage();
    win.destroy();

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, image.toPNG());
    console.log(`${path.relative(process.cwd(), OUTPUT)} (${image.getSize().width}x${image.getSize().height})`);
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
