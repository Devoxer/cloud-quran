/**
 * Settings home — and the ACCOUNT ROW (story 5-5).
 *
 * ⚠️ WHY THIS SCREEN EXISTS AT ALL. The `(profile)` tab is labelled Settings and, since the 5-1
 * seed deleted the account screen, it opened straight onto the Send Feedback FORM — with
 * `privacy-settings` reachable from nowhere in the UI. Story 5-5 needs somewhere to put the
 * account row, and a settings tab whose home is a settings list is the answer to both. It stays
 * deliberately small: epic 6 rebuilds this group as Cloud Quran's real Settings.
 *
 * ⚠️ THE ROW IS THE ONLY DOOR TO SIGN-IN, AND IT GOES STRAIGHT THERE. For one day it pushed to a
 * `/consent` screen first; that screen was deleted on 2026-08-26 because it gated the wrong thing
 * — sync already ran for every anonymous guest without it, so the step interrupted the one reader
 * who had decided to sign in while protecting nobody. The disclosure is now INLINE above the
 * provider buttons on `sign-in.tsx`, where pressing one is the informed affirmative act, and the
 * opt-out that actually stops sync is a switch on `data.tsx`. Do not reinstate a step here.
 *
 * ⚠️ NOTHING HERE GATES ANYTHING. `useSession()` starts `isPending` and settles to a user or to
 * `null`; the screen renders in all three states and shows the guest row while it waits. There is
 * no spinner takeover and no early return, because being signed out is not a loading state.
 */

import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { ConfirmDialog, InlineError, SettingsGroup, SettingsRow } from '@/components/ui';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { isPlaceholderEmail, signOut, useSession } from '@/lib/auth';
import { setString } from '@/lib/clipboard';
import { haptics } from '@/lib/haptics';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** How long the "copied" confirmation replaces the copy affordance. */
const COPIED_NOTICE_MS = 2000;

export default function AccountScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const { data: session } = useSession();

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ⚠️ IDENTITY AND ITS LABEL ARE TWO DIFFERENT QUESTIONS, AND CONFLATING THEM LOCKS PEOPLE IN.
  // An earlier revision derived everything from `session.user.email`, so a signed-in user whose
  // email was empty rendered as a guest — the "Sign In" row, and NO SIGN-OUT ROW: an account with
  // no way to leave it. Whether someone is signed in is `!isAnonymous`, full stop.
  //
  // An ANONYMOUS session is not "signed in": it is the guest the app mints on first launch so
  // sync has something to key on.
  const signedIn = Boolean(session && !session.user.isAnonymous);
  // The label is separate and may legitimately be absent — Apple returns an address on the FIRST
  // consent only. It is checked for the synthetic `temp@…` as a guard rather than a correction:
  // since amendment (b) upstream sets the real address on `/sign-in/social`, so a signed-in user
  // should never carry one. Showing nothing beats showing an address that does not exist.
  const displayEmail =
    signedIn && !isPlaceholderEmail(session?.user.email) ? session?.user.email : undefined;

  /**
   * ⚠️ THE ADDRESS IS THE ACCOUNT'S ONLY HUMAN-READABLE HANDLE, AND A PRIVATE RELAY ONE IS
   * UNTYPEABLE FROM MEMORY. Apple hands out `<random>@privaterelay.appleid.com`; a user who signed
   * in with Apple on their phone and then opens the web build has to enter SOMETHING to get back
   * to the same rows, and that string is it. Showing it is half the answer — copying it is the
   * other half, which is what turns it from a dead end into an instruction.
   */
  // Let the confirmation fade back to the affordance, so the row does not read "Address copied"
  // for the rest of the session and leave the user unsure whether pressing it still does anything.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyEmail = async () => {
    if (!displayEmail) return;
    try {
      await setString(displayEmail);
      setCopied(true);
      haptics.success();
    } catch {
      // A clipboard that refuses is not worth an error banner: the address is on screen and can
      // be read. Say nothing rather than raise an alarm about a convenience.
    }
  };

  const handleSignOut = async () => {
    setConfirmingSignOut(false);
    setError(null);
    try {
      // `signOut()` runs `teardownAccountScopedState()` first — playback, caches and the Sentry
      // identity. That call lives there, not here, so a second sign-out surface cannot forget it.
      await signOut();
      haptics.success();
    } catch {
      setError(t('profile:auth.failed'));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: t('navigation:titles.account') }} />

      <SettingsGroup
        label={t('profile:groups.account')}
        footnote={
          displayEmail ? t('profile:account.emailFootnote') : t('profile:account.syncFootnote')
        }
        testID="account-section"
      >
        {signedIn ? (
          <SettingsRow
            icon="person"
            iconVariant="badge"
            label={t('profile:account.signedIn')}
            // Never blank: Apple returns an email on the FIRST consent only, so a user who
            // revoked and re-linked can legitimately have no address on file. Saying so beats a
            // row that reads "Signed in" and nothing else.
            description={displayEmail ?? t('profile:account.emailPending')}
            // A value-text trailing slot, not a semantic token: `'checkmark'` is not one of
            // SettingsRow's tokens and would render as the literal word.
            trailing={
              displayEmail
                ? copied
                  ? t('profile:account.emailCopied')
                  : t('profile:account.copyEmail')
                : undefined
            }
            onPress={displayEmail ? copyEmail : undefined}
            accessibilityLabel={displayEmail ? t('profile:a11y.copyEmail') : undefined}
            testID="account-signed-in-row"
          />
        ) : (
          <SettingsRow
            icon="person"
            iconVariant="badge"
            label={t('profile:rows.signIn')}
            description={t('profile:hero.guestSubtitle')}
            trailing="chevron"
            onPress={() => router.push('/sign-in')}
            accessibilityLabel={t('profile:a11y.signIn')}
            testID="account-sign-in-row"
          />
        )}
        {signedIn && (
          <SettingsRow
            icon="log-out"
            label={t('profile:rows.signOut')}
            destructive
            onPress={() => setConfirmingSignOut(true)}
            accessibilityLabel={t('profile:a11y.signOut')}
            testID="account-sign-out-row"
          />
        )}
      </SettingsGroup>

      <SettingsGroup label={t('profile:account.othersGroup')} testID="app-section">
        <SettingsRow
          icon="lock-closed-outline"
          label={t('profile:rows.privacy')}
          trailing="chevron"
          onPress={() => router.push('/privacy-settings')}
          accessibilityLabel={t('profile:a11y.privacy')}
          testID="privacy-row"
        />
        {/* Export, delete-my-data and delete-my-account live together on their own screen —
            see `data.tsx` for why they are not three more rows here. */}
        <SettingsRow
          icon="folder-outline"
          label={t('profile:rows.yourData')}
          trailing="chevron"
          onPress={() => router.push('/data')}
          accessibilityLabel={t('profile:a11y.yourData')}
          testID="your-data-row"
        />
        <SettingsRow
          icon="chatbox-outline"
          label={t('profile:rows.sendFeedback')}
          trailing="chevron"
          onPress={() => router.push('/feedback')}
          testID="feedback-row"
        />
      </SettingsGroup>

      {error && <InlineError message={error} style={styles.error} testID="account-error" />}

      <ConfirmDialog
        visible={confirmingSignOut}
        title={t('profile:signOutDialog.title')}
        message={t('profile:signOutDialog.message')}
        confirmText={t('profile:signOutDialog.confirm')}
        confirmStyle="destructive"
        onConfirm={handleSignOut}
        onCancel={() => setConfirmingSignOut(false)}
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
    error: {
      marginTop: SPACING.lg,
    },
  }));
