import { contextBridge } from 'electron';

// Expose a minimal API to the renderer process
// Currently no APIs needed — the Expo web app runs entirely in the renderer
contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  isDesktop: true,
});
