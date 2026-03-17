import Ionicons from '@expo/vector-icons/Ionicons';

import { Tabs } from 'expo-router';
import { Modal, View } from 'react-native';

import { ExpandedAudioPlayer } from '@/features/audio/components/ExpandedAudioPlayer';
import { MiniPlayerBar } from '@/features/audio/components/MiniPlayerBar';
import { OfflineAudioToast } from '@/features/audio/components/OfflineAudioToast';
import { useTheme } from '@/theme/ThemeProvider';
import { useUIStore } from '@/theme/useUIStore';

export default function TabLayout() {
  const { tokens } = useTheme();
  const isChromeVisible = useUIStore((s) => s.isChromeVisible);
  const isExpandedPlayerVisible = useUIStore((s) => s.isExpandedPlayerVisible);
  const toggleExpandedPlayer = useUIStore((s) => s.toggleExpandedPlayer);
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: tokens.accent.audio,
          tabBarInactiveTintColor: tokens.text.ui,
          tabBarStyle: {
            backgroundColor: tokens.surface.secondary,
            borderTopColor: tokens.border,
            ...(route.name === 'index'
              ? {
                  position: 'absolute' as const,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  ...(isChromeVisible ? {} : { opacity: 0, pointerEvents: 'none' as const }),
                }
              : {}),
          },
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Reading',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="surahs"
          options={{
            title: 'Surahs',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="bookmarks"
          options={{
            title: 'Bookmarks',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bookmark-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <OfflineAudioToast />
      <MiniPlayerBar />
      <Modal
        visible={isExpandedPlayerVisible}
        animationType="slide"
        onRequestClose={toggleExpandedPlayer}
      >
        <View style={{ flex: 1, backgroundColor: tokens.surface.primary }}>
          <ExpandedAudioPlayer />
        </View>
      </Modal>
    </View>
  );
}
