/**
 * useStudySources — which sources this device can READ for one content type, and what it could
 * get if it has none (story 8-3).
 *
 * ⚠️ IT ASKS THE SHELF, IT DOES NOT BUILD A SECOND ONE. `features/packs` already owns what is
 * installed, what is offered, what is transferring and what failed — including the `null`-is-not-
 * `[]` discipline that stops a transient listing failure reading as "you have nothing". This hook
 * is a projection of `PackRow[]` onto one type row, and the only thing it adds is the mapping from
 * a catalogue `type` string to a row of the table (`lib/types.ts`).
 *
 * ⚠️ `deferCatalogue` IS THE FROZEN CONSTRAINT IN CODE. "Reads are local. Opening the sheet touches
 * no network on any platform." So the shelf mounts with the catalogue unfetched and stays local
 * until the reader presses the download offer, which calls `loadCatalogue()`. A hook that fetched
 * on mount would break that constraint on every open, on every surface, for a reader who only
 * wanted to read the translation they already have.
 *
 * ⚠️ AND IT IS PLATFORM-BLIND ON PURPOSE. On native a readable source is a file in the SQLite
 * directory; on web it is a pack fetched into memory this session (`features/packs/lib/webPack.ts`).
 * `usePacks` resolved that difference in story 8-3, so nothing here — and nothing in the sheet —
 * branches on `Platform.OS`.
 *
 * `lint:layers`: a feature hook — it may reach another feature through its BARREL, which is what
 * `@/features/packs` is.
 */

import { useCallback, useMemo } from 'react';
import {
  type CataloguePack,
  type CatalogueState,
  type DiskState,
  type PackRow,
  usePacks,
} from '@/features/packs';
import { PACK_TYPE_OF_STUDY_TYPE, type StudyType } from '../lib/types';

/** One source the sheet can read right now. */
export interface StudySource {
  id: string;
  /** Needed to RELEASE it — `usePacks.remove` takes the pair, never the id alone. */
  version: number;
  title: string;
  /** BCP-47 of the CONTENT — what decides the text's direction, never the interface's. */
  language: string;
  languageName: string;
  /** Required by the pack's grant, rendered WITH its text and never buried. */
  attribution: string;
  source: string;
  sourceVersion: string;
}

/** One source the reader could get. Carries its live transfer state so the row can say so. */
export interface StudyOffer {
  id: string;
  title: string;
  bytes: number;
  pack: CataloguePack;
  status: PackRow['status'];
  progress: number;
  /**
   * Why the last attempt failed, when one did (story 8-3 review, S5).
   *
   * ⚠️ DROPPING IT MADE EVERY FAILURE LOOK LIKE A FRESH OFFER. A digest mismatch, a dead network
   * or a pack too large to verify all re-rendered as a plain "Get {title}" — so the reader pressed
   * it again, waited again, and was told nothing, while `/content` had four distinct sentences for
   * exactly these states.
   */
  failure?: PackRow['failure'];
}

export interface StudySources {
  /** Installed (native) or held (web) sources for this type, ordered as the shelf orders them. */
  readable: StudySource[];
  /** Sources on offer for this type that are not readable yet. Empty until the catalogue lands. */
  offers: StudyOffer[];
  catalogue: CatalogueState;
  /**
   * Whether what this device HAS could be read at all — `usePacks`' own answer, carried through.
   *
   * ⚠️ DISCARDING IT DEFEATED 8-2's `null`-IS-NOT-`[]` RULE ONE LAYER UP (story 8-3 review, C2).
   * While the pack directory is still being listed, and whenever the listing FAILED, `readable` is
   * empty for a reason that is not "nothing is installed" — and the sheet answered both by
   * offering a reader a re-download of a pack they already have. The state has to survive all the
   * way to the panel, exactly as it does on the content screen.
   */
  disk: DiskState;
  /** Fetch the catalogue — the reader's affirmative act, never a mount effect. */
  loadCatalogue: () => void;
  /** Re-read what is installed — what the retry on an unreadable shelf calls. */
  refresh: () => void;
  install: (pack: CataloguePack) => void;
  /**
   * Drop a held source (story 8-3 review, C6). ⚠️ THE ONLY WAY OUT ON WEB: `/content` returns
   * early there, so without a control here a reader who tried three sources held all three in the
   * JS heap — up to 32 MB each — until they reloaded the page.
   */
  release: (source: StudySource) => void;
}

export function useStudySources(type: StudyType): StudySources {
  const { rows, catalogue, disk, install, remove, refresh } = usePacks({ deferCatalogue: true });
  const packType = PACK_TYPE_OF_STUDY_TYPE[type];

  const readable = useMemo(
    () =>
      rows
        .filter((row) => row.type === packType && row.installedVersion !== null)
        .map((row) => ({
          id: row.id,
          // The filter above proves it is installed; the fallback is the narrowing TypeScript
          // cannot carry through `Array.prototype.filter`.
          version: row.installedVersion ?? 0,
          title: row.title,
          language: row.language,
          languageName: row.languageName,
          attribution: row.attribution,
          source: row.source,
          sourceVersion: row.sourceVersion,
        })),
    [rows, packType]
  );

  const offers = useMemo(
    () =>
      rows
        .filter((row) => row.type === packType && row.installedVersion === null && row.offered)
        .map((row) => ({
          id: row.id,
          title: row.title,
          bytes: row.bytes,
          // The filter above proves it; the non-null assertion is the narrowing TypeScript cannot
          // carry through `Array.prototype.filter`.
          pack: row.offered as CataloguePack,
          status: row.status,
          progress: row.progress,
          failure: row.failure,
        })),
    [rows, packType]
  );

  const loadCatalogue = useCallback(() => refresh(), [refresh]);
  const release = useCallback((source: StudySource) => remove(source.id, source.version), [remove]);

  return { readable, offers, catalogue, disk, loadCatalogue, refresh, install, release };
}
