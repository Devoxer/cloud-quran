/**
 * HeaderActions — the canonical row wrapper for grouping multiple `HeaderActionButton`s in one
 * of `AppHeader`'s slots (story 6-6: the app's only header is our own; a native `headerRight`
 * exists nowhere and its name is a reserved word here). One gap constant (`HEADER_ACTION_GAP`)
 * so every multi-action header is spaced identically. Single-action slots don't need this —
 * render the bare `HeaderActionButton` directly.
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
