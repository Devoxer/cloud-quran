/**
 * SectionHeader - Reusable section header with title and optional actions
 *
 * Story 8.2: Implement Library Tab Screen
 * Epic 8: User Library & Collections
 *
 * Displays a section title with optional "See All" link and/or custom right action.
 * When both are provided, "See All" appears first, followed by the right action.
 *
 * @example
 * // Basic usage
 * <SectionHeader title="Continue Reading" />
 *
 * // With See All link
 * <SectionHeader title="History" onSeeAll={() => router.push('/history')} />
 *
 * // With custom right action
 * <SectionHeader title="Collections" rightAction={<AddButton />} />
 *
 * // With both See All and right action (AC #4)
 * <SectionHeader title="Collections" onSeeAll={handleSeeAll} rightAction={<AddButton />} />
 */

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

export interface SectionHeaderProps {
  /** Section title text */
  title: string;
  /**
   * Optional small secondary line under the title (Story 23.15) — e.g. a count
   * like "6 notes · 5 books" / "4 books · 72.4 MB". Keeps the count in the header
   * row instead of a separate summary line below the section.
   */
  subtitle?: string;
  /** Called when "See All" is pressed. If provided, shows "See All" link. */
  onSeeAll?: () => void;
  /** Custom right action element. Can be shown alongside "See All" link. */
  rightAction?: ReactNode;
  /** Test ID for testing */
  testID?: string;
}

export function SectionHeader({
  title,
  subtitle,
  onSeeAll,
  rightAction,
  testID,
}: SectionHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();

  const hasActions = onSeeAll || rightAction;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {hasActions && (
        <View style={styles.actionsContainer}>
          {onSeeAll && (
            <Pressable
              onPress={onSeeAll}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('a11y:seeAllOf', { title })}
              testID="section-header-see-all"
              style={styles.seeAll}
            >
              {/* Text node stays exactly "See All" (tests assert getByText('See All'));
                  the chevron is an added sibling that unifies the "See All >" look. */}
              <Text style={styles.seeAllText}>{t('actions.seeAll')}</Text>
              <Icon name="chevron-forward" size={14} color={colors.accent.primary} />
            </Pressable>
          )}
          {rightAction && <View testID="section-header-right-action">{rightAction}</View>}
        </View>
      )}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },
    titleBlock: {
      flexShrink: 1,
    },
    title: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h3 * LINE_HEIGHT.heading3,
      color: t.colors.text.primary,
    },
    // Story 23.15: count line under the title (e.g. "6 notes · 5 books").
    subtitle: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      color: t.colors.text.tertiary,
      marginTop: 2,
    },
    actionsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    seeAllText: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.accent.primary,
    },
  }));
