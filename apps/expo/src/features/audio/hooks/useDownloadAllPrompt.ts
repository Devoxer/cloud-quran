/**
 * useDownloadAllPrompt — the estimate-then-confirm gate in front of "keep this whole reciter".
 *
 * ⚠️ IT IS A HOOK BECAUSE THERE ARE NOW TWO CALLERS, AND THE ACCEPTANCE CRITERION IS ABOUT
 * ORDER. Story 7-5 froze "an **approximate** total size was shown BEFORE the confirmation", and
 * `ReciterDownloads` implemented it inline. The reciter picker's per-row control (2026-09-11) is
 * the second caller, and a second inline copy is how one of them quietly loses the free-space
 * refusal or the metered wording. One hook, one order: load the manifest → estimate → refuse on
 * space → ask about metering → open the dialog.
 *
 * ⚠️ THE PICKER OWNS ONE DIALOG FOR 39 ROWS, WHICH IS WHY `ask` TAKES THE RECITER AND THE STATE
 * IS KEYED BY ID. A dialog per row would be 39 mounted modals; a dialog with no id would show
 * Al-Afasy's estimate over Al-Husary's row the moment a reader pressed twice.
 *
 * ⚠️ THE ESTIMATE IS COMPUTED BEFORE THE DIALOG OPENS, NOT INSIDE IT — a dialog that appears
 * first and fills its number in afterwards has already asked the question. And a failed estimate
 * SAYS SO: the manifest load fails when there is no network, and silence there is the defect
 * story 7-5's review recorded (P15), not the refusal.
 *
 * ⚠️ FREE SPACE REFUSES, A METERED CONNECTION ONLY WARNS. A gigabyte that cannot fit is not a
 * decision worth taking a confirmation for; a metered connection is precisely the situation the
 * reader is downloading FOR. `null` free space is "the platform would not say" and refuses
 * nobody.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isMeteredConnection } from '@/lib/connectivity';
import { loadReciterManifest } from '@/lib/reciterManifest';
import {
  availableDownloadSpace,
  estimateReciterDownload,
  queueReciterDownloads,
} from '../lib/audioDownloads';

/** Why the confirmation did not open — both are shown inline, under the control that was pressed. */
export type DownloadAllRefusalKind = 'estimate' | 'space';

export interface DownloadAllRefusal {
  reciterId: string;
  kind: DownloadAllRefusalKind;
  /** The estimated size, for the space refusal's copy. `0` when there is no estimate. */
  bytes: number;
}

export interface DownloadAllPrompt {
  /** Press handler. Loads the manifest, checks space, then opens the confirmation. */
  ask: (reciterId: string) => void;
  /** The reciter whose estimate is being computed, or `null`. Drives one spinner. */
  estimatingId: string | null;
  /** The reciter the confirmation is open for, or `null`. */
  pendingId: string | null;
  /** What the confirmation should promise: the file count and the approximate total. */
  estimate: { bytes: number; surahs: number } | null;
  /** Whether the confirmation's copy should mention what this will cost. */
  metered: boolean;
  refusal: DownloadAllRefusal | null;
  /** Queue the whole reciter and close. */
  confirm: () => void;
  /** Close without queueing anything. */
  cancel: () => void;
}

export function useDownloadAllPrompt(): DownloadAllPrompt {
  const [estimatingId, setEstimatingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ bytes: number; surahs: number } | null>(null);
  const [metered, setMetered] = useState(false);
  const [refusal, setRefusal] = useState<DownloadAllRefusal | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ask = useCallback(
    (reciterId: string) => {
      if (estimatingId !== null) return;
      setEstimatingId(reciterId);
      setRefusal(null);
      void (async () => {
        try {
          const computed = estimateReciterDownload(await loadReciterManifest(reciterId));
          if (!mounted.current) return;
          setEstimate(computed);

          // ⚠️ REFUSED, WITH THE SIZE NAMED. `null` is "the platform would not say" and is not a
          // reason to stop anybody — see `availableDownloadSpace`.
          const free = availableDownloadSpace();
          if (free !== null && free < computed.bytes) {
            setRefusal({ reciterId, kind: 'space', bytes: computed.bytes });
            return;
          }

          const onMetered = await isMeteredConnection();
          if (!mounted.current) return;
          setMetered(onMetered);
          setPendingId(reciterId);
        } catch {
          // No estimate means no dialog — see the docblock. What it does NOT mean is silence.
          if (!mounted.current) return;
          setEstimate(null);
          setRefusal({ reciterId, kind: 'estimate', bytes: 0 });
        } finally {
          if (mounted.current) setEstimatingId(null);
        }
      })();
    },
    [estimatingId]
  );

  const confirm = useCallback(() => {
    // Read before the state clears: `queueReciterDownloads` is what the whole gate was for.
    const target = pendingId;
    setPendingId(null);
    if (target !== null) queueReciterDownloads(target);
  }, [pendingId]);

  const cancel = useCallback(() => setPendingId(null), []);

  return { ask, estimatingId, pendingId, estimate, metered, refusal, confirm, cancel };
}
