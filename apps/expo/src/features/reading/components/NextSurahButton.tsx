/**
 * NextSurahButton — the way forward, and the last thing in the list (story 6-1).
 *
 * ⚠️ IT IS IN CONTENT, NOT IN THE CHROME, AND THE I/O MATRIX SAYS WHY: "the last verse and the
 * next-surah control fully visible … CLEAR OF bottom chrome". A control that lived in the footer
 * bar could not be clear of it. So it is the list's footer component, it scrolls with the text,
 * and `read.tsx` reserves enough bottom padding that the chrome never covers it.
 *
 * ⚠️ IT WRAPS AT 114 → 1 rather than disappearing. A disabled control at the end of An-Nas is a
 * dead end on a screen that has no surah index yet (that is story 6.3), and the mushaf itself is
 * read as a cycle.
 *
 * Only NEXT, deliberately. Backwards navigation is the index's job; shipping a second control
 * here would be half of 6.3 built in the wrong place.
 *
 * ⚠️ IT TAKES THE DESTINATION, NOT THE CURRENT SURAH, AND THAT IS A FIX. It used to take `surah`
 * and call `nextSurah(surah)` itself, while `read.tsx` called `nextSurah(surah)` twice more to
 * build the label — three derivations of one number for one press, which is three places for the
 * label and the destination to disagree. The screen derives it ONCE and passes both halves.
 */

import { SURAH_COUNT } from 'quran-data';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui';
import { RADII } from '@/constants/radii';
import { MIN_TOUCH_TARGET, SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** The surah after `surah`, wrapping 114 → 1. */
export function nextSurah(surah: number): number {
  return (surah % SURAH_COUNT) + 1;
}

export interface NextSurahButtonProps {
  /** The surah this moves TO — already wrapped. Derived once, by the screen. */
  next: number;
  /** That surah's name, from the same derivation. */
  nextName: string;
  onPress: (next: number) => void;
}

export function NextSurahButton({ next, nextName, onPress }: NextSurahButtonProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((theme) => ({
    button: {
      alignSelf: 'center',
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.xl,
      paddingHorizontal: SPACING.xl,
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

  const label = t('common:reading.nextSurah', { name: nextName });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(next)}
      style={styles.button}
      testID="next-surah-button"
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
