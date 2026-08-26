/**
 * Semantic icon registry — the one-file source of truth mapping every
 * in-content icon the app uses to its per-platform native symbol.
 *
 * Story 17.4.2 Thread E: the app's in-content iconography moved onto a per-platform
 * native-icon model. Story 28.2 (follow-up): the Android + Web renderer moved from
 * `expo-symbols`' Material Symbols to **Ionicons** (`@expo/vector-icons`), because
 * Material Symbols express fill as a font AXIS that neither expo-symbols nor the
 * bundled outline-only font exposes on Android/web — so filled glyphs (favorited
 * heart, saved bookmark, …) rendered as outlines there. Ionicons ships genuine,
 * distinct filled + outline glyphs, so the two platforms now render:
 *   • iOS  → SF Symbols via `expo-symbols` (`Icon.ios.tsx`), using `sf`.
 *   • Android + Web → Ionicons (`Icon.tsx`), using `ion`.
 *
 * Keys are SEMANTIC names kept identical to the Ionicons names — so 87/98 have
 * `ion` === the key; the rest carry an explicit `ion` (e.g. `view-agenda` →
 * `albums-outline`). `sf` is typed `SFSymbol` and `ion` is typed against the
 * Ionicons glyph union (via a type-only `import(...)`, so the iOS bundle is NOT
 * pulled through this file) — tsc REJECTS a non-existent SF or Ionicons name, so
 * the registry can't ship a typo that renders blank. (Icon.test asserts non-empty.)
 *
 * Brand logos (`logo-apple`, `logo-google`) are intentionally ABSENT — they render
 * via the Ionicons brand logos directly (see architecture.md § "UI primitives — build vs adopt").
 */

import type { SFSymbol } from 'expo-symbols';
import type { ComponentProps } from 'react';

/** Valid Ionicons glyph name — validated by tsc with NO runtime import (`typeof import`). */
type IoniconName = ComponentProps<typeof import('@expo/vector-icons/Ionicons').default>['name'];

export interface IconMapping {
  /** SF Symbol name (iOS). Validated against the `SFSymbol` union by tsc. */
  sf: SFSymbol;
  /** Ionicons glyph name (Android + Web). Validated against the Ionicons union by tsc. */
  ion: IoniconName;
}

/**
 * Single source of truth for in-content icon names.
 *
 * To add an icon: add one entry here (tsc validates both names) and use
 * `<Icon name="…" />`. Filled vs. outline are DISTINCT Ionicons glyphs
 * (`heart` vs `heart-outline`) — that's the whole point of the move — paired
 * with the closest SF variant (`heart.fill` vs `heart`).
 */
