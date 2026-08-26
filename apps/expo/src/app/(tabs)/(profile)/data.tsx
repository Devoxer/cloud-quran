/**
 * Your data (story 5-7) — export, purge, and account deletion, in one place.
 *
 * ⚠️ FOUR CONTROLS, FOUR DIFFERENT PROMISES, AND CONFLATING ANY TWO IS THE FAILURE THIS SCREEN
 * IS SHAPED AROUND:
 *   • SYNC TO MY ACCOUNT is a switch, not an action, and it is the only one that is reversible.
 *     ON by default; OFF stops this device sending or fetching anything, keeping the account and
 *     everything already synced. `lib/sync.ts` reads the preference in the two places sync
 *     actually happens, so the label is true.
 *   • EXPORT hands the reader a copy and changes nothing (FR29).
 *   • DELETE MY DATA destroys every synced row and KEEPS the account (FR28) — sign-in still works,
 *     and the next device still finds the same account, just empty.
 *   • DELETE MY ACCOUNT destroys everything, in-app and complete, with no support contact
 *     (FR28a / Apple guideline 5.1.1(v)).
 * The copy says which is which; the two destructive ones sit behind their own `ConfirmDialog`, and
 * neither dialog's wording is reusable for the other.
 *
 * ⚠️ THE SWITCH REPLACED A ROW CALLED "STOP SYNCING" THAT DID NOT STOP SYNCING. That row signed the
 * reader out and cleared a consent record — after which `SyncIdentityBridge` immediately minted a
 * fresh guest, re-keyed the cache and re-prefetched all four entities. The reader was told syncing
 * had stopped while four authenticated GETs went out under a new id. A preference the data layer
 * consults is the version of that promise which is checkable.
 *
 * ⚠️ IT IS A SEPARATE SCREEN RATHER THAN THREE MORE ROWS ON `account.tsx`, and the reason is not
 * length. The settings home is where a reader goes to CHANGE something; three destructive rows
 * sitting between "Sign In" and "Send Feedback" is an invitation to a mis-tap. A dedicated screen
 * costs one tap and buys a deliberate arrival. Discoverability is unchanged: Apple requires
 * deletion to be reachable in-app, not to be on the first screen.
 *
 * ⚠️ NOTHING HERE IS AVAILABLE BEFORE AN IDENTITY EXISTS. Every route these call is session-scoped
 * (`getUserId(c)` and nothing else), so a caller with no session gets 401 — but the app is
 * anonymous-FIRST, so a guest has a session and their rows are theirs: a guest may export, purge
 * and delete exactly like anybody else.
 */

import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { ConfirmDialog, InlineError, SettingsGroup, SettingsRow, Text } from '@/components/ui';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, LINE_HEIGHT } from '@/constants/typography';
import { deleteAccount } from '@/lib/auth';
import { captureException } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useSyncEnabled } from '@/lib/privacyPrefs';
import { exportMyData, purgeMyData } from '@/lib/sync';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** Which confirmation is open, if any. One value rather than two booleans that can both be true. */
type Pending = 'purge' | 'delete-account' | null;

/** Which action is in flight, if any — every row is disabled while one is. */
type Busy = 'export' | 'purge' | 'delete-account' | null;

