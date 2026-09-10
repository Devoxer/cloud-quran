/**
 * ReciterSheet — the 39-voice catalogue in a bottom sheet, opened from the chrome's player row
 * (story 7-8).
 *
 * ⚠️ IT IS A WRAPPER AND NOTHING ELSE — THE LIST IS NOT FORKED. `ReciterPicker` was built by
 * story 7-2 to render no header of its own, precisely so a second host could mount it; a copy of
 * the grouped, searchable, 39-row list would be a second place for the same-value guard and the
 * NFD folding to drift. Settings keeps `(tabs)/(profile)/recitation.tsx` as the discoverable
 * path; this is the one that costs no trip.
 *
 * ⚠️ A CHOICE DOES NOT CLOSE THE SHEET, and that is `ReciterPicker`'s own documented behaviour
 * rather than an omission here: choosing a voice mid-listen re-plays the current ayah in it, so
 * the reader is one tap from hearing the difference and another from trying the next one. The
 * explicit close is the sheet header's ×.
 *
 * ── ⚠️ THE LIST NEEDS A BOUNDED BOX, AND `snapPoints` ALONE DOES NOT GIVE IT ONE ──────────────
 *
 * `ReciterPicker`'s root is `flex: 1` around a `FlashList`, so it needs a host with a real
 * height; a content-MEASURED (unbounded) host collapses or balloons it — the Thread-H3 class
 * `BottomSheet.tsx` documents from story 17.4.2.
 *
 * ⚠️ AND `snapPoints` IS IGNORED ON WIDE LAYOUTS. At ≥768pt `BottomSheet` bypasses the native
 * sheet entirely for a centered dialog card whose body is `{ flexShrink: 1, minHeight: 0 }` —
 * exactly the unbounded host above. So the detent covers phones and nothing else, and iPad,
 * Android tablet and wide web would have shipped on an argument that does not hold there. The
 * explicit height below is what makes the claim true on every form factor; the detent stays,
 * because on a phone it is what decides how much of the app the sheet covers.
 */

import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { BottomSheet } from '@/components/ui';
import { ReciterPicker } from './ReciterPicker';

/** Tall enough to show both a style heading and several voices without covering the whole app. */
const SHEET_SNAP_POINTS = ['70%'];

/**
 * The list's own box, as a fraction of the window and capped in points.
 *
 * ⚠️ COMFORTABLY UNDER THE 70% DETENT, because the detent has to hold this PLUS the sheet header
 * and the drag handle. A height that matched the detent would push the last rows out of the
 * laid-out area on a phone — the failure `BottomSheet`'s own docblock records for a fixed detent
 * on a tall screen.
 */
const SHEET_BODY_RATIO = 0.6;
const SHEET_BODY_MAX = 560;

export interface ReciterSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ReciterSheet({ open, onClose }: ReciterSheetProps) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  // Geometry, not theme, so it lives inline (`lint:style` scan 3 targets theme tokens).
  const bodyStyle = { height: Math.min(height * SHEET_BODY_RATIO, SHEET_BODY_MAX) };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('player:reciters.sheetTitle')}
      snapPoints={SHEET_SNAP_POINTS}
      closeTestID="reciter-sheet-close"
      testID="reciter-sheet"
    >
      <View style={bodyStyle} testID="reciter-sheet-body">
        <ReciterPicker />
      </View>
    </BottomSheet>
  );
}
