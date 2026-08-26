/**
 * BottomSheet — the canonical wrapped sheet primitive (Story 17.4 §A, AC 2).
 *
 * Backed by `@expo/ui/community/bottom-sheet` (a `@gorhom/bottom-sheet`-API-
 * compatible native sheet): SwiftUI `.sheet()` on iOS, Material 3
 * `ModalBottomSheet` on Android, `vaul` drawer on web. It renders **arbitrary
 * React Native children** (it hosts them via `RNHostView` on native), which is
 * why we use it over the Universal `@expo/ui` `BottomSheet` — the Universal one
 * renders children as SwiftUI/Compose views, so our rich RN modal content
 * (`View`/`Text`/`Pressable`/`ScrollView`/`TextInput`) would not render there.
 * (AC 2 explicitly permits choosing community over Universal at Step E; the
 * rationale is recorded in architecture.md § "UI primitives — build vs adopt".)
 *
 * Exposes a stable declarative consumer API — `<BottomSheet open onClose>` —
 * driven onto the community sheet's controlled `index` prop (`open ? 0 : -1`).
 * The community sheet supplies its own scrim/backdrop intrinsically (AC 6), so
 * migrated Modal sites delete their manual `<View rgba(0,0,0,0.5)>` scrims.
 *
 * `backdropDismissable` (default `true`) maps to `enablePanDownToClose` — on
 * iOS this is both swipe-down AND backdrop-tap (SwiftUI couples them); set
 * `false` to gate a destructive mid-flow sheet (unsaved changes / pending save).
 * Every consumer also wires an explicit close affordance — never swipe-only
 * (web + Android edge cases; STACK-CHEAT-SHEET.md § Don't / RN).
 *
 * WIDE LAYOUTS (iPad / Android tablet / wide web) → a centered, content-hugging
 * DIALOG CARD instead of the native bottom sheet. The native sheet is
 * iPhone-tuned: on a wide/tall screen it does NOT hug content, so short sheets
 * balloon to full height (dead space) and a fixed `snapPoints` detent (e.g. 75%
 * of a tall iPad) pushes a footer out of the laid-out area. A bottom-anchored
 * full-width sheet also reads poorly past tablet widths. The dialog card hugs
 * content, caps its width, and centers — the conventional wide-layout treatment.
 * Phones (< breakpoint) are byte-identical to before. One switch here fixes
 * every consumer (overflow menu, section picker, note editor, delete dialog,
 * audio gate) on all three form factors.
 *
 * Source: STACK-CHEAT-SHEET.md § "Embrace native chrome" (BottomSheet is canonical).
 */

import ExpoBottomSheet, {
  BottomSheetView,
  type BottomSheetProps as ExpoBottomSheetProps,
} from '@expo/ui/community/bottom-sheet';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';

import { useThemedStyles } from '@/lib/useThemedStyles';
import { SheetHeader } from './SheetHeader';

/**
 * At/above this width, sheets present as a centered dialog card (see file header).
 * 768 is the conventional tablet breakpoint — it also catches wide web and
 * large-phone landscape, which benefit from the same treatment. Below it, the
 * native bottom sheet is unchanged.
 */
const WIDE_SHEET_BREAKPOINT = 768;

