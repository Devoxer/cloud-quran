/**
 * Sign In (story 5-5) — THE ONE SIGN-IN ENTRY POINT, AND THE ONE PLACE SYNC IS EXPLAINED.
 *
 * ⚠️ THE DISCLOSURE IS ON THIS SCREEN, INLINE, AND IT REPLACED A WHOLE CONSENT ROUTE. For one day
 * (story 5-7, 2026-08-26) an FR30 consent screen stood in front of this one and this route
 * redirected to it. It was deleted the same day, because four review layers found it gated the
 * wrong thing: sync ALREADY ran for the anonymous guest the root layout mints at boot — four
 * authenticated GETs per launch — and nothing in `lib/sync.ts` or `lib/outbox.ts` ever read the
 * consent record. So the step interrupted the one reader who had decided to sign in, while every
 * other device synced unasked, under copy that claimed "we ask before any of it leaves this
 * device". The intro below says what signing in does with the reader's data, and PRESSING A
 * PROVIDER IS THE AFFIRMATIVE ACT — one fewer tap than the screen it replaced. The control that
 * actually stops sync is the switch on `data.tsx`, which `lib/sync.ts` consults for real.
 *
 * ⚠️ ONE LINE, THEN A LINK — THE FULL DISCLOSURE WAS TRIED HERE AND DID NOT FIT. It shipped for an
 * hour on 2026-08-26 as nine keys, ~750 characters, two headed sections and six bullets, and it
 * pushed the provider buttons and the email field off the screen on an iPhone. Detail on the way
 * to a login button is detail nobody reads; detail on the screen somebody opened LOOKING for it
 * gets read. So the entity list and the two processor sentences moved to `data.tsx`, next to the
 * switch that turns sync off, and what stays here is the sentence that names the data plus a link.
 *
 * ⚠️ ONE CALL SITE, ON PURPOSE. Nothing else in the app calls `signInWith*`, and
 * `__tests__/app/sign-in-disclosure.test.tsx` scans the source to keep that true — so the
 * disclosure cannot be walked around by a second button appearing somewhere else.
 *
 * ⚠️ NOTHING ON THIS SCREEN IS REQUIRED TO USE THE APP. Reading, bookmarks, downloads and
 * preferences all work with no account at all — signing in only makes them follow the reader to
 * another device. The intro copy says exactly that, and there is no dismiss-blocking wall
 * anywhere: this is a route you push and can walk back out of.
 *
 * Three flows on EVERY platform — the platform changes how a method runs, never whether it is
 * offered (`lib/auth.ts` owns that choice; this screen only draws buttons):
 *   • Apple — native sheet on iOS (id token + `expo-crypto` nonce); OAuth redirect everywhere
 *     else, because there is no Apple sheet off iOS.
 *   • Google — native SDK id token on iOS and Android; OAuth redirect on web and desktop. The
 *     button is hidden only when the build carries no client id at all, which is a CONFIG gate,
 *     never a platform one; see the `_comment_googleSignIn` note in app.json.
 *   • Email — a 6-digit code, POSTed for a session. Deliberately NOT a magic link: on native the
 *     link flow returns the session cookie as a QUERY PARAMETER on a deep link.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { CodeInput, GoogleGLogo, InlineError, Text } from '@/components/ui';
import { RADII } from '@/constants/radii';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import {
  requestEmailCode,
  type SignInResult,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/lib/auth';
import { config } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * Where the "what syncs and who sees it" link goes.
 *
 * ⚠️ A STAND-IN FOR A PUBLISHED PRIVACY POLICY URL, which epic 9's marketing site owns and which
 * both the App Store and Play require before submission — swapping this route for that URL is a
 * one-line change here (see `deferred-work.md`, "There is no privacy policy page").
 */
const DISCLOSURE_ROUTE = '/data';

const OTP_LENGTH = 6;
const BUTTON_MIN_HEIGHT = 48;
/** Deliberately loose. The worker is the authority; this only catches an obvious typo early. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Can this build reach Google at all?
 *
 * ⚠️ A CONFIG GATE, NOT A PLATFORM GATE, AND THE DIFFERENCE IS THE POINT (story 5-5 amendment).
 * `@react-native-google-signin` takes `iosClientId` on iOS and `webClientId` everywhere else, and
 * the WEB redirect leg needs NEITHER on the client — the worker holds the credentials. So the
 * button is hidden only when the build genuinely cannot reach Google from any platform, never
 * because of which platform is running. Keying it on the iOS id alone hid the button on a
 * perfectly configured Android or web build. `app.json`'s `_comment_googleSignIn` is the checklist.
 *
 * ⚠️ EVALUATED AT RENDER, NOT AT MODULE LOAD. `Platform.OS` captured at import freezes the answer
 * before anything can observe it, which is both a hidden coupling and the reason a parity test
 * could not see this screen from more than one platform.
 */
