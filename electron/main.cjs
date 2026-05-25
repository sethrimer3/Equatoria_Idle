const { app, BrowserWindow, protocol, session, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const appRoot = app.getAppPath();
const logPath = path.join(appRoot, 'electron-runtime.log');
const windowIconPath = path.resolve(appRoot, 'ASSETS', 'icon', 'EquatoriaIdle_Icon.ico');
const cspHeaderName = 'Content-Security-Policy';
const electronScheme = 'equatoria';
const electronHost = 'app';
const devServerUrl = process.env.EQUATORIA_ELECTRON_DEV_SERVER;

protocol.registerSchemesAsPrivileged([
  {
    scheme: electronScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: file:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' data: blob: file:",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const developmentCsp = [
  "default-src 'self' http://localhost:* http://127.0.0.1:*",
  "script-src 'self' 'unsafe-eval' http://localhost:* http://127.0.0.1:*",
  "style-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:* https://fonts.googleapis.com",
  "img-src 'self' data: blob: file: http://localhost:* http://127.0.0.1:*",
  "font-src 'self' data: http://localhost:* http://127.0.0.1:* https://fonts.gstatic.com",
  "media-src 'self' data: blob: file: http://localhost:* http://127.0.0.1:*",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self' blob: http://localhost:* http://127.0.0.1:*",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

function cspForCurrentMode() {
  return devServerUrl ? developmentCsp : productionCsp;
}

function installCspHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...details.responseHeaders,
      [cspHeaderName]: [cspForCurrentMode()],
    };

    callback({ responseHeaders });
  });
}

function resolveDistPath(requestUrl) {
  const distRoot = path.resolve(appRoot, 'dist');
  const parsedUrl = new URL(requestUrl);
  const decodedPath = decodeURIComponent(parsedUrl.pathname);
  const requestPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = path.resolve(distRoot, `.${requestPath}`);

  if (!filePath.startsWith(`${distRoot}${path.sep}`) && filePath !== distRoot) {
    throw new Error(`Blocked Electron protocol path outside dist: ${requestUrl}`);
  }

  return filePath;
}

function registerElectronProtocol() {
  protocol.handle(electronScheme, async (request) => {
    const filePath = resolveDistPath(request.url);

    if (!fs.existsSync(filePath)) {
      writeLog(`Electron protocol missing file: ${filePath}`);
      return new Response('Not found', {
        status: 404,
        headers: {
          [cspHeaderName]: productionCsp,
          'content-type': 'text/plain; charset=utf-8',
        },
      });
    }

    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set(cspHeaderName, productionCsp);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('password-store', 'basic');
app.commandLine.appendSwitch('enable-logging', 'file');
app.commandLine.appendSwitch('log-file', logPath);
app.setPath('userData', path.join(appRoot, '.electron-user-data'));

process.on('uncaughtException', (error) => {
  writeLog(`uncaughtException: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (reason) => {
  writeLog(`unhandledRejection: ${String(reason)}`);
});

function createWindow() {
  writeLog('Creating BrowserWindow.');

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    icon: windowIconPath,
    backgroundColor: '#0a0a12',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('Renderer finished loading.');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    writeLog(`Renderer failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(`Renderer console level=${level} ${sourceId}:${line} ${message}`);
  });

  mainWindow.on('closed', () => {
    writeLog('BrowserWindow closed.');
  });

  const indexPath = path.join(appRoot, 'dist', 'index.html');

  if (devServerUrl) {
    writeLog(`Loading Electron development server ${devServerUrl}.`);
    void mainWindow.loadURL(devServerUrl).catch((error) => {
      writeLog(`loadURL failed: ${error.stack || error.message}`);
    });
    return;
  }

  if (!fs.existsSync(indexPath)) {
    throw new Error('Missing dist/index.html. Run npm run build:desktop before launching Electron.');
  }

  const electronUrl = `${electronScheme}://${electronHost}/index.html`;
  writeLog(`Loading ${electronUrl} from ${indexPath}.`);
  void mainWindow.loadURL(electronUrl).catch((error) => {
    writeLog(`loadURL failed: ${error.stack || error.message}`);
  });
}

app.whenReady().then(() => {
  writeLog(`Electron ready. userData=${app.getPath('userData')}`);
  installCspHeaders();
  registerElectronProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('child-process-gone', (_event, details) => {
  writeLog(`Child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
});

app.on('window-all-closed', () => {
  writeLog('All windows closed.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  writeLog('Electron before-quit.');
});

app.on('will-quit', () => {
  writeLog('Electron will-quit.');
});
