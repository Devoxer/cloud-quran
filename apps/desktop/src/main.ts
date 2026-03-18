import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';
import { checkForUpdates } from './updater';
import { loadWindowState, saveWindowState } from './window-state';

let mainWindow: BrowserWindow | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

const isDev = process.env.NODE_ENV !== 'production';
const DEV_PORT = process.env.EXPO_DEV_PORT || '8081';

function createWindow(): void {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    title: 'Cloud Quran',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Inject COEP/COOP headers required for SharedArrayBuffer (expo-sqlite) and CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:* https:; media-src 'self' https:; img-src 'self' data: https:; font-src 'self' data:;"
      : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; media-src 'self' https:; img-src 'self' data: https:; font-src 'self' data:;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Embedder-Policy': ['credentialless'],
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Content-Security-Policy': [csp],
      },
    });
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${DEV_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, expo dist is in extraResources/expo-dist
    const expoDistPath = path.join(process.resourcesPath, 'expo-dist', 'index.html');
    mainWindow.loadFile(expoDistPath);
  }

  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (mainWindow) {
        saveWindowState(mainWindow.getBounds());
      }
    }, 500);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);

  mainWindow.on('close', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    if (mainWindow) {
      saveWindowState(mainWindow.getBounds());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates 5 seconds after launch
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
