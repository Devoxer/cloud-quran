import * as Sentry from '@sentry/react-native';
import { getDeviceContext } from './deviceContext';
import {
  AppError,
  addBreadcrumb,
  captureException,
  clearSentryUser,
  initErrorTracking,
  isDeviceOfflineError,
  setSentryDeviceContext,
  setSentryUser,
} from './errors';

// Mock @sentry/react-native
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: jest.fn((component) => component),
}));

// Mock config module
jest.mock('./config', () => ({
  config: {
    sentry: {
      dsn: '', // Default to empty for most tests
    },
    // Story 32.5: initErrorTracking wires the content-URL scrubber, which reads these.
    content: { baseUrl: 'https://content.wisdomfruits.test' },
    api: { baseUrl: 'https://api.wisdomfruits.test' },
  },
}));

// Mock deviceContext (Story 17.9) — exercised by setSentryDeviceContext below
jest.mock('./deviceContext', () => ({
  getDeviceContext: jest.fn(() =>
    Promise.resolve({
      is_physical_device: false,
      device_type: 'phone',
      total_memory_bytes: 1024,
      install_time: '2026-01-01T00:00:00.000Z',
    })
  ),
}));

describe('errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initErrorTracking', () => {
    it('should not throw when called', () => {
      expect(() => initErrorTracking()).not.toThrow();
    });

    it('should warn when Sentry DSN is not configured', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      initErrorTracking();
      expect(consoleSpy).toHaveBeenCalledWith('Sentry DSN not configured');
      consoleSpy.mockRestore();
    });

    it('should call Sentry.init when DSN is configured', () => {
      // Override config mock for this test
      const configModule = jest.requireMock('./config') as { config: { sentry: { dsn: string } } };
      const originalDsn = configModule.config.sentry.dsn;
      configModule.config.sentry.dsn = 'https://test@sentry.io/123';

      initErrorTracking();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          enabled: false, // __DEV__ is true in tests
          tracesSampleRate: 0.2,
          profilesSampleRate: 0.2,
        })
      );

      // Restore original config
      configModule.config.sentry.dsn = originalDsn;
    });

    it('sets sendDefaultPii: false explicitly, and wires every scrub hook', () => {
      // ⚠️ ALL FOUR, UNCONDITIONALLY. Three of them used to be spread behind a
      // `scrubber.x ? … : {}` ternary over a scrubber that genuinely returned `{}` whenever no
      // content host was configured — so a build with no `EXPO_PUBLIC_CONTENT_URL` (dev, test,
      // and any deployment that had not set it) sent transactions and breadcrumbs unscrubbed.
      // This mock's config has a content host, so a re-introduced ternary would still pass here;
      // what pins the unconditional half is `telemetryScrub.test.ts`, which drives the scrubber
      // directly. This case pins the OPTIONS.
      const configModule = jest.requireMock('./config') as { config: { sentry: { dsn: string } } };
      const originalDsn = configModule.config.sentry.dsn;
      configModule.config.sentry.dsn = 'https://test@sentry.io/123';

      initErrorTracking();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          sendDefaultPii: false,
          beforeSend: expect.any(Function),
          beforeSendTransaction: expect.any(Function),
          beforeBreadcrumb: expect.any(Function),
          tracePropagationTargets: expect.any(Array),
        })
      );

      configModule.config.sentry.dsn = originalDsn;
    });

    it('should include a beforeSend filter when DSN is configured', () => {
      const configModule = jest.requireMock('./config') as { config: { sentry: { dsn: string } } };
      const originalDsn = configModule.config.sentry.dsn;
      configModule.config.sentry.dsn = 'https://test@sentry.io/123';

      initErrorTracking();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          beforeSend: expect.any(Function),
        })
      );

      configModule.config.sentry.dsn = originalDsn;
    });

    describe('beforeSend filter', () => {
      let beforeSend: (event: Sentry.Event) => Sentry.Event | null;
      let configModule: { config: { sentry: { dsn: string } } };
      let originalDsn: string;

      beforeEach(() => {
        configModule = jest.requireMock('./config') as { config: { sentry: { dsn: string } } };
        originalDsn = configModule.config.sentry.dsn;
        configModule.config.sentry.dsn = 'https://test@sentry.io/123';
        initErrorTracking();
        const initCall = (Sentry.init as jest.Mock).mock.calls[0][0];
        beforeSend = initCall.beforeSend;
      });

      afterEach(() => {
        configModule.config.sentry.dsn = originalDsn;
      });

      // ⚠️ story 5-7 DELETED THREE CASES HERE, and they were green for the wrong reason. They
      // asserted that `beforeSend` DROPPED two literal InstantDB SDK messages ("Error performing
      // request…") — a filter kept alive across story 5-2, which removed that SDK. Nothing in the
      // tree could produce either string, so what the cases actually pinned was a comparison
      // against phrases that no longer exist. The filter is gone; `beforeSend` is the scrub.

      it('scrubs an Authorization header out of the event it forwards', () => {
        // The reason `beforeSend` exists at all now. `sendDefaultPii: false` does not do this —
        // see the note on that option in errors.ts and the envelope case in telemetryScrub.test.
        const event: Sentry.Event = {
          exception: {
            values: [{ type: 'Error', value: 'PUT failed (authorization: Bearer sEcReT-9f2a4c)' }],
          },
        };
        const forwarded = beforeSend(event);
        expect(JSON.stringify(forwarded)).not.toContain('sEcReT-9f2a4c');
      });

      it('should pass through permission denied errors', () => {
        const event: Sentry.Event = {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Permission denied: you do not have access to this resource',
              },
            ],
          },
        };
        expect(beforeSend(event)).toStrictEqual(event);
      });

      it('should pass through query timeout errors', () => {
        const event: Sentry.Event = {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Query timed out after 30000ms',
              },
            ],
          },
        };
        expect(beforeSend(event)).toStrictEqual(event);
      });

      it('should pass through app-level errors', () => {
        const event: Sentry.Event = {
          exception: {
            values: [
              {
                type: 'AppError',
                value: 'Unable to sign in. Please try again.',
              },
            ],
          },
        };
        expect(beforeSend(event)).toStrictEqual(event);
      });

      it('should pass through events without exception values', () => {
        const event: Sentry.Event = { message: 'Some message' };
        expect(beforeSend(event)).toStrictEqual(event);
      });

      it('should pass through events with empty exception values', () => {
        const event: Sentry.Event = { exception: { values: [] } };
        expect(beforeSend(event)).toStrictEqual(event);
      });

      it('should pass through events with undefined exception value', () => {
        const event: Sentry.Event = {
          exception: {
            values: [{ type: 'Error', value: undefined }],
          },
        };
        expect(beforeSend(event)).toStrictEqual(event);
      });

      it('never drops an event — every error reaches Sentry, scrubbed', () => {
        // Anti-vacuity for the pass-through cases above: with the transient filter deleted there
        // is no `return null` path left in `beforeSend`, and this is what would redden if one
        // were reintroduced without a case of its own.
        const event: Sentry.Event = {
          exception: {
            values: [
              { type: 'Error', value: 'Something went wrong' },
              { type: 'Error', value: 'Error performing request.' },
            ],
          },
        };
        expect(beforeSend(event)).not.toBeNull();
      });
    });
  });

  describe('AppError', () => {
    it('should create an error with code and userMessage', () => {
      const error = new AppError('TEST_ERROR', 'Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.userMessage).toBe('Test error message');
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('AppError');
    });

    it('should store original error if provided', () => {
      const originalError = new Error('Original error');
      const error = new AppError('TEST_ERROR', 'Test error message', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should extend Error class', () => {
      const error = new AppError('TEST_ERROR', 'Test error message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('captureException', () => {
    it('should accept an Error object', () => {
      const error = new Error('Test error');
      captureException(error);
      expect(typeof captureException).toBe('function');
    });

    it('should accept error with context object', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test_action' };
      captureException(error, context);
      expect(typeof captureException).toBe('function');
    });

    it('should log error and context to console in development', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      const context = { context: 'test' };
      captureException(error, context);
      expect(consoleSpy).toHaveBeenCalledWith('Error:', error, context);
      consoleSpy.mockRestore();
    });

    it('should handle non-Error objects', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      captureException('string error');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setSentryUser', () => {
    it('should set user context with ID only (no email for privacy)', () => {
      setSentryUser('user-123', false);

      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-123' });
    });

    it('should set account_type tag to authenticated for non-guest users', () => {
      setSentryUser('user-123', false);

      expect(Sentry.setTag).toHaveBeenCalledWith('account_type', 'authenticated');
    });

    it('should set account_type tag to guest for guest users', () => {
      setSentryUser('guest-456', true);

      expect(Sentry.setTag).toHaveBeenCalledWith('account_type', 'guest');
    });
  });

  describe('clearSentryUser', () => {
    it('should clear user context by setting to null', () => {
      clearSentryUser();

      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('should clear account_type tag by setting to undefined', () => {
      clearSentryUser();

      expect(Sentry.setTag).toHaveBeenCalledWith('account_type', undefined);
    });
  });

  describe('setSentryDeviceContext (Story 17.9)', () => {
    it('sets is_physical_device + device_type tags and a device_extra context', async () => {
      await setSentryDeviceContext();

      expect(Sentry.setTag).toHaveBeenCalledWith('is_physical_device', 'false');
      expect(Sentry.setTag).toHaveBeenCalledWith('device_type', 'phone');
      expect(Sentry.setContext).toHaveBeenCalledWith('device_extra', {
        is_physical_device: false,
        device_type: 'phone',
        total_memory_bytes: 1024,
        install_time: '2026-01-01T00:00:00.000Z',
      });
    });

    it('never throws when gathering device context fails', async () => {
      (getDeviceContext as jest.Mock).mockRejectedValueOnce(new Error('native read failed'));
      await expect(setSentryDeviceContext()).resolves.toBeUndefined();
    });
  });

  describe('isDeviceOfflineError', () => {
    it('matches the device-offline phrase, not a bare "offline"', () => {
      expect(isDeviceOfflineError(new Error('the device is offline'))).toBe(true);
      expect(isDeviceOfflineError('storage node offline')).toBe(false);
    });
  });

  describe('addBreadcrumb', () => {
    it('should add navigation breadcrumb with message', () => {
      addBreadcrumb('navigation', 'Navigated to Discover');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        message: 'Navigated to Discover',
        data: undefined,
        level: 'info',
      });
    });

    it('should add http breadcrumb with data', () => {
      addBreadcrumb('http', 'GET /api/books', { status_code: 200 });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'http',
        message: 'GET /api/books',
        data: { status_code: 200 },
        level: 'info',
      });
    });

    it('should add user action breadcrumb with custom level', () => {
      addBreadcrumb('user', 'Started playback', { book_id: 'book-123' }, 'info');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'user',
        message: 'Started playback',
        data: { book_id: 'book-123' },
        level: 'info',
      });
    });

    it('should add breadcrumb with warning level', () => {
      addBreadcrumb('http', 'API request failed', { status_code: 500 }, 'warning');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'http',
        message: 'API request failed',
        data: { status_code: 500 },
        level: 'warning',
      });
    });
  });
});
