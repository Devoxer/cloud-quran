import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const MENU_WIDTH = 200;

export interface VerseContextMenuProps {
  visible: boolean;
  surahNumber: number;
  verseNumber: number;
  position: { x: number; y: number };
  isBookmarked: boolean;
  onPlayFromHere: () => void;
  onTafsir: () => void;
  onBookmark: () => void;
  onCopy: () => void;
  onDismiss: () => void;
}

interface MenuAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function VerseContextMenu({
  visible,
  surahNumber,
  verseNumber,
  position,
  isBookmarked,
  onPlayFromHere,
  onTafsir,
  onBookmark,
  onCopy,
  onDismiss,
}: VerseContextMenuProps) {
  const { tokens } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  if (!visible) return null;

  const actions: MenuAction[] = [
    { key: 'play', label: 'Play from here', icon: 'play-circle-outline', onPress: onPlayFromHere },
    { key: 'tafsir', label: 'Tafsir', icon: 'book-outline', onPress: onTafsir },
    {
      key: 'bookmark',
      label: isBookmarked ? 'Remove bookmark' : 'Bookmark',
      icon: isBookmarked ? 'bookmark' : 'bookmark-outline',
      onPress: onBookmark,
    },
    { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: onCopy },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View
          style={[
            styles.menu,
            {
              backgroundColor: tokens.surface.secondary,
              borderColor: tokens.border,
              top: Math.max(60, Math.min(position.y - 160, screenHeight - 250)),
              left: Math.max(16, Math.min(position.x - MENU_WIDTH / 2, screenWidth - MENU_WIDTH - 16)),
            },
          ]}
          accessibilityLabel={`Context menu for verse ${surahNumber}:${verseNumber}`}
          accessibilityRole="menu"
        >
          {actions.map((action) => (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: tokens.surface.primary },
              ]}
              onPress={() => {
                action.onPress();
                onDismiss();
              }}
              accessibilityRole="menuitem"
              accessibilityLabel={action.label}
            >
              <Ionicons name={action.icon} size={20} color={tokens.text.ui} />
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                {action.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
