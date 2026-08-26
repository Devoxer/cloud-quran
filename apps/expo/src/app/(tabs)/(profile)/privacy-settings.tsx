/**
 * Privacy Settings Screen
 *
 * The single user-facing privacy control: opt IN to PII-scrubbed crash reporting. The pref is
 * device-local (MMKV) — it works with no identity at all and never leaves the device.
 *
 * ⚠️ story 5-2 INVERTED THIS SCREEN. It shipped from the seed as an analytics opt-OUT, defaulted
 * ON, describing PostHog and naming "Wisdom Fruits" in its copy. Cloud Quran ships zero
 * third-party analytics, advertising or tracking SDKs (PRD NFR8/NFR28); opt-in, PII-scrubbed
 * Sentry is the single sanctioned exception and is OFF until the user turns it on. The shared
 * `SettingsGroup` + `SettingsRow` shell and the optimistic-write behaviour are unchanged; the
 * pref, the copy and the testIDs are not.
 *
 * ⚠️ The toggle does NOT start or stop Sentry mid-session — `initErrorTracking()` and
 * `withSentry()` both run once at module scope in `app/_layout.tsx`. Turning it on takes effect
 * at the next launch, which the footnote says out loud rather than pretending otherwise.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { InlineError, SettingsGroup, SettingsRow } from '@/components/ui';
import { FLOATING_PILL_CLEARANCE, SPACING, screenContentStyle } from '@/constants/spacing';
import { haptics } from '@/lib/haptics';
import { useTelemetryEnabled } from '@/lib/privacyPrefs';
import { useThemedStyles } from '@/lib/useThemedStyles';

export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.background.primary,
    },
    scrollContent: {
      // Story 23.25: wide-screen cap (settings column → content:640, matching
      // profile) + web mini-player bottom clearance.
      ...screenContentStyle('content'),
      padding: SPACING.xl,
      paddingBottom: SPACING.xl + FLOATING_PILL_CLEARANCE,
    },
    error: {
      marginTop: SPACING.lg,
    },
  }));

  const [crashReportsEnabled, setCrashReportsEnabled] = useTelemetryEnabled();
  const [error, setError] = useState<string | null>(null);

  const handleToggle = (value: boolean) => {
    setError(null);
    try {
      // Reactive MMKV write — the Switch reflects the change immediately. There is nothing
      // async behind it any more (the old handler awaited PostHog's opt-in/opt-out call), so a
      // failure here means the write never landed and the Switch never moved — the error is
      // surfaced, and there is no optimistic value left to revert.
      setCrashReportsEnabled(value);
    } catch {
      setError(t('profile:privacySettings.updateError'));
      return;
    }
    // ⚠️ OUTSIDE the try, deliberately (story 5-2 review). Haptics used to sit inside it, so a
    // failing Taptic Engine — silenced device, unsupported hardware — reported "Failed to update
    // setting" AFTER the preference had already been written. The user would then toggle again
    // to fix a problem that did not exist. Feedback about the write must never be able to
    // contradict the write.
    haptics.success();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SettingsGroup
        footnote={t('profile:privacySettings.crashReportsFootnote')}
        testID="crash-reports-section"
      >
        <SettingsRow
          label={t('profile:privacySettings.crashReportsLabel')}
          description={t('profile:privacySettings.crashReportsDescription')}
          trailing="switch"
          value={crashReportsEnabled}
          onValueChange={handleToggle}
          trailingTestID="crash-reports-switch"
        />
      </SettingsGroup>

      {error && <InlineError message={error} style={styles.error} testID="crash-reports-error" />}
    </ScrollView>
  );
}
