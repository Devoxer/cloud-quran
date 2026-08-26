/**
 * SectionSkeleton — synthetic per-variant faux shapes that mimic a book-detail section's
 * BODY layout (paragraph / bullets / quote card / FAQ accordion). Body-only — consumers
 * render their own header. NEVER renders real text.
 *
 * ⚠️ SCOPED EXCEPTION to the stack's "spinner-not-skeleton" rule (STACK-CHEAT-SHEET § UI
 * primitives — "no hand-composed skeletons; a single themed <LoadingView>"). Book-detail is
 * skeleton-shaped BY DESIGN: the premium gating preview IS a synthetic skeleton (Story
 * 23.11). So the gated preview AND the cold-load placeholder share ONE faux-shape source
 * here — which is exactly what kills the drift the stack rule warns about (one layout, not N
 * copies). Do NOT reach for this elsewhere; the rest of the app stays on <LoadingView>.
 *
 * Used by `GatedSectionPlaceholder` (wrapped in blur + PREMIUM chip + fade) and by the four
 * section components' loading state (rendered plain). (Story 23.11.)
 */

import { View, type ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** Per-section faux layout — mirrors the real section it stands in for. */
export type SectionSkeletonVariant = 'paragraph' | 'bullets' | 'quote' | 'faq';

/**
 * Faux-shape intrinsic dims — shaped to mimic each real section's layout, OFF the SPACING
 * grid by design (the BookCard named-const precedent). Decorative; not theme/spacing tokens.
 */
const SKELETON = {
  /** Faux text-line thickness (body-ish). */
  lineHeight: 12,
  /** Faux heading/title-line thickness. */
  titleHeight: 14,
  /** Faux caption/attribution-line thickness. */
  smallHeight: 10,
  /** Bullet dot diameter (matches KeyTakeawaysSection's 6px bullet). */
  bulletDot: 6,
} as const;

/** Repeating line widths for the paragraph variant; the last line is always short. */
const PARAGRAPH_WIDTHS = ['100%', '96%', '99%', '92%', '88%', '94%'] as const;

export interface SectionSkeletonProps {
  /** Which faux layout to render. */
  variant: SectionSkeletonVariant;
  /** Paragraph line count (only used by the `'paragraph'` variant). @default 3 */
  lines?: number;
  /** Test ID for testing. */
  testID?: string;
}

/** A single faux bar (width/height are non-theme dynamic dims → stay inline). */
function Bar({
  style,
  width,
  height = SKELETON.lineHeight,
}: {
  style: ViewStyle;
  width: ViewStyle['width'];
  height?: number;
}) {
  return <View style={[style, { width, height }]} />;
}

/**
 * SectionSkeleton — the shared faux-shape body for a book-detail section.
 */
export function SectionSkeleton({ variant, lines = 3, testID }: SectionSkeletonProps) {
  const styles = useStyles();

  switch (variant) {
    case 'bullets':
      // Story 26.12: one item — bullet + title on the first row, then the description bars at
      // the LEFT EDGE below (matches the redesigned Key Takeaways).
      return (
        <View style={styles.bulletList} testID={testID}>
          <View style={styles.bulletItem}>
            <View style={styles.bulletTitleRow}>
              <View style={styles.bulletDot} />
              <Bar style={styles.bar} width="55%" height={SKELETON.titleHeight} />
            </View>
            <Bar style={styles.bar} width="100%" />
            <Bar style={styles.bar} width="88%" />
          </View>
        </View>
      );
    case 'quote':
      // Story 26.12: pull-quote (NO card) — quote text lines then a shorter explanation.
      return (
        <View style={styles.quoteBlock} testID={testID}>
          <Bar style={styles.bar} width="100%" />
          <Bar style={styles.bar} width="82%" />
          <Bar style={styles.barMuted} width="90%" height={SKELETON.smallHeight} />
          <Bar style={styles.barMuted} width="64%" height={SKELETON.smallHeight} />
        </View>
      );
    case 'faq':
      // Story 26.12: one Q&A block (NO card, no chevron) — a question line then answer lines.
      return (
        <View style={styles.faqList} testID={testID}>
          <View style={styles.faqItem}>
            <Bar style={styles.bar} width="72%" height={SKELETON.titleHeight} />
            <Bar style={styles.bar} width="100%" />
            <Bar style={styles.bar} width="80%" />
          </View>
        </View>
      );
    default: {
      // 'paragraph' — `lines` bars, the last one short, so a longer section (In-Depth) reads
      // visibly denser than a shorter one (Core).
      const count = Math.max(2, lines);
      return (
        <View style={styles.paragraph} testID={testID}>
          {Array.from({ length: count }).map((_, i) => (
            <Bar
              key={i}
              style={styles.bar}
              width={i === count - 1 ? '58%' : PARAGRAPH_WIDTHS[i % PARAGRAPH_WIDTHS.length]}
            />
          ))}
        </View>
      );
    }
  }
}

const useStyles = () =>
  useThemedStyles((t) => ({
    bar: {
      borderRadius: RADII.sm,
      backgroundColor: t.colors.background.tertiary,
    },
    barMuted: {
      borderRadius: RADII.sm,
      marginTop: SPACING.xs,
      backgroundColor: t.colors.background.secondary,
    },
    paragraph: {
      gap: SPACING.sm,
    },
    bulletList: {
      gap: SPACING.md,
    },
    bulletItem: {
      gap: SPACING.sm,
    },
    bulletTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    bulletDot: {
      width: SKELETON.bulletDot,
      height: SKELETON.bulletDot,
      borderRadius: SKELETON.bulletDot / 2,
      backgroundColor: t.colors.text.tertiary,
    },
    // Pull-quote block + Q&A block — no card background (matches the redesigned sections).
    quoteBlock: {
      gap: SPACING.sm,
    },
    faqList: {
      gap: SPACING.sm,
    },
    faqItem: {
      gap: SPACING.sm,
    },
  }));
