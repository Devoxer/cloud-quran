/**
 * FavoriteButton — a self-contained, icon-only heart toggle (Story 30.1).
 *
 * The shared heart used by every ICON-ONLY favorite surface (browse compact rows, hero rows, the
 * Favorites route). NOT the book-detail cell — that's a labeled action cell built inline in
 * `BookDetailHeader`. Renders its OWN `Pressable` with `hitSlop` + a light haptic on press, so it
 * can drop into any row as a SIBLING of the row's open-Pressable (never nested — a Pressable inside
 * a Pressable is a `<button>`-in-`<button>` on web; see `QuoteRow`).
 */

import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';

export interface FavoriteButtonProps {
  /** Whether the book is currently favorited (drives fill vs outline). */
  favorited: boolean;
  /** Toggle handler — called after the light haptic. */
  onToggle: () => void;
  /** Icon size (default 20, the row-heart scale used by QuoteRow). */
  size?: number;
  /** Test ID for the Pressable. */
  testID?: string;
}

export function FavoriteButton({ favorited, onToggle, size = 20, testID }: FavoriteButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('a11y');
  return (
    <Pressable
      onPress={() => {
        haptics.impact('light');
        onToggle();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={favorited ? t('favoriteRemove') : t('favoriteAdd')}
      testID={testID}
    >
      <Icon
        name={favorited ? 'heart' : 'heart-outline'}
        size={size}
        color={favorited ? colors.accent.primary : colors.text.secondary}
      />
    </Pressable>
  );
}
