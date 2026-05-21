const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const appRoot = app.getAppPath();
const logPath = path.join(appRoot, 'electron-runtime.log');

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
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
    backgroundColor: '#0a0a12',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
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

  if (!fs.existsSync(indexPath)) {
    throw new Error('Missing dist/index.html. Run npm run build:desktop before launching Electron.');
  }

  writeLog(`Loading ${indexPath}.`);
  void mainWindow.loadFile(indexPath).catch((error) => {
    writeLog(`loadFile failed: ${error.stack || error.message}`);
  });
}

app.whenReady().then(() => {
  writeLog(`Electron ready. userData=${app.getPath('userData')}`);
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
