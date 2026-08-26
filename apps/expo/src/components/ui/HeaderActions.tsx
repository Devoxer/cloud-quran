/**
 * HeaderActions — the canonical row wrapper for grouping multiple
 * `HeaderActionButton`s in a native Stack `headerRight`. One gap constant
 * (`HEADER_ACTION_GAP`) so every multi-action header is spaced identically; on
 * iOS 26 the system draws a single Liquid Glass capsule around the grouped
 * items. Single-action headers don't need this — render the bare
 * `HeaderActionButton` directly.
 *
 * Used by the dual-action headers (book detail, collection detail, filters, feed)
 * so the row style isn't redefined per screen.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { HEADER_ACTION_GAP } from '@/constants/navigation';

export interface HeaderActionsProps {
  children: ReactNode;
}

export function HeaderActions({ children }: HeaderActionsProps) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER_ACTION_GAP,
  },
});
