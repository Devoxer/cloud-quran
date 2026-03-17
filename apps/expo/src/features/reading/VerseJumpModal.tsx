import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface VerseJumpModalProps {
  visible: boolean;
  verseCount: number;
  onJump: (verseNumber: number) => void;
  onClose: () => void;
}

export function VerseJumpModal({ visible, verseCount, onJump, onClose }: VerseJumpModalProps) {
  const { tokens } = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(() => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > verseCount) {
      setError(`Enter a number between 1 and ${verseCount}`);
      return;
    }
    setError('');
    setValue('');
    onJump(num);
  }, [value, verseCount, onJump]);

  const handleClose = useCallback(() => {
    setError('');
    setValue('');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: tokens.surface.secondary, borderColor: tokens.border },
          ]}
          onPress={() => {}}
        >
          <AppText variant="ui" style={[styles.title, { color: tokens.text.ui }]}>
            Go to verse
          </AppText>
          <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
            {`1\u2013${verseCount}`}
          </AppText>
          <TextInput
            style={[
              styles.input,
              {
                color: tokens.text.quran,
                borderColor: error ? tokens.status.error : tokens.border,
                backgroundColor: tokens.surface.primary,
              },
            ]}
            keyboardType="number-pad"
            autoFocus
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setError('');
            }}
            onSubmitEditing={handleSubmit}
            placeholder={`1\u2013${verseCount}`}
            placeholderTextColor={tokens.text.ui}
            accessibilityLabel="Verse number"
          />
          {error ? (
            <AppText variant="uiCaption" style={{ color: tokens.status.error }}>
              {error}
            </AppText>
          ) : null}
          <View style={styles.buttons}>
            <Pressable
              onPress={handleClose}
              style={[styles.button, { borderColor: tokens.border }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <AppText variant="ui" style={{ color: tokens.text.ui }}>
                Cancel
              </AppText>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={[styles.button, styles.submitButton, { backgroundColor: tokens.accent.audio }]}
              accessibilityRole="button"
              accessibilityLabel="Go to verse"
            >
              <AppText variant="ui" style={{ color: tokens.surface.primary }}>
                Go
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    borderRadius: 12,
    padding: spacing.xl,
    minWidth: 260,
    borderWidth: 1,
    alignItems: 'center',
  },
  title: {
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 18,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  submitButton: {
    borderWidth: 0,
  },
});
