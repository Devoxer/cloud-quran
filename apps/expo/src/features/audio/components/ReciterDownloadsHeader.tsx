/**
 * ReciterDownloadsHeader — one voice's bulk download state, as the surah list's header
 * (2026-09-11; the surviving half of story 7-5's `ReciterDownloads`).
 *
 * ⚠️ IT IS ONE ROW, NOT FOUR, AND THAT IS THE WHOLE POINT OF THE REWRITE. The block it replaces
 * drew "Download all surahs", "Stop downloading", "Retry failed" and "Remove all downloads" as
 * four `SettingsRow`s stacked over a progress panel that said the queue's size a second time —
 * on a screen whose list already carries a control per surah. The owner's verdict on
 * 2026-09-11: "the downloads UI is cluttered and redundant". What is left is a single state:
 *
 *   nothing running → ONE action row (download all, or only the rest), with what is kept as its
 *                     description; once every surah is kept the row stops being an action and
 *                     becomes a mark.
 *   running         → `DownloadProgress`, which carries the bar, the bytes AND the stop.
 *   failures        → an `InlineError` with the retry on it, because a failure is a message
 *                     with an action, not a menu item that is usually absent.
 *
 * ⚠️ REMOVE-ALL IS NOT HERE. It is the list's FOOTER, on the screen that owns the confirmation —
 * Apple's own placement for the irreversible end of a list (Settings → an app → Delete App), and
 * the one that stops a destructive control from sitting under the reader's thumb at the top of a
 * screen whose first action is "download". See `ReciterSurahDownloads`.
 *
 * ⚠️ THE ESTIMATE-THEN-CONFIRM GATE IS `useDownloadAllPrompt`, NOT CODE IN HERE. It moved when
 * the reciter picker's per-row control became a second caller (2026-09-11): the frozen criterion
 * is about ORDER — "an approximate total was shown BEFORE the confirmation" — and two inline
 * copies is how one of them quietly loses the free-space refusal or the metered wording. Its
 * docblock carries the reasoning for all of it.
 *
 * ⚠️ THE ACTION ROW HAS NO CHEVRON. `trailing="chevron"` promises a push, and this row opens a
 * confirmation in place; the only trailing affordance it takes is the spinner that says its
 * estimate is being computed.
 *
 * ⚠️ THE DISK IS READ ON A DEBOUNCE, NOT PER COMPLETED SURAH. `dir.size` is a recursive walk and
 * this block is mounted while a 114-file queue drains, so an effect keyed straight on the kept
 * count ran it 114 times on the JS thread. (Story 7-5 review, P13.)
 */

import { SURAH_COUNT } from 'quran-data';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog, InlineError, SettingsGroup, SettingsRow } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { formatBytes } from '@/lib/format';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useReciterDownloadSummary } from '@/stores/downloadQueueStore';
import { type DownloadAllRefusalKind, useDownloadAllPrompt } from '../hooks/useDownloadAllPrompt';
import {
  cancelReciterDownloads,
  hydrateDownloadState,
  reciterBytesOnDisk,
  retryFailedDownloads,
} from '../lib/audioDownloads';
import { DownloadProgress } from './DownloadProgress';

export interface ReciterDownloadsHeaderProps {
  /** The voice these downloads belong to — already resolved by the screen. */
  reciterId: string;
  /** The voice's name, for the stop control's spoken label. */
  reciterName: string;
  testIDPrefix: string;
}

/**
 * The testID suffix each refusal renders under — the two states are told apart by a test.
 *
 * Both are shown in the same inline error, under the row that was pressed, because both answer
 * the same question the reader just asked and neither is worth a modal.
 */
const REFUSAL_TEST_IDS: Record<DownloadAllRefusalKind, string> = {
  estimate: 'estimate-failed',
  space: 'no-space',
};

/** How long the disk read waits for the queue to stop moving. See the docblock. */
const DISK_READ_DEBOUNCE_MS = 400;

