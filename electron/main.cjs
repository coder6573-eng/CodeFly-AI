const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');

/**
 * CodeFly desktop shell.
 *
 * Security posture:
 *  - renderer is sandboxed, context-isolated, and has no Node access
 *  - the only bridge is a single allowlisted HTTPS proxy for AI gateways
 *  - there is no shell/terminal IPC channel at all
 */
const ALLOWED_HOSTS = new Set([
  'ai-gateway.kilo.ai',
  'api.llm7.io',
  'text.pollinations.ai',
  'oai.endpoints.kepler.ai.cloud.ovh.net',
  'api.free.ai',
]);

function isAllowed(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#08090d',
    autoHideMenuBar: true,
    title: 'CodeFly AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://') || url.startsWith('http://localhost:5173')) return;
    event.preventDefault();
    if (url.startsWith('https://')) shell.openExternal(url);
  });

  const isDev = process.argv.includes('--dev') || Boolean(process.env.CODEFLY_DEV_SERVER);
  if (isDev) {
    const devServer = process.env.CODEFLY_DEV_SERVER || 'http://localhost:5173';
    win.loadURL(devServer);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('codefly:request', async (_event, payload) => {
  const { url, method = 'GET', headers = {}, body = null } = payload || {};

  if (!isAllowed(url)) {
    return {
      ok: false,
      status: 0,
      bodyText: JSON.stringify({
        error: { message: 'Blocked by the CodeFly network allowlist: ' + String(url) },
      }),
    };
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : body,
    });
    const bodyText = await response.text();
    return { ok: response.ok, status: response.status, bodyText };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      bodyText: JSON.stringify({ error: { message: String((error && error.message) || error) } }),
    };
  }
});
