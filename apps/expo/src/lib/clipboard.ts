/**
 * Clipboard wrapper (Story 17.9)
 *
 * Thin typed surface over expo-clipboard. Universal (iOS / Android / Web).
 * Present in the baseline but not yet UI-wired — a future copy/paste feature
 * imports from here (see `lib/nativeBaseline.ts`).
 */
import * as Clipboard from 'expo-clipboard';

/** Returns the current clipboard text (empty string if none). */
export async function getString(): Promise<string> {
  return Clipboard.getStringAsync();
}

/** Copies text to the clipboard. Resolves `true` on success. */
export async function setString(text: string): Promise<boolean> {
  return Clipboard.setStringAsync(text);
}