function googleAvailable(): boolean {
  return Platform.OS === 'web' || Boolean(config.google.iosClientId || config.google.webClientId);
}

/**
 * Typed refusals that mean "this deployment cannot do that", as opposed to "that went wrong".
 *
 * ⚠️ THE DISTINCTION IS THE WHOLE POINT OF THE WORKER TYPING THEM. `APPLE_WEB_SIGN_IN_UNAVAILABLE`
 * (no Services ID, or a lapsed six-month client secret) and `PROVIDER_NOT_FOUND` (no Google client
 * ids) both mean "try something else" — while "Sign-in didn't work, please try again" means "do
 * the same thing again", which will fail identically forever. Landing a typed code in a generic
 * message throws away exactly the information the user needs, and the web smoke showed precisely
 * that: a correct 503 carrying a correct code, rendered as a dead end.
 */
const UNAVAILABLE_CODES = new Set(['APPLE_WEB_SIGN_IN_UNAVAILABLE', 'PROVIDER_NOT_FOUND']);

export default function SignInScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Guards against a double tap outrunning `busy`, which is state and settles a tick later. */
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ⚠️ APPLE IS OFFERED ON EVERY PLATFORM. This used to be `Platform.OS === 'ios'`, which is
   * exactly the branch the amended spec forbids: a platform gate that REMOVES a method rather
   * than changing how it is performed. `lib/auth.ts` picks the mechanism (native sheet on iOS,
   * OAuth redirect on web and desktop); what varies here is only the button's chrome, because
   * `AppleAuthenticationButton` is an iOS-only native view and rendering it elsewhere renders
   * nothing at all. Android and web get the same styled Pressable as Google.
   */
  const useNativeAppleButton = Platform.OS === 'ios';
  const showGoogle = googleAvailable();

  /**
   * Leave the sign-in route, having signed in.
   *
   * ⚠️ ALWAYS `replace`, NEVER `back()`. This read `canGoBack() ? back() : replace('/account')`,
   * which is right for a CANCEL and wrong for a SUCCESS, and the difference was invisible until
   * someone signed in for real on the web build: the OAuth redirect legs push history entries, so
   * `/sign-in` can sit behind `/sign-in`, and `back()` lands the freshly-signed-in user straight
   * back on the sign-in screen. Reported 2026-08-25 after a genuine email-OTP sign-in — the
   * account existed server-side, verified, non-anonymous, while the screen still asked them to
   * sign in.
   *
   * `replace` is also the correct primitive on its own terms: a completed sign-in screen must not
   * stay in history for the back gesture to return to, on any platform.
   */
  const leave = () => {
    router.replace('/account');
  };

  /** Every provider funnels through here so success, cancellation and failure look the same. */
  const finish = (result: SignInResult) => {
    if (result.status === 'signed-in') {
      haptics.success();
      leave();
      return;
    }
    // `redirecting` reaches here on web and desktop and is NOT an outcome: the page is being
    // replaced, so there is nothing to say and nothing to navigate to. Leaving the button busy is
    // the honest state until the new page loads.
    if (result.status === 'redirecting') return;
    // ⚠️ A CANCEL PAINTS NOTHING. It used to go through the same red `InlineError` slot as a real
    // failure, so tapping back out of Apple's sheet — a deliberate, successful action — told the
    // reader something had gone wrong. The I/O matrix says a cancel means "return to the app,
    // session unchanged", and the screen already shows exactly that: the buttons, unbusied.
    if (result.status === 'cancelled') return;
    // ⚠️ DEV SHOWS THE CODE. Native provider failures produce no request for `wrangler tail` and
    // no console line that reaches a piped Metro — so on a device the typed code is the ONLY
    // diagnostic, and the shipped copy deliberately hides it. Three rounds of Apple-for-Android
    // were spent inferring what this one string says. Users still get the plain sentence.
    const message =
      result.code && UNAVAILABLE_CODES.has(result.code)
        ? t('profile:auth.unavailable')
        : t('profile:auth.failed');
    setError(__DEV__ && result.code ? `${message} [${result.code}]` : message);
  };

  /**
   * ⚠️ `catch`, NOT JUST `finally`. Every handler on this screen awaits something that can
   * REJECT — a native module that is not linked, a fetch that throws before the client can type
   * its error. `finally` only resets `busy`; it does not stop the rejection, which then escapes
   * as an unhandled promise with the screen showing nothing at all and the user tapping a button
   * that appears inert. A visible failure is the minimum.
   */
  const runProvider = async (provider: () => Promise<SignInResult>) => {
    // ⚠️ A RE-ENTRANCY GUARD, NOT A COSMETIC ONE. `busy` disables every OTHER control, but the
    // iOS Apple button is a native view that takes no `disabled`, so a second tap while the sheet
    // is opening started a CONCURRENT sign-in: two id tokens, two `/sign-in/social` calls, and a
    // race over which session cookie lands last. `busy` is React state and does not settle within
    // one tick, so the check is a ref — the thing a double-tap actually outruns.
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      finish(await provider());
    } catch (error) {
      // ⚠️ LOG IT IN DEV. A bare `catch {}` here swallowed the ONLY diagnostic a native sign-in
      // failure produces: the provider SDKs throw in-process, so nothing reaches the worker and
      // `wrangler tail` shows an empty session — the screen says "try again" and the device says
      // nothing at all. That cost three round-trips on Apple-for-Android (2026-08-25), where the
      // thrown error named the missing module and no one could see it. Dev-only, because the
      // message can carry provider detail that does not belong in a shipped log.
      if (__DEV__) console.error('[sign-in] provider threw', error);
      // Same reasoning as the typed-code display in `finish`: on a device this thrown message is
      // the only thing that names the cause, and a piped Metro never shows the console line.
      const detail = error instanceof Error ? error.message : String(error);
      setError(__DEV__ ? `${t('profile:auth.failed')} [${detail}]` : t('profile:auth.failed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleSendCode = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('profile:auth.emailInvalid'));
      return;
    }
    setBusy(true);
    try {
      const result = await requestEmailCode(email.trim());
      if (result.status === 'code-sent') {
        setCodeSent(true);
        setCode('');
      } else {
        setError(t('profile:auth.sendFailed'));
      }
    } catch {
      setError(t('profile:auth.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (value: string) => {
    setCode(value);
    if (value.length < OTP_LENGTH || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await verifyEmailCode(email.trim(), value);
      if (result.status === 'signed-in') {
        haptics.success();
        leave();
      } else {
        // A wrong or expired code is a TYPED failure from the worker, never a 500 — clear the
        // boxes so the next attempt starts from empty rather than from a rejected value.
        setCode('');
        setError(t('profile:auth.codeFailed'));
      }
    } catch {
      setCode('');
      setError(t('profile:auth.codeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      mode="layout"
    >
      <Stack.Screen options={{ title: t('navigation:titles.signIn') }} />

      {/* ⚠️ ABOVE THE BUTTONS, NOT BELOW THEM AND NOT ON A SCREEN OF ITS OWN. Pressing Apple,
          Google or Email is the affirmative act, so what the reader is agreeing to has to be
          readable before their thumb reaches it — which means it has to be SHORT enough to read
          and to leave the buttons on screen. A separate screen was tried and deleted, and so was
          the long version of this text; see this file's header. The link is a nested `Text` so it
          flows after the sentence rather than becoming a second block of its own. */}
      <Text style={styles.intro} testID="sync-disclosure">
        {t('profile:auth.intro')}{' '}
        <Text
          style={styles.introLink}
          onPress={() => router.push(DISCLOSURE_ROUTE)}
          accessibilityRole="link"
          accessibilityLabel={t('profile:auth.syncDetailsLink')}
          testID="sync-details-link"
        >
          {t('profile:auth.syncDetailsLink')}
        </Text>
      </Text>

      {useNativeAppleButton ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={RADII.md}
          // ⚠️ `AppleAuthenticationButton` ACCEPTS NO `disabled` PROP — every other control on
          // this screen takes one, and this native view silently ignores it. Dimming it is the
          // only visual feedback available; `runProvider`'s ref guard is what actually stops the
          // second tap.
          style={[styles.appleButton, busy && styles.pressed]}
          onPress={() => runProvider(signInWithApple)}
        />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.providerButton, pressed && styles.pressed]}
          onPress={() => runProvider(signInWithApple)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('profile:auth.apple')}
          testID="apple-sign-in-button"
        >
          {/* Ionicons' own Apple mark, NOT a stand-in. `icon-registry.ts` excludes brand logos
              from the SEMANTIC map and says so in its docblock — "they render via the Ionicons
              brand logos directly" — which is this. iOS never reaches here; it gets Apple's own
              native button above, logo included. */}
          <Ionicons name="logo-apple" size={20} color={colors.text.primary} />
          <Text style={styles.providerButtonText}>{t('profile:auth.apple')}</Text>
        </Pressable>
      )}

      {showGoogle && (
        <Pressable
          style={({ pressed }) => [styles.providerButton, pressed && styles.pressed]}
          onPress={() => runProvider(signInWithGoogle)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('profile:auth.google')}
          testID="google-sign-in-button"
        >
          {/* ⚠️ THE FOUR-COLOUR MARK, AND NEITHER A GLOBE NOR A MONOCHROME "G". This shipped as
              `globe-outline` first and then as Ionicons' single-colour G; Google's guidelines
              forbid BOTH — "Don't: Use monochrome versions of the Google 'G' for the button", and
              "Use the Google brand color for Google icon for dark, light, and neutral modes".
              The theme changes this button's background and label; the mark never changes. */}
          <GoogleGLogo size={20} />
          <Text style={styles.providerButtonText}>{t('profile:auth.google')}</Text>
        </Pressable>
      )}

      {/* Apple is always above this, so the divider always has something to separate from. It
          stays conditional only for the build where Google is the missing half — see below. */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('profile:auth.or')}</Text>
        <View style={styles.dividerLine} />
      </View>

      {codeSent ? (
        <View>
          {/* NOT `styles.label`: that one uppercases, and an uppercased email address in the
              middle of a sentence reads as a different address than the one just typed. */}
          <Text style={styles.sentence}>
            {t('profile:auth.codeSentTo', { email: email.trim() })}
          </Text>
          <CodeInput
            value={code}
            onChangeText={handleVerify}
            length={OTP_LENGTH}
            error={error !== null}
            disabled={busy}
          />
          <Pressable
            style={styles.textButton}
            onPress={() => {
              setCodeSent(false);
              setCode('');
              setError(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('profile:auth.useAnotherEmail')}
            testID="use-another-email-button"
          >
            <Text style={styles.textButtonLabel}>{t('profile:auth.useAnotherEmail')}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={styles.label}>{t('profile:auth.emailLabel')}</Text>
          <TextInput
            style={styles.emailInput}
            placeholder={t('profile:auth.emailPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            editable={!busy}
            accessibilityLabel={t('profile:auth.emailLabel')}
            testID="email-input"
          />
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}
            onPress={handleSendCode}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('profile:auth.sendCode')}
            testID="send-code-button"
          >
            <Text style={styles.submitButtonText}>
              {busy ? t('profile:auth.sending') : t('profile:auth.sendCode')}
            </Text>
          </Pressable>
        </View>
      )}

      {error && <InlineError message={error} style={styles.error} testID="sign-in-error" />}
    </KeyboardAwareScrollView>
  );
}

const APPLE_BUTTON_HEIGHT = 48;

const useStyles = () =>
  useThemedStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.background.primary,
    },
    scrollContent: {
      ...screenContentStyle('content'),
      padding: SPACING.xl,
      paddingBottom: SPACING.xxxl,
    },
    intro: {
      fontSize: FONT_SIZE.bodySmall,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      marginBottom: SPACING.xl,
      color: t.colors.text.secondary,
    },
    introLink: {
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.accent.primary,
    },
    appleButton: {
      height: APPLE_BUTTON_HEIGHT,
      marginBottom: SPACING.md,
    },
    providerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      minHeight: BUTTON_MIN_HEIGHT,
      borderRadius: RADII.md,
      borderWidth: 1,
      marginBottom: SPACING.md,
      backgroundColor: t.colors.background.secondary,
      borderColor: t.colors.border,
    },
    providerButtonText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.primary,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginVertical: SPACING.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: t.colors.border,
    },
    dividerText: {
      fontSize: FONT_SIZE.bodySmall,
      color: t.colors.text.tertiary,
    },
    label: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: 'uppercase',
      letterSpacing: 1.0,
      marginBottom: SPACING.sm,
      color: t.colors.text.tertiary,
    },
    sentence: {
      fontSize: FONT_SIZE.bodySmall,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      marginBottom: SPACING.lg,
      color: t.colors.text.secondary,
    },
    emailInput: {
      minHeight: BUTTON_MIN_HEIGHT,
      borderWidth: 1,
      borderRadius: RADII.md,
      paddingHorizontal: SPACING.md,
      fontSize: FONT_SIZE.body,
      backgroundColor: t.colors.background.secondary,
      borderColor: t.colors.border,
      color: t.colors.text.primary,
    },
    submitButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: BUTTON_MIN_HEIGHT,
      borderRadius: RADII.md,
      marginTop: SPACING.lg,
      backgroundColor: t.colors.accent.primary,
    },
    submitButtonText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.onAccent,
    },
    textButton: {
      alignSelf: 'center',
      paddingVertical: SPACING.md,
      marginTop: SPACING.md,
    },
    textButtonLabel: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.accent.primary,
    },
    pressed: {
      opacity: 0.7,
    },
    error: {
      marginTop: SPACING.lg,
    },
  }));