export function ReciterDownloadsHeader({
  reciterId,
  reciterName,
  testIDPrefix,
}: ReciterDownloadsHeaderProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const summary = useReciterDownloadSummary(reciterId);
  /** The estimate-then-confirm gate, shared with the picker's per-row control. */
  const prompt = useDownloadAllPrompt();
  const [bytesOnDisk, setBytesOnDisk] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The store is a mirror of the disk (`downloadQueueStore`'s header), so a surface that shows
  // download state seeds it on arrival and on every voice change.
  useEffect(() => {
    hydrateDownloadState(reciterId);
  }, [reciterId]);

  /**
   * The byte total is read from the FILESYSTEM, not summed from the store — a store row says a
   * surah is kept, never how big it turned out to be, and two reciters' recordings differ by a
   * factor of five. Debounced, because the kept count moves 114 times during a "download all".
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      setBytesOnDisk(reciterBytesOnDisk(reciterId));
    }, DISK_READ_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [reciterId, summary.downloaded]);

  const running = summary.active > 0;
  const complete = summary.downloaded >= SURAH_COUNT;
  const keptLabel =
    summary.downloaded > 0
      ? t('player:download.keptValue', {
          kept: summary.downloaded,
          total: SURAH_COUNT,
          size: formatBytes(bytesOnDisk),
        })
      : t('player:download.keptNone');

  return (
    <View style={styles.block} testID={`${testIDPrefix}-body`}>
      {running ? (
        <DownloadProgress
          reciterId={reciterId}
          reciterName={reciterName}
          onStop={() => cancelReciterDownloads(reciterId)}
          testID={`${testIDPrefix}-progress`}
        />
      ) : (
        <SettingsGroup footnote={t('player:download.sectionFootnote')}>
          {complete ? (
            // Not an action, and not a disabled one either: there is nothing left to download,
            // so the row states that and offers nothing. Removing is the footer's job.
            <SettingsRow
              icon="checkmark-circle"
              label={keptLabel}
              testID={`${testIDPrefix}-complete`}
            />
          ) : (
            <SettingsRow
              icon="cloud-download-outline"
              label={t(
                summary.downloaded > 0
                  ? 'player:download.downloadRest'
                  : 'player:download.downloadAll'
              )}
              description={keptLabel}
              trailing={prompt.estimatingId === reciterId ? 'spinner' : undefined}
              onPress={() => prompt.ask(reciterId)}
              testID={`${testIDPrefix}-download-all`}
            />
          )}
        </SettingsGroup>
      )}

      {summary.failed > 0 ? (
        <InlineError
          message={t('player:download.failedValue', { failed: summary.failed })}
          onRetry={() => retryFailedDownloads(reciterId)}
          retryLabel={t('player:download.retryFailed')}
          style={styles.notice}
          testID={`${testIDPrefix}-retry-failed`}
        />
      ) : null}

      {prompt.refusal === null ? null : (
        <InlineError
          message={
            prompt.refusal.kind === 'space'
              ? t('player:download.noSpace', { size: formatBytes(prompt.refusal.bytes) })
              : t('player:download.estimateFailed')
          }
          style={styles.notice}
          testID={`${testIDPrefix}-${REFUSAL_TEST_IDS[prompt.refusal.kind]}`}
        />
      )}

      <ConfirmDialog
        visible={prompt.pendingId !== null}
        title={t('player:download.confirmTitle')}
        message={t(
          prompt.metered
            ? 'player:download.confirmMessageMetered'
            : 'player:download.confirmMessage',
          {
            total: prompt.estimate?.surahs ?? 0,
            size: formatBytes(prompt.estimate?.bytes ?? 0),
          }
        )}
        confirmText={t('player:download.confirmAction')}
        onConfirm={prompt.confirm}
        onCancel={prompt.cancel}
      />
    </View>
  );
}

const useStyles = () =>
  useThemedStyles(() => ({
    // `SPACING.lg` is the screen's rail: the card's edge, the section label below it and the
    // surah rows' own 16pt inset all line up on it.
    block: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    notice: {
      marginTop: SPACING.sm,
    },
  }));
