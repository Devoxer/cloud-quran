/**
 * CodeInput Component - 6-digit code input field with individual boxes
 *
 * Renders a series of digit boxes for entering verification codes.
 * Features auto-advance between digits and hidden TextInput for keyboard.
 *
 * @example
 * <CodeInput
 *   value={code}
 *   onChangeText={setCode}
 *   length={6}
 *   error={hasError}
 * />
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING, spacing } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** Code box dimensions */
const CODE_BOX_WIDTH = SPACING.xxxl; // 48px
const CODE_BOX_HEIGHT = spacing(14); // 56px

/** Delay before auto-focusing input (allows component to mount) */
const AUTO_FOCUS_DELAY_MS = 100;

export interface CodeInputProps {
  /** Current code value */
  value: string;
  /** Callback when code changes */
  onChangeText: (value: string) => void;
  /** Number of digits (default: 6) */
  length?: number;
  /** Whether to show error state */
  error?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
}

export function CodeInput({
  value,
  onChangeText,
  length = 6,
  error = false,
  disabled = false,
}: CodeInputProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((t) => ({
    container: {
      width: '100%',
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1,
    },
    boxContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    codeBox: {
      width: CODE_BOX_WIDTH,
      height: CODE_BOX_HEIGHT,
      borderWidth: 2,
      borderRadius: RADII.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.background.primary,
    },
    codeBoxError: {
      borderColor: t.colors.semantic.error,
    },
    codeBoxFocused: {
      borderColor: t.colors.accent.primary,
    },
    codeBoxDefault: {
      borderColor: t.colors.border,
    },
    codeDigit: {
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.primary,
    },
  }));
  const inputRef = useRef<TextInput>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (!disabled) {
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, AUTO_FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [disabled]);

  const handleChange = (text: string) => {
    // Only allow digits and limit to length
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChangeText(digits);
  };

  const handleBoxPress = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  return (
    <View style={styles.container} testID="code-input">
      {/* Hidden TextInput for keyboard input */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={!disabled}
        editable={!disabled}
        testID="code-input-hidden"
        accessibilityLabel={t('a11y:enterVerificationCode')}
      />

      {/* Visible digit boxes */}
      <Pressable style={styles.boxContainer} onPress={handleBoxPress} testID="code-boxes">
        {Array.from({ length }).map((_, index) => {
          const isFocused = index === value.length && !disabled;
          const hasValue = value[index] !== undefined;

          return (
            <View
              key={index}
              style={[
                styles.codeBox,
                error
                  ? styles.codeBoxError
                  : isFocused
                    ? styles.codeBoxFocused
                    : styles.codeBoxDefault,
              ]}
              testID={`code-box-${index}`}
            >
              <Text style={styles.codeDigit}>{hasValue ? value[index] : ''}</Text>
            </View>
          );
        })}
      </Pressable>
    </View>
  );
}
