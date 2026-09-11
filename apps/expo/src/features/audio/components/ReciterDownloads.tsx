/**
 * ReciterDownloads — the whole-reciter half of offline recitation (story 7-5).
 *
 * Four rows on the recitation surface: "download all", a stop for a queue that is running, what
 * failed, and what is currently kept with a way to remove it. The per-surah control lives on the
 * Quran index, where the reader is already choosing a surah; this is the bulk answer, and the one
 * that has to be honest about size before it costs anybody a gigabyte.
 *
 * ⚠️ THE ESTIMATE-THEN-CONFIRM GATE IS `useDownloadAllPrompt`, NOT CODE IN HERE ANY MORE. It
 * moved when the reciter picker's per-row control became a second caller (2026-09-11): the
 * frozen criterion is about ORDER — "an approximate total was shown BEFORE the confirmation" —
 * and two inline copies is how one of them quietly loses the free-space refusal or the metered
 * wording. Its docblock carries the reasoning for all of it.
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
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useReciterDownloadSummary } from '@/stores/downloadQueueStore';
import { RECITERS } from '../data/reciters';
import { type DownloadAllRefusalKind, useDownloadAllPrompt } from '../hooks/useDownloadAllPrompt';
import {
  cancelReciterDownloads,
  deleteOrphanedDownloads,
  deleteReciterDownloads,
  hydrateDownloadState,
  orphanedDownloadBytes,
  reciterBytesOnDisk,
  retryFailedDownloads,
} from '../lib/audioDownloads';
import { DownloadProgress } from './DownloadProgress';

export interface ReciterDownloadsProps {
  /** The voice whose downloads these are — the reader's current choice. */
  reciterId: string;
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

/** How long the disk reads wait for the queue to stop moving. See the docblock. */
const DISK_READ_DEBOUNCE_MS = 400;

export function ReciterDownloads({ reciterId, testIDPrefix }: ReciterDownloadsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const summary = useReciterDownloadSummary(reciterId);
  /** The estimate-then-confirm gate, shared with the picker's per-row control. */
  const prompt = useDownloadAllPrompt();
  const [removing, setRemoving] = useState(false);
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

  const confirmRemoveAll = () => {
    setRemoving(false);
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
          trailing={prompt.estimatingId === reciterId ? 'spinner' : 'chevron'}
          onPress={() => prompt.ask(reciterId)}
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
            onPress={() => setRemoving(true)}
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

      {/* ⚠️ THE GRANULAR HALF, AND THE ONLY PLACE THE APP SAYS THE QUEUE NEEDS THE APP OPEN.
          The rows above move once per completed FILE; through Al-Baqarah that is minutes of
          nothing. See `DownloadProgress`. */}
      <DownloadProgress reciterId={reciterId} testID={`${testIDPrefix}-progress`} />

      {prompt.refusal === null ? null : (
        <InlineError
          message={
            prompt.refusal.kind === 'space'
              ? t('player:download.noSpace', { size: formatBytes(prompt.refusal.bytes) })
              : t('player:download.estimateFailed')
          }
          style={styles.error}
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
      <ConfirmDialog
        visible={removing}
        title={t('player:download.removeAllTitle')}
        message={t('player:download.removeAllMessage')}
        confirmText={t('player:download.removeAllAction')}
        confirmStyle="destructive"
        onConfirm={confirmRemoveAll}
        onCancel={() => setRemoving(false)}
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
