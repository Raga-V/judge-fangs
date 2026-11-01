/* Judge Fangs desktop companion: a thin client. All AI and keys stay on the Render API.
 * Ctrl+Shift+J (Cmd+Shift+J on Mac) summons him. The screenshot is taken only on the shortcut,
 * shown to you first, sent only if you press "Judge this", and never written to disk. */
const { app, BrowserWindow, Menu, Tray, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SHORTCUT = 'CommandOrControl+Shift+J';
const MAX_WIDTH = 1280;
const MAX_BYTES = 600 * 1024;

function loadConfig() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch { /* defaults below */ }
  const strip = (u) => String(u || '').replace(/\/+$/, '');
  return {
    apiBase: strip(process.env.FANGS_API_BASE || file.apiBase || 'http://127.0.0.1:8000'),
    webBase: strip(process.env.FANGS_WEB_BASE || file.webBase || 'http://localhost:5173'),
  };
}

const config = loadConfig();
let overlay = null;
let tray = null;
let pendingShot = null; // the screenshot lives only here, in memory, until judged or dismissed

/* ---------- screenshot ---------- */

async function captureScreen() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const scale = Math.min(1, MAX_WIDTH / width);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
  });
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source) throw new Error('No screen to capture.');
  let img = source.thumbnail;
  for (const quality of [80, 68, 55, 45]) {
    const jpeg = img.toJPEG(quality);
    if (jpeg.length <= MAX_BYTES) return { dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64'), bytes: jpeg.length, display };
  }
  img = img.resize({ width: Math.round(img.getSize().width * 0.75) });
  const jpeg = img.toJPEG(45);
  return { dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64'), bytes: jpeg.length, display };
}

/* ---------- the overlay ---------- */

async function summon() {
  if (overlay) return dismiss();
  let shot = null;
  try {
    shot = await captureScreen(); // before the overlay appears, so he isn't in the picture
  } catch (e) {
    shot = { dataUrl: null, error: String(e.message || e), display: screen.getPrimaryDisplay() };
  }
  pendingShot = shot.dataUrl;
  const { bounds } = shot.display;
  overlay = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true, frame: false, resizable: false, movable: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.setIgnoreMouseEvents(true, { forward: true }); // click-through except the sprite and bubble
  overlay.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  overlay.on('closed', () => {
    overlay = null;
    pendingShot = null;
    globalShortcut.unregister('Escape');
  });
  globalShortcut.register('Escape', dismiss);
}

function dismiss() {
  pendingShot = null;
  if (overlay && !overlay.isDestroyed()) overlay.close();
}

ipcMain.handle('fangs:preview', () => pendingShot);

ipcMain.handle('fangs:interactive', (_e, on) => {
  if (overlay && !overlay.isDestroyed()) {
    overlay.setIgnoreMouseEvents(!on, { forward: true });
    if (on) overlay.focus();
  }
});

ipcMain.handle('fangs:dismiss', () => dismiss());

ipcMain.handle('fangs:judge', async () => {
  const image = pendingShot;
  pendingShot = null; // sent once, then forgotten
  if (!image) return { error: 'There was no screenshot to judge.' };
  try {
    const r = await fetch(`${config.apiBase}/api/judge-screen`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(180000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.verdict) return { error: body.error || `The tribunal answered ${r.status}.` };
    return body;
  } catch (e) {
    return { error: 'The tribunal is asleep (the API did not answer). Try again in a minute.' };
  }
});

ipcMain.handle('fangs:voice', async (_e, text) => {
  try {
    const r = await fetch(`${config.apiBase}/api/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 1000) }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
});

ipcMain.handle('fangs:open', (_e, id) => {
  if (/^[\w-]{1,64}$/.test(String(id))) shell.openExternal(`${config.webBase}/verdict/${id}`);
});

/* ---------- tray (a tiny gavel, drawn in code) ---------- */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function gavelIcon() {
  const art = [
    '................', '..kkkkkkkkk.....', '..kOoooooOk.....', '..kOoooooOk.....', '..kkkkokkkk.....', '......ok........',
    '......ok........', '......ok........', '......ok........', '......ok........', '....kkkkkk......', '...kggggggk.....',
    '...kGGGGGGk.....', '...kkkkkkkk.....', '................', '................',
  ];
  const colors = { k: [20, 10, 16, 255], O: [78, 45, 20, 255], o: [138, 90, 46, 255], g: [232, 196, 106, 255], G: [168, 132, 46, 255] };
  const raw = Buffer.alloc(16 * (16 * 4 + 1));
  art.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const px = colors[row[x]] || [0, 0, 0, 0];
      raw.set(px, y * 65 + 1 + x * 4);
    }
  });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return nativeImage.createFromBuffer(png);
}

app.whenReady().then(() => {
  if (!globalShortcut.register(SHORTCUT, summon)) console.error(`Could not register ${SHORTCUT}; another app may be using it.`);
  tray = new Tray(gavelIcon());
  tray.setToolTip(`Judge Fangs: press ${process.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Shift+J`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Summon the Count (${process.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Shift+J)`, click: summon },
    { label: `API: ${config.apiBase}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]));
  console.log(`Judge Fangs is waiting. Press ${SHORTCUT}. API: ${config.apiBase}`);
});

app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('will-quit', () => globalShortcut.unregisterAll());
