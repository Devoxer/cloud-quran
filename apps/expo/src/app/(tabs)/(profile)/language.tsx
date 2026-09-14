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
 * ⚠️ IT ALSO CARRIES THE NUMERAL SYSTEM (2026-09-14), WHICH IS NOT A LANGUAGE SETTING. Western
 * `0-9` vs Arabic-Indic `٠-٩` for the Quran's own structure numbers is orthogonal to the UI
 * language and defaults to Western in every one of them — `lib/numerals.ts` carries the decision
 * and the two reversals behind it. It shares this screen because both are WRITING-SYSTEM choices,
 * and the two groups are deliberately not alike: the language list spins, can fail and restarts
 * the app; the numeral rows write MMKV and are already on screen before the finger lifts.
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
import {
  NUMERAL_SYSTEMS,
  type NumeralSystem,
  numeralSampleLabel,
  setNumeralSystem,
  useNumeralSystem,
} from '@/lib/numerals';
import { applyDirectionForLanguage, applyStoredDirection } from '@/lib/rtl';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** The checkmark beside the language in force — sized like every other trailing affordance. */
const CHECK_SIZE = 18;

/**
 * The bundle key for each numeral system's row label. WHOLE KEYS in a map, rather than one
 * assembled from the system id: the ids are wire-ish kebab-case (`arabic-indic`), and a key built
 * by string surgery is a key neither `lint:i18n` nor the parity gate can follow to the bundle.
 */
const NUMERAL_LABEL_KEYS = {
  western: 'profile:numerals.western',
  'arabic-indic': 'profile:numerals.arabicIndic',
  // `as const` is load-bearing: `t()`'s key parameter is the generated union, so a `string`-typed
  // map compiles to a call tsc cannot check and a typo would ship as a raw key on screen.
} as const satisfies Record<NumeralSystem, string>;

export default function LanguageScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const { language, setLanguage } = useLanguage();
  const numerals = useNumeralSystem();
  /**
   * The row the reader just tapped. ONE-SHOT PER MOUNT: a committed switch is followed by a reload,
   * so the screen is on borrowed time from here — letting a second tap start a second switch is how
   * two overlapping calls end up racing each other's rollback (`setLanguage`'s ticket exists for
   * exactly that, and not making it necessary is cheaper than relying on it).
   */
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = AVAILABLE_UI_LANGUAGES.filter(isExposedLanguage);

  /**
   * ⚠️ EVERY EXIT FROM `choose` MUST CLEAR `pending`, INCLUDING THE ONE THAT LOOKS LIKE SUCCESS.
   * `setLanguage` resolves and THEN restarts the JS context, so on the happy path this component
   * is simply destroyed and the spinner goes with it. But `reloadAppAsync` can resolve without
   * reloading (no `globalThis.expo` — SSR, a test) and can reject outright (Android with no
   * current activity, where `setLanguage` swallows it and applies the language live instead). In
   * both cases the promise settles, nothing restarts, and without this the row spins forever with
   * the native preference already flipped and the tree still drawn the old way — the one state a
   * reader cannot get out of except by force-quitting.
   *
   * ⚠️ AND IT RAISES NO ERROR, DELIBERATELY. Settling without a restart is not a failure: either
   * the choice applies at the next launch, or (Android, where `setLanguage` answers a rejected
   * reload by switching i18next live) it has already applied. The footnote under the list —
   * "the language and its text direction apply as soon as the app restarts" — is the true thing
   * to say in both cases, and it is already on screen. `switchFailedMessage` belongs to the
   * `catch`, where the preference really did roll back.
   */
  const stopSpinning = () => setPending(null);

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
      // The reader is still in the language they were in, so the direction has to come back with
      // them or the NEXT launch mirrors for a language nobody is in.
      //
      // ⚠️ GUARDED, AND NOT BECAUSE IT IS LIKELY. This `catch` also covers a throw from
      // `applyDirectionForLanguage` itself — and the first thing the recovery does is re-enter the
      // same two `I18nManager` calls. An unguarded re-entry turns one swallowed failure into a
      // second, UNHANDLED one, from a `catch` block, where nothing can report it.
      try {
        applyStoredDirection();
      } catch {
        // Nothing left to try: the preference is what the next launch reads, and the message
        // below is what the reader acts on.
      }
      setError(t('profile:language.switchFailedMessage'));
      stopSpinning();
      return;
    }
    // Reached only when the reload did not happen — see `stopSpinning`.
    stopSpinning();
  };

  /**
   * ⚠️ NO SPINNER, NO TICKET, NO RELOAD — the whole reason this sits beside a control that needs
   * all three. The write is synchronous MMKV and every surface that draws a structure number is
   * subscribed to it (`lib/format.ts` § `useQuranNumerals`), so the digits have already changed
   * by the time the reader looks up. Re-picking the active system writes nothing.
   */
  const chooseNumerals = (system: NumeralSystem) => {
    if (system === numerals) return;
    haptics.selection();
    setNumeralSystem(system);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      testID="language-screen"
    >
      {/* ⚠️ NO GROUP LABEL. `SettingsGroup`'s caps header would read "LANGUAGE" directly under a
          screen title that already says Language — the same word twice, and in Arabic a caps
          treatment that does nothing. The footnote is the only thing this group has to add. */}
      <SettingsGroup footnote={t('profile:language.restartNote')} testID="language-section">
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

      {/* ⚠️ THE NUMERAL SYSTEM LIVES HERE RATHER THAN IN ITS OWN ROW, AND IT IS NOT A LANGUAGE
          SETTING — see `lib/numerals.ts` for why the two are deliberately orthogonal. It shares
          this screen because both are WRITING-SYSTEM choices and a reader looking for one is
          looking for the other; giving it a settings row of its own would put a two-option
          preference one tap from the top of a list whose other rows are whole screens.

          ⚠️ AND IT IS OFFERED IN EVERY LANGUAGE, NOT ONLY ARABIC. The default is Western
          everywhere, so hiding the group under a non-Arabic interface would mean an English
          reader beside a printed mushaf could never reach `٣` at all — which is the coupling
          this control exists to break. It also applies with NO restart, unlike the list above,
          which is why it carries its own footnote rather than sharing that one. */}
      <SettingsGroup
        label={t('profile:numerals.group')}
        footnote={t('profile:numerals.footnote')}
        testID="numerals-section"
      >
        {NUMERAL_SYSTEMS.map((system) => {
          const active = system === numerals;
          return (
            <SettingsRow
              key={system}
              label={t(NUMERAL_LABEL_KEYS[system])}
              description={numeralSampleLabel(system)}
              selected={active}
              trailing={
                active ? (
                  <Icon name="checkmark" size={CHECK_SIZE} color={colors.accent.primary} />
                ) : undefined
              }
              onPress={() => chooseNumerals(system)}
              testID={`numeral-option-${system}`}
            />
          );
        })}
      </SettingsGroup>
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
