/**
 * PlaybackOptionsSheet — `PlaybackOptions` in the chrome's second sheet (story 7-4).
 *
 * ⚠️ THE CONTROLS ARE NOT HERE. They are `PlaybackOptions`, because the same block also mounts on
 * the settings surface — see that file for why speed and the sleep timer cannot live only behind
 * a loaded track. This wrapper owns the SHEET: the title, the detent, and the bounded body.
 *
 * ⚠️ IT IS NOT MOUNTED BY THE ROW THAT OPENS IT. `ReadingChrome` owns it, outside both animated
 * bars — a sheet inside the footer inherits the reveal's opacity, so the 5-second dwell would
 * fade the reader's open sheet away mid-choice. `ReciterSheet` records the same rule.
 *
 * ⚠️ AND THE BODY CARRIES AN EXPLICIT BOUND, FOR `ReciterSheet`'s REASON — `snapPoints` IS
 * IGNORED AT ≥768pt, where `BottomSheet` renders a centered dialog card instead of the native
 * sheet. Here the content is intrinsically sized rather than a `flex: 1` list, so what the bound
 * buys is different: a MAXIMUM, so the sheet cannot grow past the detent on a phone, with the
 * content free to be shorter. Copy the shape; do not rediscover it.
 */

import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/ui';
import { PlaybackOptions } from './PlaybackOptions';

/** Tall enough for the speed control and both sleep rows without covering the whole app. */
const SHEET_SNAP_POINTS = ['58%'];
const SHEET_BODY_RATIO = 0.5;
const SHEET_BODY_MAX = 420;

/** The testID prefix the sheet's copy of the controls carries. Exported for its suite. */
export const SHEET_TEST_PREFIX = 'playback-options';

export interface PlaybackOptionsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function PlaybackOptionsSheet({ open, onClose }: PlaybackOptionsSheetProps) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  // Geometry, not theme, so it lives inline (`lint:style` scan 3 targets theme tokens).
  const boundStyle = { maxHeight: Math.min(height * SHEET_BODY_RATIO, SHEET_BODY_MAX) };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('player:options.sheetTitle')}
      snapPoints={SHEET_SNAP_POINTS}
      closeTestID="playback-options-close"
      testID="playback-options-sheet"
    >
      <View style={boundStyle} testID="playback-options-bound">
        <PlaybackOptions testIDPrefix={SHEET_TEST_PREFIX} />
      </View>
    </BottomSheet>
  );
}
