import { app, dialog, shell } from 'electron';

interface VersionManifest {
  version: string;
  urls: {
    mac: string;
    win: string;
    linux: string;
  };
}

const VERSION_URL = 'https://cloud-quran-desktop.r2.dev/desktop/latest/version.json';
const ALLOWED_DOWNLOAD_ORIGIN = 'https://cloud-quran-desktop.r2.dev';

function getPlatformKey(): 'mac' | 'win' | 'linux' {
  switch (process.platform) {
    case 'darwin':
      return 'mac';
    case 'win32':
      return 'win';
    default:
      return 'linux';
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.origin === ALLOWED_DOWNLOAD_ORIGIN;
  } catch {
    return false;
  }
}

export async function checkForUpdates(): Promise<void> {
  try {
    const response = await fetch(VERSION_URL);
    if (!response.ok) {
      return;
    }

    const manifest = (await response.json()) as VersionManifest;
    const currentVersion = app.getVersion();

    if (compareVersions(manifest.version, currentVersion) > 0) {
      const platformKey = getPlatformKey();
      const downloadUrl = manifest.urls[platformKey];

      const result = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `A new version of Cloud Quran is available (v${manifest.version}).`,
        detail: `You are currently running v${currentVersion}. Would you like to download the update?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 0 && downloadUrl && isAllowedUrl(downloadUrl)) {
        await shell.openExternal(downloadUrl);
      }
    }
  } catch {
    // Silently fail — updater should never crash the app
  }
}
