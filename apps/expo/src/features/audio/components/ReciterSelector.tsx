import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { RECITERS, type Reciter } from '@/features/audio/data/reciters';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface ReciterSelectorProps {
  visible: boolean;
  onClose: () => void;
}

interface Section {
  title: string;
  data: Reciter[];
}

const ReciterRow = React.memo(function ReciterRow({
  reciter,
  isSelected,
  onSelect,
  accentColor,
  textColor,
  borderColor,
}: {
  reciter: Reciter;
  isSelected: boolean;
  onSelect: (id: string) => void;
  accentColor: string;
  textColor: string;
  borderColor: string;
}) {
  return (
    <Pressable
      onPress={() => onSelect(reciter.id)}
      style={[styles.row, { borderBottomColor: borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={`Select ${reciter.nameEnglish}`}
      accessibilityState={{ selected: isSelected }}
    >
      <View style={styles.rowText}>
        <AppText variant="ui" style={{ color: textColor }}>
          {reciter.nameArabic}
        </AppText>
        <AppText variant="uiCaption" style={{ color: textColor }}>
          {reciter.nameEnglish} · {reciter.style}
        </AppText>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={22} color={accentColor} />}
    </Pressable>
  );
});

export function ReciterSelector({ visible, onClose }: ReciterSelectorProps) {
  const selectedReciterId = useAudioStore((s) => s.selectedReciterId);
  const setReciter = useAudioStore((s) => s.setReciter);
  const { tokens } = useTheme();
  const [query, setQuery] = useState('');

  const sections: Section[] = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = RECITERS.filter(
      (r) => r.nameEnglish.toLowerCase().includes(q) || r.nameArabic.includes(query),
    );
    return [
      { title: 'Murattal', data: filtered.filter((r) => r.style === 'murattal') },
      { title: 'Mujawwad', data: filtered.filter((r) => r.style === 'mujawwad') },
      { title: 'Muallim', data: filtered.filter((r) => r.style === 'muallim') },
    ].filter((s) => s.data.length > 0);
  }, [query]);

  const handleSelect = useCallback(
    (id: string) => {
      setReciter(id);
      onClose();
    },
    [setReciter, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: Reciter }) => (
      <ReciterRow
        reciter={item}
        isSelected={item.id === selectedReciterId}
        onSelect={handleSelect}
        accentColor={tokens.accent.audio}
        textColor={tokens.text.ui}
        borderColor={tokens.border}
      />
    ),
    [selectedReciterId, handleSelect, tokens],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View style={[styles.sectionHeader, { backgroundColor: tokens.surface.primary }]}>
        <AppText variant="ui" style={{ color: tokens.text.quran, fontWeight: '600' }}>
          {section.title}
        </AppText>
      </View>
    ),
    [tokens],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: tokens.surface.primary, borderColor: tokens.border },
          ]}
        >
          <View style={styles.header}>
            <AppText variant="ui" style={{ color: tokens.text.quran, fontWeight: '600' }}>
              Select Reciter
            </AppText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close reciter selector"
            >
              <Ionicons name="close" size={24} color={tokens.text.ui} />
            </Pressable>
          </View>
          <TextInput
            style={[
              styles.searchInput,
              {
                color: tokens.text.ui,
                borderColor: tokens.border,
                backgroundColor: tokens.surface.secondary,
              },
            ]}
            placeholder="Search reciters..."
            placeholderTextColor={tokens.text.translation}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search reciters"
          />
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            style={styles.list}
            stickySectionHeadersEnabled={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  list: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
});
