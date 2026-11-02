const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { buildIco } = require('./ico');

const RENDER_SIZE = 512;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SMALL_MAX = 48;
const assets = path.join(__dirname, '..', 'assets');

app.disableHardwareAcceleration();

async function render(win, svgFile) {
  await win.webContents.executeJavaScript(`(async () => {
    const img = document.getElementById('art');
    img.src = '../assets/${svgFile}';
    await img.decode();
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  return image.getSize().width === RENDER_SIZE ? image : image.resize({ width: RENDER_SIZE, height: RENDER_SIZE, quality: 'best' });
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: RENDER_SIZE,
      height: RENDER_SIZE,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: { offscreen: true }
    });
    await win.loadFile(path.join(__dirname, 'icon-render.html'));

    const main = await render(win, 'icon.svg');
    const small = await render(win, 'icon-small.svg');
    win.destroy();

    fs.writeFileSync(path.join(assets, 'icon.png'), main.toPNG());
    const entries = ICO_SIZES.map((size) => {
      const master = size <= SMALL_MAX ? small : main;
      return { size, png: master.resize({ width: size, height: size, quality: 'best' }).toPNG() };
    });
    fs.writeFileSync(path.join(assets, 'icon.ico'), buildIco(entries));
    console.log(`icon.png ${RENDER_SIZE}px + icon.ico (${ICO_SIZES.join(', ')}; icon-small.svg hasta ${SMALL_MAX}px)`);
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
