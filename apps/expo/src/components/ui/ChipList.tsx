/**
 * ChipList - List of chips with section title
 *
 * Story 4.3: Implement Discover Tab with Categories and Topics
 * Epic 4: Book Discovery & Browsing
 *
 * Displays a section with title and chips.
 * Supports horizontal scroll or wrapped static layout.
 * Wrapped layout shows limited chips with inline "See All" button.
 *
 * @example
 * // Horizontal scroll (default)
 * <ChipList title="Categories" items={categories} />
 *
 * // Wrapped layout with limited visible chips
 * <ChipList title="Categories" items={categories} layout="wrapped" maxVisible={12} />
 *
 * // With display name transform (for category IDs)
 * <ChipList
 *   title="Categories"
 *   items={categoryIds}
 *   getDisplayName={getCategoryDisplayName}
 * />
 */

import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Chip } from './Chip';
import { LoadingView } from './LoadingView';

/**
 * Layout mode for chips
 */
export type ChipListLayout = 'horizontal' | 'wrapped';

/**
 * Props for ChipList component
 */
export interface ChipListProps {
  /** Section title (e.g., "Categories", "Topics") */
  title: string;
  /** Array of items to display as chips */
  items: string[];
  /** Currently selected item (if any) - uses raw item value */
  selectedItem?: string | null;
  /** Callback when an item is selected - receives raw item value */
  onSelectItem?: (item: string | null) => void;
  /** Callback when "See All" is pressed (header button) */
  onSeeAll?: () => void;
  /** Maximum items to show before inline "See All" chip (for wrapped layout) */
  maxVisible?: number;
  /** Whether to show loading skeleton */
  isLoading?: boolean;
  /** Layout mode: horizontal scroll or wrapped static */
  layout?: ChipListLayout;
  /** Transform function to convert item value to display name */
  getDisplayName?: (item: string) => string;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
  /** Test ID prefix for testing */
  testID?: string;
}

/**
 * ChipList Component
 *
 * List of chips with section title and optional "See All" button.
 * Horizontal layout scrolls, wrapped layout shows limited chips with inline expand.
 */
export function ChipList({
  title,
  items,
  selectedItem,
  onSelectItem,
  onSeeAll,
  maxVisible,
  isLoading = false,
  layout = 'horizontal',
  getDisplayName,
  style,
  testID,
}: ChipListProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((t) => ({
    container: {
      marginBottom: SPACING.lg, // 16px - Section gap
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md, // 12px
      paddingHorizontal: SPACING.lg, // 16px - Match screen padding
    },
    title: {
      fontSize: FONT_SIZE.h3, // 16px per story spec (not 20px - h3 is subsections)
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h3 * LINE_HEIGHT.heading3,
      color: t.colors.text.primary,
    },
    scrollContent: {
      paddingHorizontal: SPACING.lg, // 16px - Match screen padding
    },
    wrappedContent: {
      paddingHorizontal: SPACING.lg,
    },
    wrappedContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    loading: {
      paddingVertical: SPACING.sm,
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.lg,
    },
    chipGap: {
      marginRight: SPACING.sm, // 8px gap between chips
    },
    chipGapWrapped: {
      marginRight: SPACING.sm, // 8px gap between chips
      marginBottom: SPACING.sm, // 8px gap between rows
    },
    seeAllChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      borderColor: t.colors.accent.primary,
    },
    seeAllChipText: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.accent.primary,
    },
  }));

  // For wrapped layout, use maxVisible or default; for horizontal, show all
  // When maxVisible is explicitly undefined (expanded state), show all items
  const effectiveMaxVisible =
    layout === 'wrapped' ? (maxVisible === undefined ? items.length : maxVisible) : items.length;

  // Handle chip press
  const handleChipPress = (item: string) => {
    if (!onSelectItem) return;
    // Toggle off if already selected, otherwise select
    onSelectItem(selectedItem === item ? null : item);
  };

  // Determine which items to display
  const visibleItems = items.slice(0, effectiveMaxVisible);
  const hiddenCount = items.length - visibleItems.length;

  // Get display name for an item
  const displayName = (item: string) => (getDisplayName ? getDisplayName(item) : item);

  // Render chips content
  const renderChips = () => {
    if (isLoading) {
      // Story 17.13: a small inline spinner replaces the chip skeletons.
      return (
        <LoadingView
          size="small"
          style={styles.loading}
          testID={testID ? `${testID}-loading` : undefined}
        />
      );
    }

    // Show actual chips
    const chips = visibleItems.map((item, index) => (
      <Chip
        key={item}
        label={displayName(item)}
        isSelected={selectedItem === item}
        onPress={() => handleChipPress(item)}
        style={layout === 'wrapped' ? styles.chipGapWrapped : styles.chipGap}
        testID={testID ? `${testID}-chip-${index}` : undefined}
      />
    ));

    // Add inline "See All" chip for wrapped layout when items are hidden
    if (layout === 'wrapped' && hiddenCount > 0 && onSeeAll) {
      chips.push(
        <Pressable
          key="see-all-chip"
          onPress={onSeeAll}
          style={[styles.seeAllChip, styles.chipGapWrapped]}
          testID={testID ? `${testID}-see-all` : undefined}
        >
          <Text style={styles.seeAllChipText}>
            {t('common:moreCount', { moreCount: hiddenCount })}
          </Text>
        </Pressable>
      );
    }

    return chips;
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Header with title */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>

      {/* Chips container - horizontal scroll or wrapped static */}
      {layout === 'wrapped' ? (
        <View style={styles.wrappedContent}>
          <View style={styles.wrappedContainer}>{renderChips()}</View>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {renderChips()}
        </ScrollView>
      )}
    </View>
  );
}