export const ICON_REGISTRY = {
  // ── actions ──
  add: { sf: 'plus', ion: 'add' },
  'add-circle-outline': { sf: 'plus.circle', ion: 'add-circle-outline' },
  remove: { sf: 'minus', ion: 'remove' },
  close: { sf: 'xmark', ion: 'close' },
  'close-circle': { sf: 'xmark.circle.fill', ion: 'close-circle' },
  refresh: { sf: 'arrow.clockwise', ion: 'refresh' },
  search: { sf: 'magnifyingglass', ion: 'search' },
  'search-outline': { sf: 'magnifyingglass', ion: 'search-outline' },
  // `line.3.horizontal.decrease[.circle]` rendered as the SF missing-glyph
  // placeholder square on-device — `slider.horizontal.3` is the reliable
  // filter/adjust glyph (renders like every other migrated icon). Story 17.4.2.
  filter: { sf: 'slider.horizontal.3', ion: 'filter' },
  'options-outline': { sf: 'slider.horizontal.3', ion: 'options-outline' },
  'create-outline': { sf: 'square.and.pencil', ion: 'create-outline' },
  // Round-framed variant (Story 26.12) — for the book-detail action row where every glyph shares
  // a `.circle` frame (Quiz/Note/Save/Download) for visual symmetry.
  'pencil-circle-outline': { sf: 'pencil.circle', ion: 'create-outline' },
  'pencil-outline': { sf: 'pencil', ion: 'pencil-outline' },
  'rename-box-outline': { sf: 'character.cursor.ibeam', ion: 'create-outline' },
  'trash-outline': { sf: 'trash', ion: 'trash-outline' },
  'open-outline': { sf: 'arrow.up.right.square', ion: 'open-outline' },
  'ellipsis-horizontal': { sf: 'ellipsis', ion: 'ellipsis-horizontal' },
  'share-outline': { sf: 'square.and.arrow.up', ion: 'share-outline' },
  'settings-outline': { sf: 'gearshape', ion: 'settings-outline' },

  // ── navigation / chevrons / arrows ──
  'arrow-back': { sf: 'arrow.left', ion: 'arrow-back' },
  'arrow-forward': { sf: 'arrow.right', ion: 'arrow-forward' },
  'chevron-back': { sf: 'chevron.backward', ion: 'chevron-back' },
  'chevron-forward': { sf: 'chevron.forward', ion: 'chevron-forward' },
  'chevron-up': { sf: 'chevron.up', ion: 'chevron-up' },
  'chevron-down': { sf: 'chevron.down', ion: 'chevron-down' },
  'keyboard-double-arrow-down': { sf: 'chevron.down.2', ion: 'chevron-down' },

  // ── status / feedback ──
  checkmark: { sf: 'checkmark', ion: 'checkmark' },
  reset: { sf: 'arrow.counterclockwise', ion: 'refresh' },
  'checkmark-circle': { sf: 'checkmark.circle.fill', ion: 'checkmark-circle' },
  'checkmark-done-outline': { sf: 'checkmark.circle', ion: 'checkmark-done-outline' },
  'alert-circle': { sf: 'exclamationmark.circle.fill', ion: 'alert-circle' },
  'alert-circle-outline': { sf: 'exclamationmark.circle', ion: 'alert-circle-outline' },
  'information-circle-outline': { sf: 'info.circle', ion: 'information-circle-outline' },
  'warning-outline': { sf: 'exclamationmark.triangle', ion: 'warning-outline' },
  warning: { sf: 'exclamationmark.triangle.fill', ion: 'warning' },
  'help-circle-outline': { sf: 'questionmark.circle', ion: 'help-circle-outline' },
  'shield-checkmark-outline': { sf: 'checkmark.shield', ion: 'shield-checkmark-outline' },
  'lock-closed': { sf: 'lock.fill', ion: 'lock-closed' },
  'lock-closed-outline': { sf: 'lock', ion: 'lock-closed-outline' },
  // Story 20.3, collapsed by 20.6: the Profile → PREFERENCES → Language row (ONE picker — the
  // app-language/content-language split is gone).
  'globe-outline': { sf: 'globe', ion: 'globe-outline' },

  // ── content / library ──
  'book-outline': { sf: 'book', ion: 'book-outline' },
  book: { sf: 'book.fill', ion: 'book' },
  'library-outline': { sf: 'books.vertical', ion: 'library-outline' },
  library: { sf: 'books.vertical.fill', ion: 'library' },
  'bookmark-outline': { sf: 'bookmark', ion: 'bookmark-outline' },
  // Round-framed variant (Story 26.12) — book-detail action-row symmetry (see pencil-circle-outline).
  'bookmark-circle-outline': { sf: 'bookmark.circle', ion: 'bookmark-outline' },
  'document-text-outline': { sf: 'doc.text', ion: 'document-text-outline' },
  'folder-outline': { sf: 'folder', ion: 'folder-outline' },
  'receipt-outline': { sf: 'doc.plaintext', ion: 'receipt-outline' },
  'musical-notes-outline': { sf: 'music.note', ion: 'musical-notes-outline' },
  'color-palette-outline': { sf: 'paintpalette', ion: 'color-palette-outline' },
  // Story 23.8: the App-Color (palette picker) row — a brush, distinct from the
  // paintpalette glyph the Appearance (light/dark) row uses just above it.
  'brush-outline': { sf: 'paintbrush', ion: 'brush-outline' },
  'format-color-text': { sf: 'textformat', ion: 'text-outline' },
  star: { sf: 'star.fill', ion: 'star' },
  // Story 28.1: quote favorite toggle — filled (favorited) + outline (not favorited).
  heart: { sf: 'heart.fill', ion: 'heart' },
  'heart-outline': { sf: 'heart', ion: 'heart-outline' },
  compass: { sf: 'safari', ion: 'compass' },
  // Story 23.9: the Your-Stats screen — streak flame + new-record trophy.
  flame: { sf: 'flame.fill', ion: 'flame' },
  trophy: { sf: 'trophy.fill', ion: 'trophy' },

  // ── playback ──
  play: { sf: 'play.fill', ion: 'play' },
  'play-circle': { sf: 'play.circle', ion: 'play-circle' },
  'play-circle-outline': { sf: 'play.circle', ion: 'play-circle-outline' },
  pause: { sf: 'pause.fill', ion: 'pause' },
  'play-skip-back': { sf: 'backward.end.fill', ion: 'play-skip-back' },
  'play-skip-forward': { sf: 'forward.end.fill', ion: 'play-skip-forward' },
  // Material Symbols has no `_15` seek variant (only _5/_10/_30); a numbered
  // `replay_10` reads "10" on a 15s button — actively wrong. Use the non-numbered
  // fast_rewind/fast_forward generics (the a11y label carries "15 seconds").
  // iOS SF Symbols DO have the .15 variant, so they stay accurate. (17.4.2 Step K.)
  'rewind-15': { sf: 'gobackward.15', ion: 'play-back' },
  'fast-forward-15': { sf: 'goforward.15', ion: 'play-forward' },
  repeat: { sf: 'repeat', ion: 'repeat' },
  'repeat-outline': { sf: 'repeat', ion: 'repeat-outline' },
  shuffle: { sf: 'shuffle', ion: 'shuffle' },
  'shuffle-outline': { sf: 'shuffle', ion: 'shuffle-outline' },
  'volume-high': { sf: 'speaker.wave.3.fill', ion: 'volume-high' },
  'volume-high-outline': { sf: 'speaker.wave.3', ion: 'volume-high-outline' },
  'volume-low': { sf: 'speaker.wave.1.fill', ion: 'volume-low' },
  headset: { sf: 'headphones', ion: 'headset' },
  'speedometer-outline': { sf: 'speedometer', ion: 'speedometer-outline' },
  'moon-outline': { sf: 'moon', ion: 'moon-outline' },

  // ── cloud / sync ──
  cloud: { sf: 'icloud', ion: 'cloud' },
  sync: { sf: 'arrow.triangle.2.circlepath', ion: 'sync' },
  // arrow.down.circle is optically centered (icloud.and.arrow.down is tall — its
  // cloud pushed the glyph above the sibling header actions). Story 17.4.2.
  'cloud-download-outline': { sf: 'arrow.down.circle', ion: 'cloud-download-outline' },
  'cloud-offline': { sf: 'icloud.slash.fill', ion: 'cloud-offline' },
  'cloud-offline-outline': { sf: 'icloud.slash', ion: 'cloud-offline-outline' },

  // ── people / account ──
  person: { sf: 'person', ion: 'person' },
  'person-add': { sf: 'person.badge.plus', ion: 'person-add' },
  'log-out': { sf: 'rectangle.portrait.and.arrow.right', ion: 'log-out' },
  'notifications-outline': { sf: 'bell', ion: 'notifications-outline' },
  'mail-outline': { sf: 'envelope', ion: 'mail-outline' },

  // ── misc ──
  'time-outline': { sf: 'clock', ion: 'time-outline' },
  'cash-outline': { sf: 'banknote', ion: 'cash-outline' },
  'chatbox-outline': { sf: 'bubble.left', ion: 'chatbox-outline' },
  'chatbubble-outline': { sf: 'bubble.left', ion: 'chatbubble-outline' },
  'bulb-outline': { sf: 'lightbulb', ion: 'bulb-outline' },
  'bug-outline': { sf: 'ladybug', ion: 'bug-outline' },
  'phone-portrait-outline': { sf: 'iphone', ion: 'phone-portrait-outline' },
  checkbox: { sf: 'checkmark.square.fill', ion: 'checkbox' },
  'square-outline': { sf: 'square', ion: 'square-outline' },

  // ── layout / view mode (Story 28.2 — BookViewModeToggle) ──
  // The three book-grid view modes (density ladder): `view-list` = dense compact rows;
  // `view-grid` = the 2-col cover grid; `view-agenda` = the single-column immersive hero rows.
  'view-list': { sf: 'list.bullet', ion: 'list' },
  'view-grid': { sf: 'square.grid.2x2', ion: 'grid' },
  'view-agenda': { sf: 'rectangle.grid.1x2', ion: 'albums-outline' },
} as const satisfies Record<string, IconMapping>;

/** Semantic icon-name union — the `name` prop of `<Icon>`. */
export type IconName = keyof typeof ICON_REGISTRY;
