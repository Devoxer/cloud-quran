import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import type { SurahMetadata } from 'quran-data';
import { SURAH_METADATA } from 'quran-data';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

import { HizbList } from './HizbList';
import { JuzList } from './JuzList';
import { SurahRow } from './SurahRow';

const MAX_CONTENT_WIDTH = 680;

type Tab = 'surahs' | 'juz' | 'hizb';

function ItemSeparator() {
  const { tokens } = useTheme();
  return <View style={[styles.separator, { backgroundColor: tokens.border }]} />;
}

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { tokens } = useTheme();
  const tabs: { key: Tab; label: string }[] = [
    { key: 'surahs', label: 'Surahs' },
    { key: 'juz', label: "Juz'" },
    { key: 'hizb', label: 'Hizb' },
  ];

  return (
    <View style={[styles.tabBar, { borderBottomColor: tokens.border }]}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onTabChange(tab.key)}
          style={[
            styles.tab,
            activeTab === tab.key && [styles.activeTab, { borderBottomColor: tokens.text.quran }],
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab.key }}
          accessibilityLabel={tab.label}
        >
          <AppText
            variant="ui"
            style={[
              { color: tokens.text.ui },
              activeTab === tab.key && { color: tokens.text.quran, fontWeight: '600' },
            ]}
          >
            {tab.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

export function SurahIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigateToVerse = useUIStore((s) => s.navigateToVerse);
  const currentSurah = useUIStore((s) => s.currentSurah);
  const flashListRef = useRef<FlashListRef<SurahMetadata>>(null);
  const [activeTab, setActiveTab] = useState<Tab>('surahs');

  useEffect(() => {
    if (activeTab === 'surahs') {
      flashListRef.current?.scrollToIndex({
        index: currentSurah - 1,
        animated: false,
        viewPosition: 0.3,
      });
    }
  }, [currentSurah, activeTab]);

  const handleSurahPress = useCallback(
    (surahNumber: number) => {
      navigateToVerse(surahNumber, 1);
      router.navigate('/');
    },
    [navigateToVerse, router],
  );

  const keyExtractor = useCallback((item: SurahMetadata) => String(item.number), []);

  const renderItem = useCallback(
    ({ item }: { item: SurahMetadata }) => (
      <SurahRow surah={item} onPress={handleSurahPress} isSelected={item.number === currentSurah} />
    ),
    [handleSurahPress, currentSurah],
  );

  return (
    <Surface>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
      <View style={styles.listContainer}>
        {activeTab === 'surahs' && (
          <FlashList
            ref={flashListRef}
            data={SURAH_METADATA}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ItemSeparatorComponent={ItemSeparator}
            contentContainerStyle={styles.content}
          />
        )}
        {activeTab === 'juz' && <JuzList />}
        {activeTab === 'hizb' && <HizbList />}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  header: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  listContainer: {
    flex: 1,
  },
  content: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
});
