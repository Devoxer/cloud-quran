/**
 * SurahNavigator — the way forward AND back, and the last thing in the list (story 6-3, replacing
 * 6-1's next-only `NextSurahButton`; the prev+next shape is adapted from
 * `_reference/prefork-reading/features/reading/SurahNavigator.tsx`).
 *
 * ⚠️ IT IS IN CONTENT, NOT IN THE CHROME, AND THE I/O MATRIX SAYS WHY: "the last verse and the
 * next-surah control fully visible … CLEAR OF bottom chrome". A control that lived in the footer
 * bar could not be clear of it. So it is the list's footer component, it scrolls with the text,
 * and `read.tsx` reserves enough bottom padding that the chrome never covers it.
 *
 * ⚠️ BOTH ENDS WRAP — 114 → 1 going forward, 1 → 114 going back. A disabled control at either
 * end of the book is a dead end, and the mushaf itself is read as a cycle. 6-1 shipped next-only
 * on purpose ("backwards navigation is the index's job, 6.3"); this is 6.3.
 *
 * ⚠️ IT TAKES THE DESTINATIONS, NOT THE CURRENT SURAH, AND THAT IS A CARRIED FIX. The 6-1 button
 * once derived `nextSurah(surah)` itself while the screen derived it twice more for the label —
 * three derivations of one number for one press, three places for the label and the destination
 * to disagree. The screen derives each destination ONCE and passes both halves.
 */

import { SURAH_COUNT } from 'quran-data';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { RADII } from '@/constants/radii';
import { MIN_TOUCH_TARGET, SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** The surah after `surah`, wrapping 114 → 1. */
export function nextSurah(surah: number): number {
  return (surah % SURAH_COUNT) + 1;
}

/** The surah before `surah`, wrapping 1 → 114. */
export function prevSurah(surah: number): number {
  return surah === 1 ? SURAH_COUNT : surah - 1;
}

export interface SurahNavigatorProps {
  /** The surah "previous" moves TO — already wrapped. Derived once, by the screen. */
  prev: number;
  /** That surah's name, from the same derivation. */
  prevName: string;
  /** The surah "next" moves TO — already wrapped. Derived once, by the screen. */
  next: number;
  /** That surah's name, from the same derivation. */
  nextName: string;
  onNavigate: (surah: number) => void;
}

export function SurahNavigator({
  prev,
  prevName,
  next,
  nextName,
  onNavigate,
}: SurahNavigatorProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((theme) => ({
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.md,
      marginTop: SPACING.xl,
      paddingHorizontal: SPACING.lg,
    },
    button: {
      flex: 1,
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
      backgroundColor: theme.colors.background.secondary,
      borderColor: theme.colors.accent.primary,
      borderWidth: 1,
      borderRadius: RADII.pill,
    },
    label: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
    },
  }));

  const prevLabel = t('common:reading.prevSurah', { name: prevName });
  const nextLabel = t('common:reading.nextSurah', { name: nextName });

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={prevLabel}
        onPress={() => onNavigate(prev)}
        style={styles.button}
        testID="prev-surah-button"
      >
        <Text style={styles.label} numberOfLines={1}>
          {prevLabel}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        onPress={() => onNavigate(next)}
        style={styles.button}
        testID="next-surah-button"
      >
        <Text style={styles.label} numberOfLines={1}>
          {nextLabel}
        </Text>
      </Pressable>
    </View>
  );
}
