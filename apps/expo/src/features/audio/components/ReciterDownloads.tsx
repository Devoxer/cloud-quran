/**
 * ReciterDownloads — the whole-reciter half of offline recitation (story 7-5).
 *
 * Four rows on the recitation surface: "download all", a stop for a queue that is running, what
 * failed, and what is currently kept with a way to remove it. The per-surah control lives on the
 * Quran index, where the reader is already choosing a surah; this is the bulk answer, and the one
 * that has to be honest about size before it costs anybody a gigabyte.
 *
 * ⚠️ THE ESTIMATE IS COMPUTED BEFORE THE DIALOG OPENS, NOT INSIDE IT. The criterion is that an
 * approximate total was shown BEFORE the confirmation — a dialog that appears first and fills its
 * number in afterwards has already asked the question. So the press loads the reciter's manifest
 * (duration × bitrate; see `estimateReciterDownload`), and only then opens the confirmation. The
 * manifest is the same file highlighting wants, cached in the document directory by
 * `lib/reciterManifest.ts`, so the fetch is not spent solely on this dialog.
 *
 * ⚠️ AND IT IS LABELLED APPROXIMATE IN THE COPY, WHICH IS WHAT MAKES IT HONEST — and the FILE
 * COUNT comes from the manifest rather than from 114, so a reciter described in part cannot be
 * promised in full. A number presented as exact and wrong by 40% is worse than a number presented
 * as a guess and wrong by 40%; a number presented as covering 114 files while covering 90 is
 * worse than both.
 *
 * ⚠️ A FAILED ESTIMATE SAYS SO. The manifest load fails when there is no network, and with no
 * network there is nothing to download either — so the confirmation correctly does not open. What
 * the first cut then did was nothing at all: a pressed row, a blinking spinner, silence. The
 * reasoning was sound and the silence was the defect. (Story 7-5 review, P15.)
 *
 * ⚠️ TWO THINGS ARE CHECKED BETWEEN THE ESTIMATE AND THE DIALOG, AND THEY ARE NOT THE SAME KIND
 * OF THING. Free space REFUSES — a gigabyte that cannot fit is not a decision the reader should
 * be allowed to confirm, and the refusal states the size rather than doing nothing, because a
 * button that quietly declines is indistinguishable from a broken one. A metered connection only
 * WARNS, in the confirmation's own copy: a metered connection is precisely the situation the
 * reader is downloading FOR (it is the owner's stated motivation for the feature), so the app's
 * job there is to make sure nobody spends an allowance by accident, not to decide for them.
 *
 * ⚠️ THE SPACE CHECK IS AS APPROXIMATE AS THE ESTIMATE IT USES, WHICH IS WHY IT IS A FLOOR AND
 * NOT A GUARANTEE. `NOMINAL_BITRATE_BPS` can be out by a factor of two at the extremes, so a
 * download that passes here can still fill the disk — and that lands on the per-row storage-full
 * error the frozen matrix already asks for. What this stops is the obvious case: 1.6 GB onto a
 * device with 400 MB left, discovered 114 failures later.
 *
 * ⚠️ A RUNNING QUEUE HAS A VISIBLE STOP, AND IT IS NOT OPTIONAL. Per-row cancel lives on another
 * screen, remove-all renders only once something is kept, and the reciter picker sits directly
 * below this block — so switching voice used to hide a 114-file queue that kept running with no
 * surface anywhere claiming it. (Story 7-5 review, P7.)
 *
 * ⚠️ REMOVING ALL *DOES* CONFIRM, WHILE REMOVING ONE DOES NOT — and the difference is reversal
 * cost, not consistency. Story 23.13's no-confirm rule is for removes that are trivially
 * reversible; one surah is a single press to get back, and the whole book is an hour of network.
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
import { isMeteredConnection } from '@/lib/connectivity';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { loadReciterManifest } from '@/lib/reciterManifest';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useReciterDownloadSummary } from '@/stores/downloadQueueStore';
import { RECITERS } from '../data/reciters';
import {
  availableDownloadSpace,
  cancelReciterDownloads,
  deleteOrphanedDownloads,
  deleteReciterDownloads,
  estimateReciterDownload,
  hydrateDownloadState,
  orphanedDownloadBytes,
  queueReciterDownloads,
  reciterBytesOnDisk,
  retryFailedDownloads,
} from '../lib/audioDownloads';

export interface ReciterDownloadsProps {
  /** The voice whose downloads these are — the reader's current choice. */
  reciterId: string;
  testIDPrefix: string;
}

/** Which dialog, if any, is open. `null` is the ordinary state. */
type Prompt = 'download-all' | 'remove-all' | null;

/**
 * Why "download all" did not open its confirmation. `null` is the ordinary state.
 *
 * Both are shown in the same inline error, under the row that was pressed, because both answer
 * the same question the reader just asked and neither is worth a modal.
 */
type Refusal = 'estimate' | 'space' | null;

/** The testID suffix each refusal renders under — the two states are told apart by a test. */
const REFUSAL_TEST_IDS: Record<Exclude<Refusal, null>, string> = {
  estimate: 'estimate-failed',
  space: 'no-space',
};

/** How long the disk reads wait for the queue to stop moving. See the docblock. */
const DISK_READ_DEBOUNCE_MS = 400;

