/**
 * backupExclusion — keep re-downloadable audio out of iCloud/iTunes backup (iOS only).
 *
 * The one door onto the `BackupExclusion` local module in `modules/backup-exclusion/`. It lives in
 * `lib/` because that is the infrastructure tier features are allowed to import; nothing outside
 * this file may reach the native module.
 *
 * ⚠️ IT IS `requireOptionalNativeModule`, AND THAT IS THE WHOLE ANDROID/WEB STORY. The module
 * declares `"platforms": ["apple"]`, so on Android, on web and under Jest it simply is not there —
 * and this returns `false` rather than throwing. Android needs nothing (see the Swift docblock:
 * `expo-secure-store`'s plugin already makes `files/` unbacked-up by construction), and web has no
 * filesystem to speak of.
 *
 * ⚠️ A FAILURE HERE MUST NEVER STOP A DOWNLOAD. Every path answers a boolean; none throws. The
 * worst case is that a gigabyte of recitation ends up in a backup — a storage-guidelines problem,
 * not a broken feature — so it is breadcrumbed and dropped, never surfaced to the reader.
 */

import { requireOptionalNativeModule } from 'expo';

interface BackupExclusionNativeModule {
  excludeFromBackup(uri: string): boolean;
  isExcludedFromBackup(uri: string): boolean | null;
}

const native = requireOptionalNativeModule<BackupExclusionNativeModule>('BackupExclusion');

/**
 * Mark a file or directory as excluded from backup.
 *
 * Setting it on a DIRECTORY covers everything beneath it, which is how the caller gets away with
 * one call for the whole audio tree instead of one per surah.
 *
 * @returns `true` only when the flag was actually written — `false` on every other platform, and
 *   on any failure.
 */
export function excludeFromBackup(uri: string): boolean {
  try {
    return native?.excludeFromBackup(uri) ?? false;
  } catch {
    return false;
  }
}

/**
 * Read the flag back.
 *
 * ⚠️ THIS EXISTS TO MAKE THE EFFECT CHECKABLE ON A DEVICE. `excludeFromBackup` has no user-visible
 * symptom when it silently fails, so without a reader there would be nothing between "excluded"
 * and "we called something once".
 *
 * @returns `true`/`false` when the system answered, `null` when it could not be asked — including
 *   every non-Apple platform, where the question is meaningless rather than falsely negative.
 */
export function isExcludedFromBackup(uri: string): boolean | null {
  try {
    return native?.isExcludedFromBackup(uri) ?? null;
  } catch {
    return null;
  }
}
