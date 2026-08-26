/**
 * THE DESKTOP OAUTH RETURN PATH (story 5-5 amendment).
 *
 * Web and Desktop sign in with Apple and Google through the standard OAuth redirect, because
 * neither has a native sheet. On the web that round trip ends at an http origin the browser owns.
 * On the desktop it cannot: the app is the Expo web export inside an Electron renderer, served
 * from `file://` or a custom scheme, and no provider will redirect to either. So the worker sends
 * the browser back to `cloud-quran://auth-callback`, the OS hands that URL to this app, and this
 * module turns it into something the renderer can act on.
 *
 * ⚠️ THERE IS NO ELECTRON IMPORT IN THIS FILE, AND THAT IS DELIBERATE — NOT A STUB. `apps/desktop`
 * is still a placeholder (a package.json and a README; Epic 6 builds the shell) and adding
 * `electron` is an ask-first dependency this story does not have. Every Electron API this needs
 * is therefore taken as a narrow injected interface, which means:
 *   • it compiles and is unit-tested TODAY, with no dependency and no shell;
 *   • the logic that is easy to get wrong — single-instance handoff, which platform delivers the
 *     URL through which event, and never trusting the URL's contents — lives here rather than
 *     being written from scratch inside a `main.ts` that does not exist yet;
 *   • wiring it up later is the ~10 lines in the example below.
 *
 * ```ts
 * // apps/desktop/src/main.ts, when the shell exists:
 * import { app, BrowserWindow } from 'electron';
 * import { installAuthCallbackHandler } from './authCallback';
 *
 * const window = new BrowserWindow({ ... });
 * installAuthCallbackHandler({
 *   scheme: 'cloud-quran',
 *   registerProtocol: (s) => app.setAsDefaultProtocolClient(s),
 *   requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
 *   quit: () => app.quit(),
 *   onOpenUrl: (fn) => app.on('open-url', (event, url) => { event.preventDefault(); fn(url); }),
 *   onSecondInstance: (fn) => app.on('second-instance', (_e, argv) => fn(argv)),
 *   deliver: (url) => {
 *     if (window.isMinimized()) window.restore();
 *     window.focus();
 *     window.webContents.send('cloud-quran:auth-callback', url);
 *   },
 * });
 * ```
 */

/** The Electron surface this needs, as the narrowest interface that does the job. */
export interface DesktopHost {
  /** The app's custom scheme, without `://`. Must match `apps/expo/app.json`'s `scheme`. */
  scheme: string;
  /** `app.setAsDefaultProtocolClient` — tells the OS this app owns `scheme://` URLs. */
  registerProtocol: (scheme: string) => void;
  /**
   * `app.requestSingleInstanceLock`. `false` means another copy is already running and THIS
   * process exists only because the OS launched it to deliver a URL.
   */
  requestSingleInstanceLock: () => boolean;
  quit: () => void;
  /** macOS delivers the callback as an `open-url` event on the running instance. */
  onOpenUrl: (handler: (url: string) => void) => void;
  /**
   * Windows and Linux deliver it as a NEW PROCESS whose argv carries the URL; the running
   * instance hears about it through `second-instance`.
   */
  onSecondInstance: (handler: (argv: string[]) => void) => void;
  /** Focus the window and hand the URL to the renderer. */
  deliver: (url: string) => void;
}

/**
 * Pull our callback URL out of a process argv.
 *
 * ⚠️ SCAN, DON'T INDEX. On Windows the URL is appended to the command line the OS built, which
 * already carries the executable path and can carry Chromium switches — `argv[1]` is a guess that
 * happens to be right in development and wrong from an installer.
 */
export function findCallbackUrl(argv: readonly string[], scheme: string): string | null {
  const prefix = `${scheme}://`;
  return argv.find((arg) => arg.startsWith(prefix)) ?? null;
}

/**
 * Is this URL one we should hand to the renderer?
 *
 * ⚠️ A REGISTERED PROTOCOL IS AN INPUT ANY PROCESS ON THE MACHINE CAN WRITE TO. Once
 * `cloud-quran://` is ours, ANY app — or a web page the user clicks — can launch us with an
 * arbitrary URL under it. So the host is checked against an allowlist here rather than the URL
 * being forwarded on the strength of its scheme alone. Nothing in it is trusted as a credential
 * either: the session is a cookie the worker set, and this URL is only the signal to look again.
 */
export function isAuthCallback(url: string, scheme: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== `${scheme}:`) return false;
  // `cloud-quran://auth-callback` parses with the first segment as the HOST, not the pathname.
  const target = parsed.hostname || parsed.pathname.replace(/^\/+/, '');
  return target === AUTH_CALLBACK_HOST;
}

/** The one path the worker redirects to. Mirrors `redirectCallbackURL()` in the app. */
export const AUTH_CALLBACK_HOST = 'auth-callback';

/**
 * Wire the protocol handler up.
 *
 * Returns `false` when this process should exit immediately — another instance owns the window,
 * and the OS started this one only to carry a URL, which `second-instance` has already delivered.
 */
export function installAuthCallbackHandler(
  host: DesktopHost,
  argv: readonly string[] = []
): boolean {
  host.registerProtocol(host.scheme);

  if (!host.requestSingleInstanceLock()) {
    // ⚠️ QUIT, DO NOT OPEN A WINDOW. Without this the OS's URL launch produces a SECOND copy of
    // the app, and the user finishes signing in inside a window that is not the one they left —
    // with the first still sitting there, signed out.
    host.quit();
    return false;
  }

  host.onOpenUrl((url) => {
    if (isAuthCallback(url, host.scheme)) host.deliver(url);
  });

  host.onSecondInstance((incoming) => {
    const url = findCallbackUrl(incoming, host.scheme);
    if (url && isAuthCallback(url, host.scheme)) host.deliver(url);
  });

  // A COLD start: the OS launched us with the URL already on our own command line, so there is no
  // event coming and nothing else would ever notice it.
  const cold = findCallbackUrl(argv, host.scheme);
  if (cold && isAuthCallback(cold, host.scheme)) host.deliver(cold);

  return true;
}