export function ReciterDownloads({ reciterId, testIDPrefix }: ReciterDownloadsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const summary = useReciterDownloadSummary(reciterId);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [estimate, setEstimate] = useState<{ bytes: number; surahs: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>(null);
  /** Whether the confirmation should mention what this will cost. See the docblock. */
  const [metered, setMetered] = useState(false);
  const [bytesOnDisk, setBytesOnDisk] = useState(0);
  const [orphanBytes, setOrphanBytes] = useState(0);
  /** Bumped by anything that changes the disk behind the store's back, to force a re-read. */
  const [diskRevision, setDiskRevision] = useState(0);
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
   * The byte totals are read from the FILESYSTEM, not summed from the store — a store row says a
   * surah is kept, never how big it turned out to be, and two reciters' recordings differ by a
   * factor of five. Debounced, because the kept count moves 114 times during a "download all".
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      setBytesOnDisk(reciterBytesOnDisk(reciterId));
      setOrphanBytes(orphanedDownloadBytes(RECITERS.map((reciter) => reciter.id)));
    }, DISK_READ_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [reciterId, summary.downloaded, diskRevision]);

  const askDownloadAll = async () => {
    if (estimating) return;
    haptics.selection();
    setEstimating(true);
    setRefusal(null);
    try {
      const computed = estimateReciterDownload(await loadReciterManifest(reciterId));
      if (!mounted.current) return;
      setEstimate(computed);

      // ⚠️ REFUSED, WITH THE SIZE NAMED. `null` is "the platform would not say" and is not a
      // reason to stop anybody — see `availableDownloadSpace`.
      const free = availableDownloadSpace();
      if (free !== null && free < computed.bytes) {
        setRefusal('space');
        return;
      }

      const onMetered = await isMeteredConnection();
      if (!mounted.current) return;
      setMetered(onMetered);
      setPrompt('download-all');
    } catch {
      // No estimate means no dialog — see the docblock. What it does NOT mean is silence.
      if (!mounted.current) return;
      setEstimate(null);
      setRefusal('estimate');
    } finally {
      if (mounted.current) setEstimating(false);
    }
  };

  const confirmDownloadAll = () => {
    setPrompt(null);
    queueReciterDownloads(reciterId);
  };

  const confirmRemoveAll = () => {
    setPrompt(null);
    haptics.impact('light');
    deleteReciterDownloads(reciterId);
    setDiskRevision((n) => n + 1);
  };

  const removeOrphans = () => {
    haptics.impact('light');
    deleteOrphanedDownloads(RECITERS.map((reciter) => reciter.id));
    setDiskRevision((n) => n + 1);
  };

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
      <SettingsGroup
        label={t('player:download.sectionLabel')}
        footnote={t('player:download.sectionFootnote')}
      >
        <SettingsRow
          icon="cloud-download-outline"
          label={t('player:download.downloadAll')}
          description={keptLabel}
          trailing={estimating ? 'spinner' : 'chevron'}
          onPress={askDownloadAll}
          testID={`${testIDPrefix}-download-all`}
        />
        {summary.active > 0 ? (
          <SettingsRow
            icon="close"
            label={t('player:download.stop')}
            description={t('player:download.stopValue', { active: summary.active })}
            onPress={() => cancelReciterDownloads(reciterId)}
            testID={`${testIDPrefix}-stop`}
          />
        ) : null}
        {summary.failed > 0 ? (
          <SettingsRow
            icon="alert-circle-outline"
            label={t('player:download.retryFailed')}
            description={t('player:download.failedValue', { failed: summary.failed })}
            onPress={() => retryFailedDownloads(reciterId)}
            testID={`${testIDPrefix}-retry-failed`}
          />
        ) : null}
        {summary.downloaded > 0 ? (
          <SettingsRow
            icon="trash-outline"
            label={t('player:download.removeAll')}
            destructive
            onPress={() => setPrompt('remove-all')}
            testID={`${testIDPrefix}-remove-all`}
          />
        ) : null}
        {orphanBytes > 0 ? (
          <SettingsRow
            icon="cloud-offline-outline"
            label={t('player:download.removeOrphans')}
            description={t('player:download.orphansValue', { size: formatBytes(orphanBytes) })}
            destructive
            onPress={removeOrphans}
            testID={`${testIDPrefix}-remove-orphans`}
          />
        ) : null}
      </SettingsGroup>

      {refusal === null ? null : (
        <InlineError
          message={
            refusal === 'space'
              ? t('player:download.noSpace', { size: formatBytes(estimate?.bytes ?? 0) })
              : t('player:download.estimateFailed')
          }
          style={styles.error}
          testID={`${testIDPrefix}-${REFUSAL_TEST_IDS[refusal]}`}
        />
      )}

      <ConfirmDialog
        visible={prompt === 'download-all'}
        title={t('player:download.confirmTitle')}
        message={t(
          metered ? 'player:download.confirmMessageMetered' : 'player:download.confirmMessage',
          {
            total: estimate?.surahs ?? 0,
            size: formatBytes(estimate?.bytes ?? 0),
          }
        )}
        confirmText={t('player:download.confirmAction')}
        onConfirm={confirmDownloadAll}
        onCancel={() => setPrompt(null)}
      />
      <ConfirmDialog
        visible={prompt === 'remove-all'}
        title={t('player:download.removeAllTitle')}
        message={t('player:download.removeAllMessage')}
        confirmText={t('player:download.removeAllAction')}
        confirmStyle="destructive"
        onConfirm={confirmRemoveAll}
        onCancel={() => setPrompt(null)}
      />
    </View>
  );
}

const useStyles = () =>
  useThemedStyles(() => ({
    block: {
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
    },
    error: {
      marginTop: SPACING.sm,
    },
  }));
