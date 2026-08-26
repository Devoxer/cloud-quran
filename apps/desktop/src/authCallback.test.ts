/**
 * The desktop OAuth return path — the three delivery shapes and the one that is an attack surface.
 *
 * Run with `node --test` (see package.json). No Electron: `installAuthCallbackHandler` takes its
 * host as an interface precisely so this can run with no shell and no dependency.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTH_CALLBACK_HOST,
  type DesktopHost,
  findCallbackUrl,
  installAuthCallbackHandler,
  isAuthCallback,
} from './authCallback.ts';

const SCHEME = 'cloud-quran';
const CALLBACK = `${SCHEME}://${AUTH_CALLBACK_HOST}?code=abc`;

function fakeHost(overrides: Partial<DesktopHost> = {}) {
  const delivered: string[] = [];
  let openUrl: (url: string) => void = () => {};
  let secondInstance: (argv: string[]) => void = () => {};
  const calls: string[] = [];
  const host: DesktopHost = {
    scheme: SCHEME,
    registerProtocol: () => calls.push('registerProtocol'),
    requestSingleInstanceLock: () => true,
    quit: () => calls.push('quit'),
    onOpenUrl: (fn) => {
      openUrl = fn;
    },
    onSecondInstance: (fn) => {
      secondInstance = fn;
    },
    deliver: (url) => delivered.push(url),
    ...overrides,
  };
  return {
    host,
    delivered,
    calls,
    fireOpenUrl: (url: string) => openUrl(url),
    fireSecondInstance: (argv: string[]) => secondInstance(argv),
  };
}

describe('findCallbackUrl', () => {
  it('scans argv rather than trusting a position', () => {
    // ⚠️ On Windows the OS builds the command line, so the URL sits after the executable path and
    // after any Chromium switch. `argv[1]` is right in development and wrong from an installer.
    assert.equal(
      findCallbackUrl(['C:\\app\\CloudQuran.exe', '--no-sandbox', CALLBACK], SCHEME),
      CALLBACK
    );
  });

  it('answers null when the launch carried no URL of ours', () => {
    assert.equal(findCallbackUrl(['/Applications/CloudQuran.app', '--inspect'], SCHEME), null);
    assert.equal(findCallbackUrl(['app', 'other-scheme://auth-callback'], SCHEME), null);
  });
});

describe('isAuthCallback', () => {
  it('accepts our callback, with or without a query', () => {
    assert.equal(isAuthCallback(CALLBACK, SCHEME), true);
    assert.equal(isAuthCallback(`${SCHEME}://${AUTH_CALLBACK_HOST}`, SCHEME), true);
  });

  it('refuses another host under OUR scheme', () => {
    // ⚠️ THE REASON THIS FUNCTION EXISTS. Registering a protocol makes the app addressable by
    // every other process on the machine and by any web page the user clicks. Forwarding anything
    // that merely starts with `cloud-quran://` would hand the renderer arbitrary attacker input.
    assert.equal(isAuthCallback(`${SCHEME}://evil`, SCHEME), false);
    assert.equal(isAuthCallback(`${SCHEME}://auth-callback.evil.com`, SCHEME), false);
  });

  it('refuses another scheme, and refuses garbage without throwing', () => {
    assert.equal(isAuthCallback(`https://${AUTH_CALLBACK_HOST}`, SCHEME), false);
    assert.equal(isAuthCallback('not a url', SCHEME), false);
    assert.equal(isAuthCallback('', SCHEME), false);
  });
});

describe('installAuthCallbackHandler', () => {
  it('registers the protocol and keeps running when it owns the lock', () => {
    const { host, calls } = fakeHost();
    assert.equal(installAuthCallbackHandler(host), true);
    assert.deepEqual(calls, ['registerProtocol']);
  });

  it('QUITS a second process rather than opening a second window', () => {
    // Without this the OS's URL launch produces a duplicate app, and the user finishes signing in
    // inside a window that is not the one they left — the first still sitting there, signed out.
    const { host, calls } = fakeHost({ requestSingleInstanceLock: () => false });
    assert.equal(installAuthCallbackHandler(host, [CALLBACK]), false);
    assert.ok(calls.includes('quit'));
  });

  it('delivers a macOS open-url callback', () => {
    const { host, delivered, fireOpenUrl } = fakeHost();
    installAuthCallbackHandler(host);
    fireOpenUrl(CALLBACK);
    assert.deepEqual(delivered, [CALLBACK]);
  });

  it('delivers a Windows/Linux second-instance callback out of its argv', () => {
    const { host, delivered, fireSecondInstance } = fakeHost();
    installAuthCallbackHandler(host);
    fireSecondInstance(['C:\\app\\CloudQuran.exe', CALLBACK]);
    assert.deepEqual(delivered, [CALLBACK]);
  });

  it('delivers a COLD start, where no event is coming at all', () => {
    // The OS launched us with the URL on our own command line. Nothing else would ever see it.
    const { host, delivered } = fakeHost();
    installAuthCallbackHandler(host, ['/Applications/CloudQuran.app', CALLBACK]);
    assert.deepEqual(delivered, [CALLBACK]);
  });

  it('delivers NOTHING for a hostile URL on any of the three paths', () => {
    const hostile = `${SCHEME}://evil?code=abc`;
    const { host, delivered, fireOpenUrl, fireSecondInstance } = fakeHost();
    installAuthCallbackHandler(host, ['app', hostile]);
    fireOpenUrl(hostile);
    fireSecondInstance(['app', hostile]);
    assert.deepEqual(delivered, []);
  });
});
