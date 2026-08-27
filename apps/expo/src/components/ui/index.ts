/**
 * UI Components — design-system primitives.
 *
 * The public surface other layers consume (Story 16.6 AC #14). Import from
 * `@/components/ui` rather than reaching into individual files.
 */

// ── Story 6-6: THE header and tab bar — custom chrome, every platform ──
export { AppHeader, type AppHeaderProps } from './AppHeader';
export { AppTabBar, TAB_INDICATOR_ALPHA } from './AppTabBar';
// ── Story 16.8: relocated generic primitives + ownerless shared + themed primitives ──
export * from './Avatar';
// ── Story 31.1: the single book-cover rendering primitive (WebP-preferred + blurhash) ──
export { BookCover, type BookCoverProps, type BookCoverSource } from './BookCover';
// ── Story 17.4: BottomSheet + native Dialog + GlassBackdrop ──
export { BottomSheet, type BottomSheetProps } from './BottomSheet';
// ── Story 23.2: settings/forms primitives (Card + SettingsGroup + SettingsRow) ──
export { Card, type CardProps } from './Card';
export * from './Chip';
export * from './ChipList';
export { CodeInput } from './CodeInput';
export { CompactModeToggle } from './CompactModeToggle';
export { ConfirmDialog } from './ConfirmDialog';
// ── Story 34-boundary: max-width layout wrapper (moved from the removed components/layout/ bucket) ──
export { ContentContainer } from './ContentContainer';
export { Dialog, type DialogProps } from './Dialog';
export * from './DurationBadge';
// ── Story 19.5: hours+minutes duration wheel (sleep-timer picker) ──
export { DurationPicker, type DurationPickerProps } from './DurationPicker';
export { EmptyState } from './EmptyState';
export { ErrorBoundary } from './ErrorBoundary';
// ── Story 23.6: full-screen / section error-takeover primitive (4th async state) ──
export { ErrorView, type ErrorViewProps } from './ErrorView';
// ── Story 30.1: shared icon-only heart toggle (browse/hero/favorites rows) ──
export { FavoriteButton, type FavoriteButtonProps } from './FavoriteButton';
export * from './FilterPills';
export { GlassBackdrop, type GlassBackdropProps } from './GlassBackdrop';
// ── Story 23.9: soft edgeless radial glow (svg) ──
export { Glow, type GlowProps } from './Glow';
export { GoogleGLogo } from './GoogleGLogo';
export { HeaderActionButton, type HeaderActionButtonProps } from './HeaderActionButton';
export { HeaderActions, type HeaderActionsProps } from './HeaderActions';
// ── Story 17.3: @expo/ui wrapper layer (Universal + community drop-ins) ──
export { Host, type HostProps } from './Host';
// ── Story 17.4.2: central icon primitive (expo-symbols SF/Material) ──
export { Icon, type IconProps } from './Icon';
// ── Story 17.13: inline error message (replaces error toasts) ──
export { InlineError, type InlineErrorProps } from './InlineError';
export { ICON_REGISTRY, type IconMapping, type IconName } from './icon-registry';
// ── Story 23.12: tap-empty-space keyboard dismiss (react-native-keyboard-controller) ──
export { KeyboardDismissView, type KeyboardDismissViewProps } from './KeyboardDismissView';
// ── Story 23.4: generic (non-book) list row primitive ──
export { ListRow, type ListRowProps } from './ListRow';
// ── Story 17.13: single go-forward loading primitive (replaces Skeleton) ──
export { LoadingView, type LoadingViewProps } from './LoadingView';
export { OfflineLimitModal } from './OfflineLimitModal';
export { PlayButton } from './PlayButton';
export { ProgressBar } from './ProgressBar';
export { RemoveOfflineDialog } from './RemoveOfflineDialog';
// ── Story 23.13: shared neutral in-row delete `×` affordance ──
export { RowDeleteButton, type RowDeleteButtonProps } from './RowDeleteButton';
// ── Story 23.4: shared inter-row hairline for bare BookCard-`row` lists ──
export { BOOK_ROW_INSET, RowSeparator, type RowSeparatorProps } from './RowSeparator';
export * from './SearchBar';
export { SearchEntryButton, type SearchEntryButtonProps } from './SearchEntryButton';
export { SectionHeader } from './SectionHeader';
// ── Story 23.11: shared per-variant faux-shape skeleton (gated preview + section cold-load) ──
export { SectionSkeleton, type SectionSkeletonVariant } from './SectionSkeleton';
// ── Story 28.2: custom accent-filled segmented control (replaced the @expo/ui community wrapper) ──
export { SegmentedControl, type SegmentedControlProps } from './SegmentedControl';
export { SettingsGroup, type SettingsGroupProps } from './SettingsGroup';
export {
  SettingsRow,
  type SettingsRowProps,
  type SettingsRowTrailing,
} from './SettingsRow';
// ── Story 23.22: unified bottom-sheet header (normally via BottomSheet `title`) ──
export { SheetHeader, type SheetHeaderProps } from './SheetHeader';
export { Slider, type SliderProps } from './Slider';
export { SpeedSelector } from './SpeedSelector';
// ── Story 25.5: shared summary-strip cell (Profile hero + Quizzes hub) ──
export { StatStripCell, type StatStripCellProps } from './StatStripCell';
export { Switch, type SwitchProps } from './Switch';
export * from './Themed';
// ── Story 18.8: community datetime-picker drop-in (configurable reminder time) ──
export { TimePicker, type TimePickerProps } from './TimePicker';
export { VoiceSelector, type VoiceSelectorProps } from './VoiceSelector';