export interface BottomSheetProps {
  /** Whether the sheet is presented. */
  open: boolean;
  /** Called when the sheet is dismissed (swipe / backdrop tap / programmatic close). */
  onClose: () => void;
  /**
   * Opt-in header title (Story 23.22). When set, the wrapper renders a unified
   * `SheetHeader` (title + optional actions + close × + hairline separator) as a
   * fixed row ABOVE `children`, so titled sheets get a correct header by
   * construction. Omit for headerless sheets (overflow menus, promos) — the
   * render path is then byte-identical to before. SCOPE: titled list/action/form
   * sheets only, NOT centered promos or drag-handle menus.
   */
  title?: string;
  /** Header trailing action (e.g. a neutral create `+`); only used when `title` is set. */
  headerTrailingAction?: ReactNode;
  /** Header leading action; only used when `title` is set. */
  headerLeadingAction?: ReactNode;
  /** Show the header close × (calls `onClose`). @default true (only when `title` is set) */
  showClose?: boolean;
  /** testID forwarded to the header close × so consumers keep their close testID. */
  closeTestID?: string;
  /**
   * Heights the sheet can rest at — pixel numbers or percentage strings
   * (e.g. `['90%']`). Omit to auto-size to content (the common case).
   * @remarks Android supports only 2 states (partial / expanded). Ignored on
   * wide layouts (the dialog card hugs content up to its max height).
   */
  snapPoints?: (string | number)[];
  /**
   * Whether swipe-down + backdrop-tap dismiss the sheet.
   * @default true — set `false` to gate a destructive mid-flow.
   */
  backdropDismissable?: boolean;
  /** Show the drag indicator handle. @default true */
  dragIndicator?: boolean;
  /** Style for the inner content container (`BottomSheetView`). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Background style for the sheet surface (e.g. themed `backgroundColor`). */
  backgroundStyle?: ExpoBottomSheetProps['backgroundStyle'];
  testID?: string;
  children?: React.ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  snapPoints,
  backdropDismissable = true,
  dragIndicator = true,
  contentContainerStyle,
  backgroundStyle,
  title,
  headerTrailingAction,
  headerLeadingAction,
  showClose = true,
  closeTestID,
  testID,
  children,
}: BottomSheetProps) {
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const themed = useThemedStyles((t) => ({
    scrim: { backgroundColor: t.colors.overlay.dark },
    card: { backgroundColor: t.colors.background.primary },
  }));
  const isWide = width >= WIDE_SHEET_BREAKPOINT;

  // Mirror the RN `<Modal visible={false}>` contract the migrated sites relied
  // on: render nothing when closed. The underlying community sheet keeps its
  // children mounted at `index={-1}`, which would (a) paint hidden content and
  // (b) break the migrated sites' "no content when closed" tests. Gate here so
  // every consumer inherits the contract uniformly (no per-site guard needed).
  if (!open) return null;

  // Story 23.22: a `title` opts the sheet into the unified header. The header is
  // a fixed (non-scrolling) row inside the sheet surface, ABOVE the body.
  const hasHeader = !!title;

  // Wide layouts (iPad / Android tablet / wide web): centered content-hugging
  // dialog card. See the file header for why the native sheet is bypassed here.
  if (isWide) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <Pressable
          style={[styles.scrim, themed.scrim]}
          onPress={backdropDismissable ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel={t('a11y:close')}
        >
          {/* Inner Pressable swallows taps so pressing the card never dismisses. */}
          <Pressable
            style={[styles.card, themed.card, backgroundStyle]}
            onPress={() => {}}
            testID={testID}
            accessibilityViewIsModal
          >
            {hasHeader && (
              <SheetHeader
                title={title}
                trailingAction={headerTrailingAction}
                leadingAction={headerLeadingAction}
                showClose={showClose}
                onClose={onClose}
                closeTestID={closeTestID}
              />
            )}
            <View style={[styles.cardBody, contentContainerStyle]}>{children}</View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Narrow (phones): native bottom sheet. With percentage `snapPoints` the body
  // takes `flex:1` to fill the bounded detent below the header. Auto-sized sheets
  // (no `snapPoints` — the form modals) must NOT get `flex:1`: a flex child in a
  // content-MEASURED (unbounded) host collapses/balloons (the Thread-H3 class
  // documented below), so the body just shrink-wraps to content there. An
  // empty-string `title` is treated as headerless. When `title` is omitted the
  // render path is byte-identical to before — overflow menus, promos, and the
  // SignUpPrompt sheet variant is unaffected.
  return (
    <ExpoBottomSheet
      index={0}
      snapPoints={snapPoints}
      onClose={onClose}
      enablePanDownToClose={backdropDismissable}
      handleComponent={dragIndicator ? undefined : null}
      backgroundStyle={backgroundStyle}
    >
      {/* The community sheet has no `testID` prop — surface it on an inner View
          so consumer/test queries can still find the sheet body. That inner View
          MUST carry `contentContainerStyle` (not the outer BottomSheetView), or it
          becomes an unstyled shrink-wrap box BETWEEN the styled host and the
          content — collapsing percentage/flex children (`width:'100%'`, `flex:1`)
          to 0 width while fixed-size icons still render. That was the Story 17.4.2
          Thread H3 bug: SignUpPrompt sheet benefit labels invisible (icons showed), a
          cross-platform regression from the Modal→BottomSheet migration. Keep the
          no-testID path styling the host directly (unchanged). */}
      <BottomSheetView style={testID ? undefined : contentContainerStyle}>
        {hasHeader && (
          <SheetHeader
            title={title}
            trailingAction={headerTrailingAction}
            leadingAction={headerLeadingAction}
            showClose={showClose}
            onClose={onClose}
            closeTestID={closeTestID}
          />
        )}
        {testID ? (
          <View
            testID={testID}
            style={
              hasHeader && snapPoints ? [styles.body, contentContainerStyle] : contentContainerStyle
            }
          >
            {children}
          </View>
        ) : hasHeader && snapPoints ? (
          // No testID, but a titled sheet in a bounded detent still needs the body to fill
          // below the fixed header (contentContainerStyle is already on the host above).
          <View style={styles.body}>{children}</View>
        ) : (
          children
        )}
      </BottomSheetView>
    </ExpoBottomSheet>
  );
}

const styles = StyleSheet.create({
  // Fills the bounded detent below the fixed header — ONLY applied when
  // `snapPoints` is set (auto-sized sheets shrink-wrap; see hasHeader note).
  body: { flex: 1 },
  // Wide-layout dialog: centered scrim + content-hugging capped card (colors come
  // from the themed factory above — geometry only here).
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  // Shrink-wraps to content but respects the card's maxHeight (children own their
  // internal scroll/footer — e.g. SectionPicker's ScrollView + Apply footer).
  cardBody: { flexShrink: 1, minHeight: 0 },
});
