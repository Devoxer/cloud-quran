/**
 * Environment configuration with type safety and validation
 * All environment variables are accessed through this module
 *
 * story 5-2 removed three blocks and their `validateConfig` checks: `posthog` (zero third-party
 * analytics — PRD NFR8), `revenuecat` (no monetization surface) and `instantdb` (the vendor is
 * being retired; stories 5-4/5-5 replace it with the worker). Do not re-add a key here because a
 * dependency asked for it — the dependency is the bug.
 */

export const config = {
  sentry: {
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  },
  api: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  },
  /**
   * Google Sign-In client ids. NOT secrets — they ship in the binary and are the AUDIENCE the
   * worker verifies a native id token against, so the same list is `GOOGLE_CLIENT_IDS` there.
   *
   * ⚠️ THEY LIVE HERE RATHER THAN AT THE CALL SITE BECAUSE `process.env.EXPO_PUBLIC_*` IS INLINED
   * AT BUILD TIME. `babel-preset-expo` replaces each reference with a literal during transform, so
   * a module-scope read is frozen at whatever the environment held when the file was compiled —
   * which is fine in an app and untestable in a suite. One module reads them; everything else
   * reads this object, which a test can substitute.
   */
  google: {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  },
  content: {
    // Public base for the content bucket (born-correct random-keyed objects). The client reads a
    // row's opaque `r2Key` and fetches `${baseUrl}/${r2Key}` DIRECT from the public edge — zero
    // worker hop (lib/contentUrl.ts + lib/contentRead.ts). This host is a CAPABILITY-URL surface —
    // the telemetry scrub (lib/telemetryScrub.ts, applied in lib/errors.ts) redacts it from every
    // Sentry payload (arch §5.2).
    baseUrl: process.env.EXPO_PUBLIC_CONTENT_URL ?? '',
  },
} as const;

/**
 * Validates that REQUIRED environment variables are set. Only warns in development; never blocks
 * launch. An optional variable does not belong here — a warning nobody can action is noise, and
 * noise is how a real missing variable gets scrolled past.
 */
export function validateConfig(): string[] {
  const missing: string[] = [];

  // ⚠️ story 5-2 review: this briefly checked ONLY `EXPO_PUBLIC_SENTRY_DSN`, which inverted the
  // whole point. Sentry is opt-IN and deliberately absent by default (lib/privacyPrefs.ts), so a
  // clean machine warned about the one variable it is CORRECT not to have — training the reader
  // to ignore this warning — while nothing checked the variable the app genuinely cannot work
  // without. Only warn about what is actually required.
  //
  // Nothing is required yet: `EXPO_PUBLIC_API_URL` has a working localhost default, and
  // `EXPO_PUBLIC_CONTENT_URL` has no consumer until the content seam is filled in story 5-4.
  // Add its check THERE, alongside the code that first depends on it — not speculatively here.

  // Only warn in development, don't block app launch
  if (missing.length > 0 && __DEV__) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
  }

  return missing;
}

export type Config = typeof config;
