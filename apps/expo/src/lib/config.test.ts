import { config, validateConfig } from './config';

describe('config', () => {
  describe('config object', () => {
    it('should have sentry configuration', () => {
      expect(config.sentry).toHaveProperty('dsn');
    });

    it('should have api configuration', () => {
      expect(config.api).toHaveProperty('baseUrl');
    });

    it('should have content configuration', () => {
      expect(config.content).toHaveProperty('baseUrl');
    });

    it('should use default api baseUrl when env var is not set', () => {
      // Default value when EXPO_PUBLIC_API_URL is not set
      expect(config.api.baseUrl).toBeDefined();
    });

    // story 5-2: the vendor keys are gone from the config object, and this asserts it stays that
    // way. Cloud Quran ships zero third-party analytics or tracking SDKs (PRD NFR8) and has no
    // monetization surface, so a re-added `posthog`/`revenuecat`/`instantdb` block is a defect,
    // not a feature — and a deleted key that quietly comes back through a merge is exactly the
    // kind of thing nothing else in the suite would notice.
    it('names no retired vendor', () => {
      // ⚠️ AN EXACT LIST, ON PURPOSE — every addition has to be argued for here rather than
      // slipping in. `google` joined it in story 5-5's amendment and is NOT a vendor block in the
      // prohibited sense: it holds the OAuth client ids, which are public audiences the app ships
      // in its binary and the worker verifies id tokens against. No SDK, no key, nothing sent.
      // It lives in config because `babel-preset-expo` inlines `EXPO_PUBLIC_*` at transform time,
      // so a read at any other call site is frozen at build and unobservable to a test.
      expect(Object.keys(config).sort()).toEqual(['api', 'content', 'google', 'sentry']);
      // The teeth, restated so they survive a future edit to the list above.
      for (const vendor of ['posthog', 'revenuecat', 'instantdb', 'paddle']) {
        expect(Object.keys(config)).not.toContain(vendor);
      }
    });
  });

  describe('validateConfig', () => {
    it('should return array of missing environment variables', () => {
      const missing = validateConfig();
      expect(Array.isArray(missing)).toBe(true);
    });

    it('does NOT demand the Sentry DSN — crash reporting is opt-in and absent by default', () => {
      // story 5-2 review: this used to assert the opposite. Sentry is the single sanctioned
      // telemetry exception and is opt-IN (lib/privacyPrefs.ts, default OFF), so a machine with
      // no DSN is in the CORRECT state — warning about it trains the reader to ignore this
      // warning, which is how a genuinely missing variable gets scrolled past.
      expect(validateConfig()).not.toContain('EXPO_PUBLIC_SENTRY_DSN');
    });

    it('demands nothing at all today, and that is deliberate', () => {
      // EXPO_PUBLIC_API_URL has a working localhost default; EXPO_PUBLIC_CONTENT_URL has no
      // consumer until story 5-4 fills the content seam and should get its check there, next to
      // the code that first needs it. If this starts failing, something added a requirement —
      // make sure it is a real one.
      expect(validateConfig()).toEqual([]);
    });

    it('never demands a retired vendor key', () => {
      expect(validateConfig()).not.toContain('EXPO_PUBLIC_POSTHOG_KEY');
      expect(validateConfig()).not.toContain('EXPO_PUBLIC_INSTANT_APP_ID');
    });
  });
});
