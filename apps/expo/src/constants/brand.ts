/**
 * Third-party brand colours — fixed by their owners, NOT theme tokens.
 *
 * ⚠️ THESE MUST NOT FOLLOW THE THEME, and that is the whole reason they live here rather than in
 * `lib/theme.ts`. Google's Sign in with Google guidelines are explicit: "Use the Google brand
 * color for Google icon for dark, light, and neutral modes", and under the incorrect examples,
 * "Don't: Use monochrome versions of the Google 'G' for the button". The button's background and
 * label change with the theme; the mark never does.
 *
 * `lint:style` forbids hex literals outside `src/constants/` and `lib/theme.ts`, which is exactly
 * the right shape for this: a palette that is not ours to recolour belongs in constants.
 *
 * Story 5-5 shipped `globe-outline` here first, then a monochrome Ionicons "G". Both were
 * non-compliant; the second only looked less obviously so.
 */

/** The four-colour Google "G". Values from Google's own downloadable button asset. */
export const GOOGLE_G = {
  blue: '#4285F4',
  green: '#34A853',
  yellow: '#FBBC05',
  red: '#EA4335',
} as const;