export default function DataScreen() {
  const { t } = useTranslation();
  const styles = useStyles();

  // ⚠️ SHOWN TO EVERYONE, INCLUDING A GUEST. The anonymous session minted at boot syncs exactly
  // like a signed-in one — that is the fact the deleted consent screen missed — so a reader who
  // has never signed in has something to turn off, and this is where they turn it off.
  const [syncEnabled, setSyncEnabled] = useSyncEnabled();

  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setNotice(null);
    setBusy('export');
    try {
      const delivery = await exportMyData();
      // ⚠️ `unavailable` IS NOT AN ERROR AND MUST NOT PAINT ONE. It means this device has no share
      // sheet and no writable cache directory — retrying does nothing, so the copy says what
      // happened rather than inviting another tap.
      if (delivery === 'unavailable') setNotice(t('profile:data.exportUnavailable'));
      else haptics.success();
    } catch (cause) {
      // Tier 1: the reader asked for their data and did not get it. `captureException` is a no-op
      // unless they opted into crash reporting.
      captureException(cause, { operation: 'data.export' });
      setError(t('profile:data.exportFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handlePurge = async () => {
    setPending(null);
    setError(null);
    setNotice(null);
    setBusy('purge');
    try {
      await purgeMyData();
      haptics.success();
      setNotice(t('profile:data.purgeDone'));
    } catch (cause) {
      captureException(cause, { operation: 'data.purge' });
      setError(t('profile:data.purgeFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handleSyncToggle = (value: boolean) => {
    setError(null);
    setNotice(null);
    try {
      // Synchronous MMKV — nothing to await and nothing optimistic to revert. A throw means the
      // preference never landed and the switch never moved, so the error is the whole report.
      setSyncEnabled(value);
    } catch (cause) {
      captureException(cause, { operation: 'data.setSyncEnabled' });
      setError(t('profile:data.syncToggleFailed'));
      return;
    }
    // Outside the try, for the reason `privacy-settings.tsx` spells out: feedback about a write
    // must never be able to contradict the write.
    haptics.success();
  };

  const handleDeleteAccount = async () => {
    setPending(null);
    setError(null);
    setNotice(null);
    setBusy('delete-account');
    try {
      const result = await deleteAccount();
      if (result.status === 'deleted') {
        haptics.success();
        // Deliberately no navigation. The reader stays where they are, now signed out with a
        // fresh guest session; the notice is what tells them it worked. Bouncing them to another
        // screen would make "did that work?" a question they cannot answer.
        setNotice(t('profile:data.deleteAccountDone'));
        return;
      }
      // ⚠️ OFFLINE IS ITS OWN MESSAGE. "Try again" is wrong advice for a device with no network,
      // and the delete was refused before anything was touched — nothing is half-done.
      setError(
        result.status === 'offline'
          ? t('profile:data.deleteAccountOffline')
          : t('profile:data.deleteAccountFailed')
      );
    } catch (cause) {
      captureException(cause, { operation: 'data.deleteAccount' });
      setError(t('profile:data.deleteAccountFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: t('navigation:titles.data') }} />

      {/* ⚠️ ITS OWN GROUP, ABOVE THE ACTIONS. A switch sitting in a list of destructive rows reads
          as one of them; separating it is what says "this one is reversible and destroys
          nothing". */}
      <View style={styles.syncSection}>
        <SettingsGroup
          label={t('profile:data.syncGroup')}
          footnote={t('profile:data.syncFootnote')}
        >
          <SettingsRow
            icon="cloud"
            label={t('profile:data.syncToggle')}
            description={t('profile:data.syncToggleDescription')}
            trailing="switch"
            value={syncEnabled}
            onValueChange={handleSyncToggle}
            accessibilityLabel={t('profile:a11y.syncToggle')}
            testID="sync-enabled-row"
            trailingTestID="sync-enabled-switch"
          />
        </SettingsGroup>

        {/* ⚠️ WHO ELSE EVER SEES IT — MOVED HERE FROM THE SIGN-IN SCREEN (2026-08-26). It sat above
            the provider buttons as two bulleted sentences and pushed them off an iPhone screen.
            This is where somebody has come LOOKING for the detail, and it is the one place naming
            a processor is useful anyway: it sits under the switch that stops the sending. A second
            paragraph rather than an addition to the footnote above, so neither becomes a wall. */}
        <Text style={styles.processors} testID="sync-processors">
          {t('profile:data.syncProcessors')}
        </Text>
      </View>

      <SettingsGroup label={t('profile:data.group')} footnote={t('profile:data.footnote')}>
        <SettingsRow
          icon="share-outline"
          label={t('profile:data.export')}
          description={t('profile:data.exportDescription')}
          trailing={busy === 'export' ? 'spinner' : 'chevron'}
          disabled={busy !== null}
          onPress={handleExport}
          accessibilityLabel={t('profile:a11y.exportData')}
          testID="export-data-row"
        />
        <SettingsRow
          icon="trash-outline"
          label={t('profile:data.purge')}
          description={t('profile:data.purgeDescription')}
          trailing={busy === 'purge' ? 'spinner' : undefined}
          destructive
          disabled={busy !== null}
          onPress={() => setPending('purge')}
          accessibilityLabel={t('profile:a11y.purgeData')}
          testID="purge-data-row"
        />
        <SettingsRow
          icon="close-circle"
          label={t('profile:data.deleteAccount')}
          description={t('profile:data.deleteAccountDescription')}
          trailing={busy === 'delete-account' ? 'spinner' : undefined}
          destructive
          disabled={busy !== null}
          onPress={() => setPending('delete-account')}
          accessibilityLabel={t('profile:a11y.deleteAccount')}
          testID="delete-account-row"
        />
      </SettingsGroup>

      {/* ⚠️ A NOTICE IS NOT AN `InlineError`. "Your data was deleted" is the action REPORTING
          SUCCESS, and painting it in the error slot's red would tell the reader the thing they
          asked for went wrong. Plain themed text, in the same place, is the honest shape. */}
      {notice && (
        <Text style={styles.notice} testID="data-notice">
          {notice}
        </Text>
      )}
      {error && <InlineError message={error} style={styles.error} testID="data-error" />}

      <ConfirmDialog
        visible={pending === 'purge'}
        title={t('profile:data.purgeDialog.title')}
        message={t('profile:data.purgeDialog.message')}
        confirmText={t('profile:data.purgeDialog.confirm')}
        confirmStyle="destructive"
        onConfirm={handlePurge}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        visible={pending === 'delete-account'}
        title={t('profile:data.deleteAccountDialog.title')}
        message={t('profile:data.deleteAccountDialog.message')}
        confirmText={t('profile:data.deleteAccountDialog.confirm')}
        confirmStyle="destructive"
        onConfirm={handleDeleteAccount}
        onCancel={() => setPending(null)}
      />
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
    // The scroll container's `gap` separates GROUPS; this paragraph belongs to the sync group, so
    // it is wrapped with it and sits a footnote's distance below rather than a group's.
    syncSection: {
      gap: SPACING.sm,
    },
    // Deliberately the same treatment as `SettingsGroup`'s own footnote — it reads as a second
    // paragraph of the same note, not as a new section with no heading.
    processors: {
      paddingHorizontal: SPACING.md,
      fontSize: FONT_SIZE.bodySmall,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      color: t.colors.text.tertiary,
    },
    error: {
      marginTop: SPACING.lg,
    },
    notice: {
      fontSize: FONT_SIZE.bodySmall,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      marginTop: SPACING.lg,
      color: t.colors.text.secondary,
    },
  }));
