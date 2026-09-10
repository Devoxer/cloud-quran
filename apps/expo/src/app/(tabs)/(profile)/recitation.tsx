/**
 * Recitation — the reciter picker's route (story 7-2), plus the playback options (story 7-4).
 *
 * Thin by design: the screen is `features/audio`'s own components, and the header comes from
 * the `(profile)` layout's `TITLE_KEYS` (`titles.recitation`). A leaf with no entry there
 * silently renders the Account title, which is why the key is added in the same change.
 *
 * ⚠️ THE PLAYBACK OPTIONS ARE HERE BECAUSE THE SHEET IS NOT ENOUGH (story 7-4 review, P9). The
 * chrome's sheet opens from the MINI PLAYER, which only draws with a track loaded — so speed and
 * the sleep timer were unreachable until something was already playing, while the whole argument
 * for persisting the rate is that it is "still 1.5 before the first press". A reader could not
 * express that. This is the discoverable path, exactly as it is for the reciter; the sheet stays
 * the one that costs no trip.
 *
 * ⚠️ THE ORDER IS OPTIONS FIRST, PICKER SECOND, because `ReciterPicker` is a `flex: 1` FlashList
 * of 39 rows and would eat anything placed after it.
 */

import { ScrollView, View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { PlaybackOptions, ReciterPicker } from '@/features/audio';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** How much of the screen the 39-row picker keeps for itself below the options block. */
const PICKER_MIN_HEIGHT = 320;

export default function RecitationScreen() {
  const styles = useStyles();
  return (
    <ScrollView contentContainerStyle={styles.content} testID="recitation-screen">
      <View style={styles.options}>
        <PlaybackOptions testIDPrefix="settings-playback-options" />
      </View>
      <View style={styles.picker}>
        <ReciterPicker />
      </View>
    </ScrollView>
  );
}

const useStyles = () =>
  useThemedStyles(() => ({
    content: {
      flexGrow: 1,
    },
    options: {
      paddingTop: SPACING.md,
    },
    // Geometry, not theme: the picker needs a real height (`ReciterSheet`'s Thread-H3 lesson).
    picker: {
      flex: 1,
      minHeight: PICKER_MIN_HEIGHT,
    },
  }));
