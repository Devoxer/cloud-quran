import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { HOME_HREF } from '@/constants/navigation';
import { RADII } from '@/constants/radii';
import { MIN_TOUCH_TARGET, SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * The immersive reading surface — a placeholder body in a REAL immersive slot (story 6-0).
 *
 * ⚠️ ITS ADDRESS AND ITS PRESENTATION ARE THE FEATURE, AND THEY DO DIFFERENT JOBS. This file sits
 * at the ROOT of `src/app/`, a sibling of `(tabs)`, and `app/_layout.tsx` registers it with
 * `presentation: 'fullScreenModal'` and `headerShown: false`.
 *
 *   - **Position removes the tab bar.** Being outside the tab navigator is what keeps the bar out
 *     of this screen's layout. ⚠️ On Android `presentation: 'modal'` is documented as equivalent
 *     to `push`, so a presentation cannot be what covers the Material NavigationBar there — only
 *     the position can be. An earlier draft of this docblock credited the modal with it.
 *   - **Presentation makes it immersive rather than a push**: full-screen cover, no page-sheet
 *     inset, no parent visible behind, no back-chevron or edge-swipe affordance.
 *
 * ⚠️ wisdom-fruits' evidence — an in-tab modal left the Android bar visible, a root modal covered
 * it — moved BOTH variables at once and does not isolate them. Do not cite it for either half
 * alone.
 *
 * ⚠️ THE ROOM HAS A DOOR, AND THE DOOR IS IN CONTENT. `fullScreenModal` deliberately has no
 * dismiss gesture, and on web there is no gesture in the first place — a reader who arrives here
 * by URL or deep link would otherwise be stuck with no way out on any platform. The control is a
 * plain view in the tree, NOT a native header slot: a control in the native stack header is drawn
 * perfectly and never receives a mouse click on an Apple-silicon Mac running the iPhone build,
 * which is what `lint:header-controls` exists to prevent. `canGoBack()` is checked because a
 * direct load has no history to pop; the no-history exit is `HOME_HREF` and NOT `/`, because `/`
 * is itself a redirect that pops the root stack — routing the exit through it means the reader
 * leaves a chromeless screen for a blank one while a queued pop settles.
 *
 * ⚠️ THE DOOR LOOKS LIKE A DOOR, WHICH ON A CHROMELESS SCREEN IS THE WHOLE JOB. Everything here
 * used to render at React Native's default 14pt with no weight and no border, so the only way out
 * read as a third line of body copy — on the one screen in the app with no header, no tab bar and
 * therefore no other affordance. It is now a bordered pill with a weighted label.
 *
 * ⚠️ THE LABEL IS `text.primary` AND THE BORDER IS THE ACCENT, AND THAT SPLIT IS THE SAME CALL THE
 * TAB BAR MAKES. `accent.primary` on `background.primary` measures 4.05:1 on terracotta·light —
 * under the 4.5 AA needs for small text — and terracotta's accent is byte-locked to the live
 * default, so it cannot be tuned. The accent therefore marks the control as a control, where the
 * applicable bar is WCAG 1.4.11's 3:1 for a non-text component, and the text stays on a pair held
 * at AAA (`text.primary` on `background.secondary`). Held in `palettes.contrast.test.ts`.
 *
 * Story 6.1 fills this screen in — in place, without moving it — and owns the reader's real
 * chrome (reveal-on-tap, fade-on-scroll). This close control is the placeholder's door, not that
 * design; what it settles is only that an immersive route never needs a native header slot.
 *
 * ⚠️ NOTHING IN THE APP LINKS HERE EXCEPT ONE TEMPORARY ROW. Until 6.1 gives the reader a Read
 * tab, the only in-app entry is a settings row marked for deletion in that story
 * (`(tabs)/(profile)/account.tsx`); it exists so the "opened from a tab / returns to the tab with
 * its state intact" smokes are run rather than approximated by typing a URL.
 */
export default function Read() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: SPACING.lg,
      backgroundColor: theme.colors.background.primary,
    },
    title: {
      color: theme.colors.text.primary,
      marginBottom: SPACING.xs,
      fontSize: FONT_SIZE.h1,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h1 * LINE_HEIGHT.heading1,
    },
    body: {
      color: theme.colors.text.secondary,
      textAlign: 'center' as const,
      fontSize: FONT_SIZE.body,
      lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
    },
    close: {
      marginTop: SPACING.xl,
      minWidth: MIN_TOUCH_TARGET,
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: SPACING.lg,
      backgroundColor: theme.colors.background.secondary,
      borderColor: theme.colors.accent.primary,
      borderWidth: 1,
      borderRadius: RADII.pill,
    },
    closeLabel: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
    },
  }));

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('placeholder.appName')}</Text>
      <Text style={styles.body}>{t('placeholder.readingModeSoon')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('actions.close')}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace(HOME_HREF);
        }}
        style={styles.close}
      >
        <Text style={styles.closeLabel}>{t('actions.close')}</Text>
      </Pressable>
    </View>
  );
}
