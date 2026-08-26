/**
 * FilterPills - Horizontal scrollable row of active filter pills with remove functionality
 *
 * Story 4.5: Implement Book Filtering
 * Epic 4: Book Discovery & Browsing
 *
 * Displays active category and topic filters as removable pills.
 * Includes a "Clear All" button when filters are active.
 *
 * @example
 * <FilterPills
 *   categories={['self-help', 'business']}
 *   topics={['Leadership']}
 *   onRemoveCategory={(cat) => removeCategory(cat)}
 *   onRemoveTopic={(topic) => removeTopic(topic)}
 *   onClearAll={() => clearAllFilters()}
 * />
 */

import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { getCategoryDisplayName, getTopicDisplayName } from '@/constants/taxonomy';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useLanguage } from '@/lib/language';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

/**
 * Props for FilterPills component
 */
export interface FilterPillsProps {
  /** Selected category filters */
  categories: string[];
  /** Selected topic filters */
  topics: string[];
  /**
   * Active author filter (Story 23.12) — rendered as a removable pill so the
   * search-author filter is escapable. Previously the author filter was set
   * (from a search author chip) but never surfaced here, so with no category/
   * topic pill there was nothing to remove and no "Clear All" → a dead end.
   */
  author?: string | null;
  /** Callback when a category pill is removed */
  onRemoveCategory: (category: string) => void;
  /** Callback when a topic pill is removed */
  onRemoveTopic: (topic: string) => void;
  /**
   * Callback when the author pill is removed. Required (like the category/topic
   * removers) so a set `author` always has a working remove affordance — an
   * interactive pill with no handler would re-create the dead-end this story fixes.
   */
  onRemoveAuthor: (author: string) => void;
  /** Callback when "Clear All" is pressed */
  onClearAll: () => void;
  /** Test ID for testing */
  testID?: string;
}

/**
 * FilterPills Component
 *
 * Horizontal scrollable row of removable filter pills.
 * Categories and topics have distinct styling.
 * Returns null when no filters are active.
 */
export function FilterPills({
  categories,
  topics,
  author,
  onRemoveCategory,
  onRemoveTopic,
  onRemoveAuthor,
  onClearAll,
  testID = 'filter-pills',
}: FilterPillsProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    container: {
      paddingVertical: SPACING.sm,
    },
    scrollContent: {
      paddingHorizontal: SPACING.lg,
      gap: SPACING.sm,
      alignItems: 'center',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.xs,
      paddingLeft: SPACING.sm,
      paddingRight: SPACING.xs,
      borderRadius: RADII.pill,
      gap: SPACING.xs,
    },
    pillCategory: {
      backgroundColor: t.colors.accent.primary,
    },
    pillTopic: {
      backgroundColor: t.colors.accent.secondary,
    },
    // Author pill is neutral (surface, not a taxonomy accent) — it's a "filtered
    // to a person" state, visually distinct from category/topic accent pills.
    pillAuthor: {
      backgroundColor: t.colors.background.tertiary,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    pillAuthorText: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.text.primary,
    },
    pillPressed: {
      opacity: 0.7,
    },
    pillText: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.text.onAccent,
    },
    closeIcon: {
      marginLeft: SPACING.xs / 2,
    },
    clearAllButton: {
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      minHeight: 44, // Touch target compliance
      justifyContent: 'center',
    },
    clearAllPressed: {
      opacity: 0.7,
    },
    clearAllText: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.accent.primary,
    },
  }));

  // Hide if no filters active
  const hasFilters = categories.length > 0 || topics.length > 0 || !!author;
  if (!hasFilters) {
    return null;
  }

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        testID={`${testID}-scroll`}
      >
        {/* Author Pill (Story 23.12) — first, since it's often the sole filter
            set from a search author chip. Neutral surface + person glyph. */}
        {author ? (
          <Pressable
            key={`author-${author}`}
            style={({ pressed }) => [styles.pill, styles.pillAuthor, pressed && styles.pillPressed]}
            onPress={() => onRemoveAuthor(author)}
            testID={`${testID}-author`}
            accessibilityLabel={t('a11y:removeFilter', { filter: author })}
            accessibilityRole="button"
          >
            <Icon name="person" size={13} color={colors.text.secondary} />
            <Text style={styles.pillAuthorText}>{author}</Text>
            <Icon name="close" size={14} color={colors.text.secondary} style={styles.closeIcon} />
          </Pressable>
        ) : null}

        {/* Category Pills */}
        {categories.map((category) => (
          <Pressable
            key={`cat-${category}`}
            style={({ pressed }) => [
              styles.pill,
              styles.pillCategory,
              pressed && styles.pillPressed,
            ]}
            onPress={() => onRemoveCategory(category)}
            testID={`${testID}-category-${category}`}
            accessibilityLabel={t('a11y:removeFilter', {
              filter: getCategoryDisplayName(category, language),
            })}
            accessibilityRole="button"
          >
            <Text style={styles.pillText}>{getCategoryDisplayName(category, language)}</Text>
            <Icon name="close" size={14} color={colors.text.onAccent} style={styles.closeIcon} />
          </Pressable>
        ))}

        {/* Topic Pills */}
        {topics.map((topic) => (
          <Pressable
            key={`topic-${topic}`}
            style={({ pressed }) => [styles.pill, styles.pillTopic, pressed && styles.pillPressed]}
            onPress={() => onRemoveTopic(topic)}
            testID={`${testID}-topic-${topic}`}
            accessibilityLabel={t('a11y:removeFilter', {
              filter: getTopicDisplayName(topic, language),
            })}
            accessibilityRole="button"
          >
            {/* Label only — `onRemoveTopic` still gets the raw English key (Story 24.14). */}
            <Text style={styles.pillText}>{getTopicDisplayName(topic, language)}</Text>
            <Icon name="close" size={14} color={colors.text.onAccent} style={styles.closeIcon} />
          </Pressable>
        ))}

        {/* Clear All Button */}
        <Pressable
          style={({ pressed }) => [styles.clearAllButton, pressed && styles.clearAllPressed]}
          onPress={onClearAll}
          testID={`${testID}-clear-all`}
          accessibilityLabel={t('a11y:clearAllFilters')}
          accessibilityRole="button"
        >
          <Text style={styles.clearAllText}>{t('actions.clearAll')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
