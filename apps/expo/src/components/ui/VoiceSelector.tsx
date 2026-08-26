/**
 * VoiceSelector — pick the narration voice (Story 22.12; language-scoped in Story 20.6).
 *
 * A segmented control over the SELECTED LANGUAGE's rolled-out voices, mirroring the
 * `SpeedSelector` idiom in the player's overflow menu. The voice axis is per-language since
 * Story 20.6 — there is no global flagship set — so this component reads the language preference
 * itself rather than taking it as a prop: both surfaces it renders on (Playback Settings and the
 * player's overflow menu) then track a language switch for free.
 *
 * The current voice + change handler are still passed in (the call site owns the
 * `useVoicePreference` state). With 2–3 voices a segmented control reads cleaner than a
 * slider/list; with exactly ONE the control is dropped and only the voice's name is shown —
 * there is nothing to choose, and a one-segment control reads as broken.
 */

import { getVoicesForLanguage } from '@cloudquran/shared';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useLanguage } from '@/lib/language';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface VoiceSelectorProps {
  /** The currently selected voice id. */
  currentVoiceId: string;
  /** Called with the newly selected voice id. */
  onVoiceChange: (voiceId: string) => void;
  /** Whether the selector is disabled. */
  disabled?: boolean;
  /** Test ID for testing. */
  testID?: string;
}

export function VoiceSelector({
  currentVoiceId,
  onVoiceChange,
  disabled = false,
  testID,
}: VoiceSelectorProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const styles = useThemedStyles((t) => ({
    container: {
      width: '100%',
      alignItems: 'center',
    },
    label: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      marginBottom: SPACING.sm,
      color: t.colors.text.primary,
    },
    control: {
      width: '100%',
    },
  }));

  const voices = getVoicesForLanguage(language);
  // A language with no rolled-out voice has no voice UI to render at all (its sections resolve
  // through the whole-section `en` fallback, which the listener does not choose).
  if (voices.length === 0) return null;

  const voiceIds = voices.map((v) => v.id);
  const voiceNames = voices.map((v) => v.name);
  // Clamp to a valid index — a stored voice from ANOTHER language (or a retired one) shows this
  // language's default, exactly as `getVoicePreference` resolves it.
  const selectedIndex = Math.max(0, voiceIds.indexOf(currentVoiceId));

  return (
    <View style={styles.container} testID={testID}>
      <Text
        style={styles.label}
        accessibilityLabel={t('a11y:narrationVoice', { voice: voiceNames[selectedIndex] })}
      >
        {voiceNames[selectedIndex]}
      </Text>
      {voices.length > 1 && (
        <SegmentedControl
          values={voiceNames}
          selectedIndex={selectedIndex}
          enabled={!disabled}
          onChange={(e) => {
            const id = voiceIds[e.nativeEvent.selectedSegmentIndex];
            if (id) onVoiceChange(id);
          }}
          style={styles.control}
          testID={testID ? `${testID}-control` : undefined}
        />
      )}
    </View>
  );
}
