/**
 * DownloadStorage — what every voice costs together, at the END of the reciter list
 * (2026-09-11).
 *
 * ⚠️ IT IS WHAT SURVIVED THE "DOWNLOAD ALL" BLOCK, AND ONLY BECAUSE IT HAS NO PER-ROW HOME. The
 * recitation screen used to open with a four-row card acting on the CURRENTLY CHOSEN voice —
 * redundant the moment every picker row grew its own download control and its own chevron
 * (owner, 2026-09-11: "we don't need the current download all surah button"). Two facts had
 * nowhere else to go: the total across ALL voices, which no single row can state, and the
 * downloads left behind by a reciter the catalogue no longer offers, which by definition has no
 * row at all.
 *
 * ⚠️ IT IS THE LIST'S FOOTER, NOT A BANNER ABOVE IT. wisdom-fruits deleted its own offline
 * stats banner for the same reason and put the total on a section header instead — a storage
 * figure is something a reader looks for, not something they should be shown before the thing
 * they came for. Below thirty-nine voices is exactly where "and here is what it all costs" reads.
 *
 * ⚠️ IT RENDERS NOTHING UNTIL THERE IS SOMETHING TO REPORT. A reader who has downloaded no audio
 * gets no storage section at all, rather than a card announcing 0 B.
 *
 * ⚠️ REMOVING ORPHANS CONFIRMS, AND THAT IS NOT THE SAME CALL AS A PER-SURAH REMOVE. Story
 * 23.13's no-confirm rule is for removes that are trivially reversible; these files belong to
 * voices the catalogue has WITHDRAWN (`abdulkareem`, 2026-09-08), so nothing in the app can ever
 * download them again. Irreversible, red, and confirmed.
 *
 * ⚠️ THE DISK READ IS DEBOUNCED AND KEYED ON KEPT SURAHS. It walks the audio root and every
 * reciter directory under it; keyed straight on the queue's entry count it would run once per
 * completed surah, 114 times, on the JS thread. (Story 7-5 review, P13.)
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog, SettingsGroup, SettingsRow } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useDownloadedCount } from '@/stores/downloadQueueStore';
import { RECITERS } from '../data/reciters';
import {
  DOWNLOADS_SUPPORTED,
  deleteOrphanedDownloads,
  orphanedDownloadBytes,
  reciterBytesOnDisk,
} from '../lib/audioDownloads';

export interface DownloadStorageProps {
  testID?: string;
}

/** How long the disk walk waits for a draining queue to stop moving. See the docblock. */
const DISK_READ_DEBOUNCE_MS = 400;

export function DownloadStorage({ testID = 'download-storage' }: DownloadStorageProps) {
  const { t } = useTranslation();
  const downloadedCount = useDownloadedCount();
  const [totalBytes, setTotalBytes] = useState(0);
  const [orphanBytes, setOrphanBytes] = useState(0);
  /** Bumped by anything that changes the disk behind the store's back, to force a re-read. */
  const [diskRevision, setDiskRevision] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      const ids = RECITERS.map((reciter) => reciter.id);
      setTotalBytes(ids.reduce((sum, id) => sum + reciterBytesOnDisk(id), 0));
      setOrphanBytes(orphanedDownloadBytes(ids));
    }, DISK_READ_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [downloadedCount, diskRevision]);

  const confirmRemoveOrphans = () => {
    setConfirming(false);
    haptics.impact('light');
    deleteOrphanedDownloads(RECITERS.map((reciter) => reciter.id));
    setDiskRevision((n) => n + 1);
  };

  // After every hook — web downloads nothing, so it has no storage to account for.
  if (!DOWNLOADS_SUPPORTED) return null;
  if (totalBytes === 0 && orphanBytes === 0) return null;

  return (
    // ⚠️ THE DIALOG IS THE GROUP'S SIBLING, NEVER ITS CHILD. `SettingsGroup` clones every child
    // with `showDivider`, i.e. it treats them all as rows — a dialog inside it is an invisible
    // row drawing a hairline over nothing.
    <View testID={testID}>
      <SettingsGroup label={t('player:download.sectionLabel')}>
        <SettingsRow
          icon="folder-outline"
          label={t('player:download.storageValue', { size: formatBytes(totalBytes + orphanBytes) })}
          testID={`${testID}-total`}
        />
        {orphanBytes > 0 ? (
          <SettingsRow
            icon="cloud-offline-outline"
            label={t('player:download.removeOrphans')}
            description={t('player:download.orphansValue', { size: formatBytes(orphanBytes) })}
            destructive
            onPress={() => setConfirming(true)}
            testID={`${testID}-remove-orphans`}
          />
        ) : null}
      </SettingsGroup>
      <ConfirmDialog
        visible={confirming}
        title={t('player:download.removeOrphansTitle')}
        message={t('player:download.removeOrphansMessage')}
        confirmText={t('player:download.removeAllAction')}
        confirmStyle="destructive"
        onConfirm={confirmRemoveOrphans}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
