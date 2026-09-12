/**
 * Language — the interface-language picker (story 8-1), and `setLanguage()`'s FIRST caller.
 *
 * ⚠️ THE MACHINERY UNDER THIS SCREEN IS OLDER THAN THE SCREEN. `lib/language.ts` shipped with the
 * 5-1 seed complete with a switch ticket, a rollback-on-reject path and a reload — and with zero
 * callers, because the app offered exactly one locale (PRD NFR29). Story 8-1 reverses that: `ar` is
 * a real second interface language, so the lever finally has a handle.
 *
 * ⚠️ A COMMITTED SWITCH RELOADS THE APP, AND THAT IS THE MECHANISM RATHER THAN A FLOURISH.
 * `setLanguage` persists to MMKV and then calls `reloadAppAsync()`; it deliberately does NOT switch
 * i18next live (reloading into the live-switch cascade was a measured `SIGBUS` — see its docblock).
 * For Arabic there is a second, harder reason: `I18nManager.forceRTL` writes a native preference
 * that is read when VIEWS ARE CREATED, so the direction cannot change under a mounted tree at all.
 * ⚠️ Which is why `choose` writes that preference for the NEW language BEFORE it calls
 * `setLanguage` — `react-native`'s `I18nManager` (and FlashList's RTL compensation with it) is
 * evaluated by the entry chain long before `app/_layout.tsx` runs, so a pref written on the far
 * side of the reload is invisible to the whole session. `lib/rtl.ts`'s header has the measurement.
 * The footnote says so to the reader, because a screen that appears to do nothing for a beat is a
 * screen you tap twice.
 *
 * ⚠️ THE ROW LABELS ARE ENDONYMS AND ARE NOT TRANSLATED — "العربية" is "العربية" in every UI
 * language. That is the whole point of a language picker: a reader who cannot read the current
 * interface must still be able to find their own language. `uiLanguageLabel` is the one source
 * (`constants/language.ts`, where the `lint-i18n-ok` carve-out for it lives).
 *
 * ⚠️ THE OPTION SET IS `EXPOSED_LANGUAGES`, NOT `AVAILABLE_UI_LANGUAGES`. `es`/`fr` bundles ship —
 * they keep the locale-parity gate measuring more than one target — and must never be OFFERED:
 * they are wisdom-fruits' book-app copy, not this app's. Order is `resources.ts`'s declaration
 * order, which that file documents as the picker's on-screen order.
 *
 * No native header slot and no `Stack.Screen` toolbar: the `(profile)` layout mounts `AppHeader` +
 * `AppTabBar` around this whole group, and the title comes from that layout's `TITLE_KEYS`.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Icon, InlineError, SettingsGroup, SettingsRow } from '@/components/ui';
import { uiLanguageLabel } from '@/constants/language';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { haptics } from '@/lib/haptics';
import { AVAILABLE_UI_LANGUAGES, isExposedLanguage, useLanguage } from '@/lib/language';
import { applyDirectionForLanguage, applyStoredDirection } from '@/lib/rtl';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** The checkmark beside the language in force — sized like every other trailing affordance. */
const CHECK_SIZE = 18;

export default function LanguageScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const { language, setLanguage } = useLanguage();
  /**
   * The row the reader just tapped. ONE-SHOT PER MOUNT: a committed switch is followed by a reload,
   * so the screen is on borrowed time from here — letting a second tap start a second switch is how
   * two overlapping calls end up racing each other's rollback (`setLanguage`'s ticket exists for
   * exactly that, and not making it necessary is cheaper than relying on it).
   */
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = AVAILABLE_UI_LANGUAGES.filter(isExposedLanguage);

  const choose = async (code: string) => {
    // Re-picking what is already rendering is a no-op, not a switch — and `setLanguage`'s
    // non-moving branch is the only one that can reject, so refusing here keeps the rejection
    // path reachable only from code nobody ships.
    if (pending !== null || code === language) return;
    setPending(code);
    setError(null);
    haptics.selection();
    try {
      // ⚠️ DIRECTION FIRST, THEN THE SWITCH — and the order is a measured fix, not tidiness.
      // `setLanguage` persists and then restarts the JS context, and the fresh context evaluates
      // `react-native`'s `I18nManager` (and FlashList's RTL compensation with it) long before
      // `app/_layout.tsx` can apply anything. Writing the native preference on the far side of
      // that reload left the mushaf laid out in the other direction's index order — a blank
      // screen that only a force-quit cleared. `lib/rtl.ts`'s header carries the measurement.
      applyDirectionForLanguage(code);
      await setLanguage(code);
    } catch {
      // The preference rolled itself back, so the reader is still in the language they were in —
      // and the direction has to roll back with it, or the next launch mirrors for a language
      // nobody is in.
      applyStoredDirection();
      setError(t('profile:language.switchFailedMessage'));
      setPending(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      testID="language-screen"
    >
      <SettingsGroup
        label={t('profile:language.group')}
        footnote={t('profile:language.restartNote')}
        testID="language-section"
      >
        {options.map((code) => {
          const selected = code === language;
          return (
            <SettingsRow
              key={code}
              label={uiLanguageLabel(code)}
              selected={selected}
              disabled={pending !== null && !selected}
              trailing={
                pending === code ? (
                  'spinner'
                ) : selected ? (
                  <Icon name="checkmark" size={CHECK_SIZE} color={colors.accent.primary} />
                ) : undefined
              }
              trailingTestID={`language-option-${code}-spinner`}
              onPress={() => void choose(code)}
              accessibilityLabel={uiLanguageLabel(code)}
              testID={`language-option-${code}`}
            />
          );
        })}
      </SettingsGroup>

      {error && <InlineError message={error} style={styles.error} testID="language-error" />}
    </ScrollView>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.background.primary,
    },
    scrollContent: {
      ...screenContentStyle('content'),
      padding: SPACING.xl,
      gap: SPACING.xl,
    },
    error: {
      marginTop: SPACING.lg,
    },
  }));
