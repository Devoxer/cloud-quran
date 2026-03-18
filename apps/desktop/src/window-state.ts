import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface WindowState {
  width: number;
  height: number;
  x: number | undefined;
  y: number | undefined;
}

const DEFAULT_STATE: WindowState = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined,
};

function getStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export function loadWindowState(): WindowState {
  try {
    const statePath = getStatePath();
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<WindowState>;
      return {
        width: parsed.width ?? DEFAULT_STATE.width,
        height: parsed.height ?? DEFAULT_STATE.height,
        x: parsed.x,
        y: parsed.y,
      };
    }
  } catch {
    // Fall through to default
  }
  return { ...DEFAULT_STATE };
}

export function saveWindowState(bounds: Electron.Rectangle): void {
  try {
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    };
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
  } catch {
    // Silently ignore write failures
  }
}
