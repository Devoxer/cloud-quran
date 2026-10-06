/**
 * StudySheet — scope × type × source, in one half-sheet opened from the contextual verse row
 * (story 8-3).
 *
 * ⚠️ THE TYPE ROW IS IDENTICAL AT EVERY SCOPE, AND NOTHING HERE FILTERS IT. `STUDY_TYPES` is
 * mapped straight to chips; `STUDY_SCOPES` drives a separate control that only changes the RANGE
 * the reader is looking at. A scope never hides a type, because a type answers for a range and
 * every scope is a range (`lib/scope.ts`). Adding an `if (scope === …)` around a chip is the
 * regression `StudySheet.test.tsx` asserts against across all three scopes.
 *
 * ⚠️ IT HOLDS THE CHROME'S DWELL AND MUST NOT TOUCH THE SELECTION. `useChromeReveal` keeps
 * `visible` and `selected` in ONE state object precisely so the selection dies with the chrome; a
 * sheet that cleared or moved it would be a second writer of that state. `ReadingChrome` owns the
 * hold, exactly as it does for `ReciterSheet`, and this component only reads the pair it is given.
 *
 * ⚠️ AND IT IS MOUNTED OUTSIDE BOTH ANIMATED BARS, for `ReciterSheet`'s recorded reason: inside
 * the footer it would inherit the reveal's opacity and its `pointerEvents`, so the five-second
 * dwell would fade a reader's open sheet away mid-scroll and make it untouchable. This file also
 * carries no `useSharedValue` and no `withTiming` — `ReadingChrome.test.tsx`'s one-driver walk
 * reads it.
 *
 * ── ⚠️ THE BODY IS A SEPARATE COMPONENT, AND THAT IS NOT TIDINESS ────────────────────────────
 *
 * `StudySheetBody` holds every hook, and this file mounts it only while `open`. The chrome is
 * mounted on both reading surfaces for the whole session, so hooks living up here would list the
 * pack directory, open every installed pack and read its metadata on every reading-screen mount —
 * work for a sheet nobody has opened. It is also what makes "opening the sheet touches no network"
 * checkable: there is no mounted shelf to fetch anything until the reader asks.
 *
 * ── ⚠️ THE BOX IS EXPLICIT, BECAUSE `snapPoints` IS IGNORED AT ≥768pt ────────────────────────
 *
 * `BottomSheet` bypasses the native detent on a wide layout for a centered dialog card whose body
 * is `{ flexShrink: 1, minHeight: 0 }` — a content-MEASURED host, in which the `flex: 1` list
 * below collapses. `ReciterSheet` records the same trap; this sheet is TALLER than the reciter
 * list, so the wide layout is a real case rather than a formality. The height below is what makes
 * the claim true on a phone, an iPad, an Android tablet and wide web alike.
 *
 * ── ⚠️ WEB KEYBOARD ─────────────────────────────────────────────────────────────────────────
 *
 * Escape closes and the number keys switch source, both from ONE listener registered only on web
 * and only while the sheet is open. There is no long-press anywhere in this story and there is no
 * hover affordance; a keyboard reader gets the same two actions a touch reader gets.
 *
 * ── ⚠️ DOZENS OF SOURCES, NOT ONE (story 8-4) ───────────────────────────────────────────────
 *
 * QuranEnc grants 75 editions in 56 languages, so both lists here — the sources a reader HAS and
 * the ones they could GET — are grouped by language with the reader's own language first
 * (`features/packs` § `buildPackGroups`, `ReciterPicker`'s shape), and searchable once they are
 * long. The chip row stays for the common case of a few installed editions, with a "find" chip
 * that opens the grouped, searchable list when there are more than a row can show. The offer list
 * is a virtualized list in a bounded box, so 75 offers never push the Arabic off the sheet.
 */

import { FlashList } from '@shopify/flash-list';
import { SURAH_METADATA } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import {
  BottomSheet,
  Chip,
  InlineError,
  LoadingView,
  SearchBar,
  SegmentedControl,
} from '@/components/ui';
import { ARABIC_LINE_HEIGHT, stripDisplayMarks, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { OPACITY } from '@/constants/opacity';
import { PACKS_SESSION_ONLY } from '@/constants/packs';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { buildPackGroups, type PackListRow } from '@/features/packs';
import { formatBytes, isolate, useQuranNumerals } from '@/lib/format';
import { contentTextAlign, isRTLContent, TEXT_ALIGN_START } from '@/lib/rtl';
import { surahDisplayName } from '@/lib/surahName';
import type { VersePair } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { usePackProgress } from '@/stores/packStore';
import { type StudyRow, useStudyContent } from '../hooks/useStudyContent';
import { type StudyOffer, type StudySource, useStudySources } from '../hooks/useStudySources';
import { resolveScope, STUDY_SCOPES, type StudyScope } from '../lib/scope';
import { STUDY_TYPES, type StudyType, studyTypeLabelKey } from '../lib/types';

/** Tall enough for the three control rows plus several ayat, without covering the whole app. */
const SHEET_SNAP_POINTS = ['75%'];

/** The body's own box. Comfortably under the detent, which also holds the header and handle. */
const SHEET_BODY_RATIO = 0.64;
const SHEET_BODY_MAX = 620;

/** The type the sheet opens on: the one type any pack exists for today (story 8-2's French). */
const DEFAULT_TYPE: StudyType = 'translation';

/** The Arabic in the sheet is a CONTEXT line, not the reading surface's 20–44pt preference. */
const SHEET_ARABIC_FONT_SIZE = FONT_SIZE.h3;

/** How many sources a number key can reach. Nine, because there is no key for a tenth. */
const SOURCE_HOTKEYS = 9;

/**
 * Past this many installed sources the chip row also offers "find a source" — the grouped,
 * searchable list. Below it, every source is a chip in view or one flick away.
 */
const SOURCE_CHIP_LIMIT = 6;

/** Past this many offers the offer list gains a search field. */
const OFFER_SEARCH_THRESHOLD = 6;

/** The offer list's own box, as a share of the sheet body — the rest stays the Arabic's. */
const OFFER_LIST_RATIO = 0.45;

export interface StudySheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The ayah the reader selected, straight from `useChromeReveal`. The sheet READS it and never
   * writes it — see the header. `null` closes the sheet from `ReadingChrome`'s side.
   */
  verse: VersePair | null;
}

export function StudySheet({ open, onClose, verse }: StudySheetProps) {
  // See the header: every hook lives in the body, which mounts only while the sheet is open.
  if (!open || verse === null) return null;
  return <StudySheetBody onClose={onClose} verse={verse} />;
}

function StudySheetBody({ onClose, verse }: { onClose: () => void; verse: VersePair }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  const { height } = useWindowDimensions();
  const [scope, setScope] = useState<StudyScope>('ayah');
  const [type, setType] = useState<StudyType>(DEFAULT_TYPE);
  /**
   * The source the reader chose, PER TYPE. Keyed by type because switching type and back should
   * not silently move them to another edition — and because "which translation" and "which
   * tafsir" are two answers, not one.
   */
  const [chosen, setChosen] = useState<Partial<Record<StudyType, string>>>({});

  const { readable, offers, catalogue, disk, loadCatalogue, refresh, install, release } =
    useStudySources(type);
  // ⚠️ THE CHOICE IS VALIDATED AGAINST WHAT IS STILL READABLE. A pack removed from the content
  // screen while this sheet's state remembers it would otherwise read from an id nothing can
  // open — `PackNotOpenError`, rendered as a failure, for a pack the reader deliberately deleted.
  const sourceId = readable.some((s) => s.id === chosen[type])
    ? (chosen[type] ?? null)
    : (readable[0]?.id ?? null);
  const source = readable.find((s) => s.id === sourceId) ?? null;
  /** Whether the grouped, searchable source list is open in place of the chip row's overflow. */
  const [findingSource, setFindingSource] = useState(false);

  const range = useMemo(() => resolveScope(scope, verse), [scope, verse]);
  // The PAIR: the content hook opens the pack it reads (story 8-4), which takes its version.
  const { state, retry } = useStudyContent(
    range,
    source === null ? null : { id: source.id, version: source.version }
  );

  /**
   * ⚠️ A BARE AYAH NUMBER IS AMBIGUOUS THE MOMENT THE RANGE CROSSES A SURAH (owner, on an iPhone,
   * 2026-09-19). Mushaf page 221 is `10:107 → 11:5`: Yunus ends and Hud begins, so the sheet drew
   * "1" for Hud 11:1 under a chrome that says يونس, with nothing anywhere saying which surah that
   * "1" belonged to. Page scope crosses a surah on ~110 of the 604 pages; surah scope never does,
   * and neither does ayah scope — so the SURAH IS SHOWN ONLY WHEN IT IS IN QUESTION, and the
   * common case stays as quiet as it was.
   */
  const crossesSurahs = range.from.surah !== range.to.surah;
  const surahName = (surah: number): string =>
    surahDisplayName(SURAH_METADATA[surah - 1]) ??
    t('common:bookmarks.surahFallback', { number: formatQuranNumber(surah) });
  const rowLabel = (row: StudyRow): string => {
    const n = formatQuranNumber;
    /**
     * ⚠️ A PASSAGE IS LABELLED BY ITS WHOLE SPAN (story 8-5). Its text is about every ayah from
     * the first to the last even when the range shows one of them, and a reader on 2:3 who sees
     * 2:1–5 knows why the commentary opens two ayat early. A passage that crosses a surah spells
     * both ends (`103:1–104:6`). When the listed rows span more than one surah, the surah's NAME
     * leads the span exactly as it leads a single ayah's number. Digits and punctuation are
     * isolated so a right-to-left interface cannot reorder the span around its dash.
     */
    if (row.lastSurah !== row.surah) {
      return isolate(`${n(row.surah)}:${n(row.verse)}–${n(row.lastSurah)}:${n(row.lastVerse)}`);
    }
    if (row.lastVerse > row.verse) {
      const span = `${n(row.verse)}–${n(row.lastVerse)}`;
      if (!crossesSurahs) return isolate(`${n(row.surah)}:${span}`);
      return t('common:study.rowLabel', {
        name: isolate(surahName(row.surah)),
        verse: isolate(span),
      });
    }
    const verseNumber = n(row.verse);
    if (!crossesSurahs) return verseNumber;
    // The surah name is CONTENT beside a number — isolated so the separator cannot reorder
    // around it once the catalogue carries a right-to-left title (`lib/format.ts` § isolate).
    return t('common:study.rowLabel', { name: isolate(surahName(row.surah)), verse: verseNumber });
  };

  const chooseSource = useCallback(
    (id: string) => {
      setChosen((current) => ({ ...current, [type]: id }));
      setFindingSource(false);
    },
    [type]
  );
  // Same reason as `sources`: the listener is registered once and reads the current handlers.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const chooseSourceRef = useRef(chooseSource);
  chooseSourceRef.current = chooseSource;

  /**
   * What the number keys currently address. A REF, so the listener below can be registered ONCE
   * for the life of the sheet — see its docblock.
   */
  const sources = useRef(readable);
  sources.current = readable;

  /**
   * ⚠️ ONE WEB LISTENER, REGISTERED ONCE WHILE THE SHEET IS MOUNTED. Escape closes; `1`–`9` pick
   * the nth source. `Platform.OS` is checked as well as `document`, because react-native-web is
   * not the only environment with a global `document` (jsdom is the other one this repo runs).
   *
   * ⚠️ IT READS THE SOURCES THROUGH A REF RATHER THAN DEPENDING ON THEM (story 8-3 review, S4).
   * With `readable` in the deps this effect tore down and re-attached a global `document` listener
   * on every render of the sheet — and `usePacks` rebuilt `rows` unmemoised, so that was every
   * render, which also made both `useMemo`s in `useStudySources` decorative. The memo is fixed at
   * the source; the ref is what makes this listener's lifetime the SHEET's rather than a render's.
   *
   * ⚠️ AND A MODIFIER IS NOT A HOTKEY (story 8-3 review, S3). `Cmd/Ctrl+2` is "switch browser tab"
   * on every desktop platform and `Alt+3` is a menu accelerator; without the guard a reader
   * changing tabs silently changed which edition of the Quran they were reading.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= SOURCE_HOTKEYS) return;
      const picked = sources.current[index];
      if (picked) chooseSourceRef.current(picked.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** Whether the number-key shortcuts exist at all — only web has a keyboard. */
  const hotkeys = Platform.OS === 'web';
  const bodyStyle = { height: Math.min(height * SHEET_BODY_RATIO, SHEET_BODY_MAX) };
  const scopeLabels = STUDY_SCOPES.map((value) => t(`common:study.scopes.${value}`));
  const rows = state.kind === 'ready' || state.kind === 'empty' ? state.rows : [];
  const rangeNumber =
    range.from.verse === range.to.verse
      ? formatQuranNumber(range.from.verse)
      : `${formatQuranNumber(range.from.verse)}–${formatQuranNumber(range.to.verse)}`;
  const title = crossesSurahs
    ? `${surahName(range.from.surah)} ${formatQuranNumber(range.from.verse)} – ${surahName(range.to.surah)} ${formatQuranNumber(range.to.verse)}`
    : t('common:study.rowLabel', {
        name: isolate(surahName(range.from.surah)),
        verse: isolate(rangeNumber),
      });

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      snapPoints={Platform.OS === 'android' ? undefined : SHEET_SNAP_POINTS}
      closeTestID="study-sheet-close"
      testID="study-sheet"
    >
      <View style={[styles.body, bodyStyle]} testID="study-sheet-body">
        {/* The RANGE. Never a subject — see `lib/scope.ts`. */}
        <SegmentedControl
          values={scopeLabels}
          selectedIndex={STUDY_SCOPES.indexOf(scope)}
          onChange={({ nativeEvent }) => setScope(STUDY_SCOPES[nativeEvent.selectedSegmentIndex])}
          testID="study-scope"
        />

        {/* ⚠️ THE SAME FIVE CHIPS AT EVERY SCOPE. Nothing above filters this list. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          /* ⚠️ THE ROW BLEEDS PAST THE BODY'S PADDING ON BOTH EDGES. Without it the chips scroll
             inside a column that is already inset, so the last one is cut a whole `SPACING.md`
             before the sheet's edge and the row looks narrower than the sheet it lives in. The
             negative margin gives the scroller the full width; `chipRow`'s padding puts the
             chips back where the other controls sit. */
          style={[styles.chipScroll, styles.chipBleed]}
          contentContainerStyle={styles.chipRow}
          testID="study-types"
        >
          {STUDY_TYPES.map((value) => (
            <Chip
              key={value}
              label={t(studyTypeLabelKey(value))}
              isSelected={value === type}
              onPress={() => setType(value)}
              testID={`study-type-${value}`}
            />
          ))}
        </ScrollView>

        {/* Only when there is a choice to make: one source names itself in the attribution. The
            chips are in `readable`'s order — grouped by language, the reader's own first. */}
        {readable.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.chipScroll, styles.chipBleed]}
            contentContainerStyle={styles.chipRow}
            testID="study-sources"
          >
            {readable.length > SOURCE_CHIP_LIMIT ? (
              <Chip
                icon="search"
                label={t('common:study.findSource', {
                  number: formatQuranNumber(readable.length),
                })}
                isSelected={findingSource}
                onPress={() => setFindingSource((open) => !open)}
                testID="study-source-find"
              />
            ) : null}
            {readable.map((entry, index) => (
              <Chip
                key={entry.id}
                /* ⚠️ THE NUMBER IS THE HOTKEY, WRITTEN DOWN (story 8-3 review, S3). `1`–`9` switch
                   source on web and nothing said so, which made them a feature only this file's
                   author could find. It rides the LABEL rather than a second glyph so the chip
                   stays one target, and it is web-only because only web has a keyboard. */
                label={
                  hotkeys && index < SOURCE_HOTKEYS
                    ? t('common:study.sourceWithKey', {
                        // The pack's own title, in the pack's own language, beside a digit.
                        title: isolate(entry.title),
                        key: formatQuranNumber(index + 1),
                      })
                    : // Isolated in BOTH branches: it is the same pack title in the same UI
                      // copy, and a wrapper that appears only when a hotkey hint does would be
                      // a bidi fix that switches off on native.
                      isolate(entry.title)
                }
                isSelected={entry.id === sourceId}
                onPress={() => chooseSource(entry.id)}
                accessibilityLabel={t('common:study.a11y.source', { title: entry.title })}
                testID={`study-source-${entry.id}`}
              />
            ))}
          </ScrollView>
        ) : null}

        {findingSource && readable.length > SOURCE_CHIP_LIMIT ? (
          <SourceFinder
            sources={readable}
            selectedId={sourceId}
            onChoose={chooseSource}
            height={bodyStyle.height * OFFER_LIST_RATIO}
          />
        ) : null}

        {/* ⚠️ "NOTHING IS INSTALLED" AND "WE CANNOT SAY YET" ARE DIFFERENT ANSWERS, AND THE SHEET
            USED TO GIVE THE FIRST FOR BOTH (story 8-3 review, C2). While the pack directory is
            still being listed — and whenever the listing FAILED — offering a reader a re-download
            of a pack they already have is 8-2's `null`-is-not-`[]` defect one layer up. */}
        {state.kind === 'empty' && disk !== 'ready' ? (
          <View style={styles.panel} testID="study-sources-unknown">
            {disk === 'loading' ? (
              <LoadingView size="small" testID="study-sources-checking" />
            ) : (
              <InlineError
                message={t('common:study.sourcesUnavailable')}
                onRetry={refresh}
                retryLabel={t('common:study.retry')}
                testID="study-sources-error"
              />
            )}
          </View>
        ) : null}

        {state.kind === 'empty' && disk === 'ready' ? (
          <NoSourcePanel
            typeLabel={t(studyTypeLabelKey(type))}
            offers={offers}
            catalogue={catalogue}
            onLoadCatalogue={loadCatalogue}
            onInstall={install}
            listHeight={bodyStyle.height * OFFER_LIST_RATIO}
          />
        ) : null}

        <View style={styles.content}>
          {state.kind === 'loading' ? <LoadingView testID="study-loading" /> : null}
          {state.kind === 'error' ? (
            <InlineError
              message={t('common:study.errorTitle')}
              onRetry={retry}
              retryLabel={t('common:study.retry')}
              testID="study-error"
            />
          ) : null}
          {state.kind === 'ready' && rows.length === 0 ? (
            <Text style={styles.notice} testID="study-no-entries">
              {t('common:study.noEntries')}
            </Text>
          ) : null}
          {rows.length > 0 ? (
            <FlashList
              data={rows}
              keyExtractor={(row) => `${row.surah}:${row.verse}`}
              renderItem={({ item }) => (
                <StudyEntry
                  row={item}
                  contentDirection={source?.direction ?? null}
                  contentLanguage={source?.language ?? null}
                  verseLabel={rowLabel(item)}
                  selected={verse}
                  /* ⚠️ SILENT WHEN THERE IS NO SOURCE AT ALL (story 8-3 review, S1). Surah scope
                     on Al-Baqarah drew 286 copies of "Nothing for this ayah" beneath a panel that
                     had already said, once, that no source is installed. A per-row absence is
                     information only when the SOURCE is present and this ayah is the gap. */
                  saysAbsent={state.kind === 'ready'}
                />
              )}
              contentContainerStyle={styles.list}
              testID="study-entries"
            />
          ) : null}
        </View>

        {/* Required by the pack's grant, rendered WITH its text rather than buried.
            ⚠️ IT MAY OVERFLOW, AND IT IS NEVER CLIPPED (story 8-4). The credit is QuranEnc's own
            title + QuranEnc + version, and a Tamil or Urdu title runs to several lines at a large
            font scale. It holds its own height against the reading list (`flexShrink: 0`), and a
            credit taller than its box scrolls inside it rather than being cut by the sheet. */}
        {source && source.attribution.length > 0 ? (
          <ScrollView
            style={styles.attributionBox}
            contentContainerStyle={styles.attributionContent}
            testID="study-attribution-box"
          >
            <Text
              style={[styles.attribution, isRTLContent(source.direction) ? styles.rtl : styles.ltr]}
              testID="study-attribution"
            >
              {source.attribution}
            </Text>
          </ScrollView>
        ) : null}
        {/* ⚠️ THE ONLY WAY TO LET A HELD SOURCE GO (story 8-3 review, C6). `/content` returns early
            on web, so `usePacks.remove` was unreachable there — a reader who tried three sources
            held all three in the JS heap, up to 128 MB each, until they reloaded the page. It is
            deliberately ABSENT on native, where the content screen owns removal and a delete here
            would be a second door onto a permanent action from inside a reading surface. */}
        {source && PACKS_SESSION_ONLY ? (
          <View style={styles.sessionRow}>
            <Text style={styles.notice} testID="study-session-only">
              {t('common:study.sessionOnly')}
            </Text>
            <Pressable
              onPress={() => release(source)}
              accessibilityRole="button"
              accessibilityLabel={t('common:study.a11y.release', { title: source.title })}
              style={styles.action}
              testID="study-release"
            >
              <Text style={styles.actionLabel}>{t('common:study.release')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/**
 * The Arabic a row draws: one ayah as it is; several with an ayah marker after each, so a
 * passage's ayat stay countable — and the marker of the ayah the reader SELECTED emphasised, so
 * they can find their place inside a passage of thirty. Display marks are stripped at the draw
 * site, never in the data.
 */
function rowArabic(
  row: StudyRow,
  selected: VersePair,
  styles: { marker: object; markerSelected: object },
  formatQuranNumber: (value: number) => string
): React.ReactNode {
  // One ayah stays a plain string — the shape every translation row has always rendered.
  if (row.lastSurah === row.surah && row.lastVerse === row.verse && row.ayat.length === 1) {
    return stripDisplayMarks(row.ayat[0].arabic);
  }
  return (
    <>
      {row.ayat.map((ayah, index) => {
        const isSelected = ayah.surah === selected.surah && ayah.verse === selected.verse;
        return (
          <Text key={`${ayah.surah}:${ayah.verse}`}>
            {index > 0 ? ' ' : ''}
            {stripDisplayMarks(ayah.arabic)}{' '}
            <Text
              style={isSelected ? styles.markerSelected : styles.marker}
              testID={
                isSelected
                  ? `study-marker-${ayah.surah}-${ayah.verse}-selected`
                  : `study-marker-${ayah.surah}-${ayah.verse}`
              }
            >
              ({formatQuranNumber(ayah.verse)})
            </Text>
          </Text>
        );
      })}
    </>
  );
}

/** One passage (or one ayah): the Quran, then what the source says about it, once. */
function StudyEntry({
  row,
  contentDirection,
  contentLanguage,
  verseLabel,
  saysAbsent,
  selected,
}: {
  row: StudyRow;
  /** The ayah the reader selected — its marker is emphasised inside a multi-ayah passage. */
  selected: VersePair;
  /** The SOURCE's own `direction` (story 8-4) — never a language lookup, never the interface's. */
  contentDirection: string | null;
  contentLanguage: string | null;
  verseLabel: string;
  /** Whether "this source has nothing here" is worth saying — see the call site. */
  saysAbsent: boolean;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  const contentStyle = isRTLContent(contentDirection) ? styles.rtl : styles.ltr;
  // ⚠️ ONE `Text` PER PARAGRAPH, NOT ONE FOR THE WHOLE PASSAGE (story 8-5). A classical passage
  // runs to 170,000 characters; one text node that size is one layout pass of it on Android.
  // Paragraphs are separated by a blank line in every pack, so splitting there costs nothing.
  const paragraphs = row.content === null ? [] : row.content.split('\n\n');
  return (
    <View style={styles.entry} testID={`study-entry-${row.surah}-${row.verse}`}>
      <Text style={styles.verseNumber}>{verseLabel}</Text>
      {/* ⚠️ THE ARABIC SETS ITS OWN DIRECTION AT THE DRAW SITE — web is deliberately not mirrored
          (`lib/rtl.ts`), so every content site in this repo does this locally. `stripDisplayMarks`
          is the measured KFGQPC U+06DF defect; the stored text is never touched. */}
      <Text style={[styles.arabic, styles.rtl]} testID={`study-arabic-${row.surah}-${row.verse}`}>
        {rowArabic(row, selected, styles, formatQuranNumber)}
      </Text>
      {row.content === null ? (
        saysAbsent ? (
          <Text style={styles.notice} testID={`study-absent-${row.surah}-${row.verse}`}>
            {t('common:study.noEntryForVerse')}
          </Text>
        ) : null
      ) : (
        paragraphs.map((paragraph, index) => (
          <Text
            key={index}
            style={[
              styles.contentText,
              contentStyle,
              contentLanguage === 'ar' && styles.arabicProse,
            ]}
            testID={
              index === 0
                ? `study-content-${row.surah}-${row.verse}`
                : `study-content-${row.surah}-${row.verse}-${index}`
            }
          >
            {paragraph}
          </Text>
        ))
      )}
      {row.footnotes ? (
        <Text
          style={[styles.footnotes, contentStyle, contentLanguage === 'ar' && styles.arabicProse]}
          testID={`study-footnotes-${row.surah}-${row.verse}`}
        >
          {row.footnotes}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The grouped, searchable list of the sources a reader HAS — for when there are more than a chip
 * row can hold (story 8-4). Choosing one closes it.
 */
function SourceFinder({
  sources,
  selectedId,
  onChoose,
  height,
}: {
  sources: StudySource[];
  selectedId: string | null;
  onChoose: (id: string) => void;
  height: number;
}) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => buildPackGroups(sources, query, i18n.language),
    [sources, query, i18n.language]
  );
  return (
    <View style={styles.panel} testID="study-source-finder">
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('common:study.searchSources')}
        style={styles.panelSearch}
        testID="study-source-search"
      />
      <View style={{ height }}>
        {rows.length === 0 ? (
          <Text style={styles.notice} testID="study-source-no-matches">
            {t('common:study.noMatches')}
          </Text>
        ) : (
          <FlashList
            data={rows}
            keyExtractor={(row) =>
              row.kind === 'language' ? `language-${row.language}` : row.pack.id
            }
            getItemType={(row) => row.kind}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: PackListRow<StudySource> }) =>
              item.kind === 'language' ? (
                <LanguageHeading name={item.languageName} language={item.language} />
              ) : (
                <Pressable
                  onPress={() => onChoose(item.pack.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.pack.id === selectedId }}
                  accessibilityLabel={t('common:study.a11y.source', { title: item.pack.title })}
                  style={styles.action}
                  testID={`study-source-option-${item.pack.id}`}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      item.pack.id === selectedId && styles.optionSelected,
                      isRTLContent(item.pack.direction) ? styles.rtl : styles.ltr,
                    ]}
                  >
                    {item.pack.title}
                  </Text>
                </Pressable>
              )
            }
            testID="study-source-list"
          />
        )}
      </View>
    </View>
  );
}

/** A language group's heading: the language's OWN name, never translated. */
function LanguageHeading({ name, language }: { name: string; language: string }) {
  const styles = useStyles();
  return (
    <Text
      style={styles.groupLabel}
      accessibilityRole="header"
      testID={`study-language-${language}`}
    >
      {name}
    </Text>
  );
}

/**
 * The empty state, which is never an empty panel.
 *
 * ⚠️ IT SAYS WHICH TYPE IS MISSING AND OFFERS THE DOWNLOAD, AND THE CATALOGUE IS FETCHED ONLY
 * WHEN THE READER ASKS. `idle` is the state the frozen "opening the sheet touches no network"
 * constraint produces; it is neither `loading` (which would spin forever) nor `unavailable`
 * (which would tell a connected reader they are offline).
 *
 * ⚠️ AND THE OFFERS ARE A GROUPED, VIRTUALIZED LIST IN A BOUNDED BOX (story 8-4). 8-3 drew them as
 * a flat `map` inside a fixed-height panel — right for one French pack, and with 75 editions it
 * either clipped them or pushed the Arabic off the sheet. They are grouped by language, the
 * reader's own first, and searchable once there are more than a handful.
 */
function NoSourcePanel({
  typeLabel,
  offers,
  catalogue,
  onLoadCatalogue,
  onInstall,
  listHeight,
}: {
  typeLabel: string;
  offers: StudyOffer[];
  catalogue: ReturnType<typeof useStudySources>['catalogue'];
  onLoadCatalogue: () => void;
  onInstall: ReturnType<typeof useStudySources>['install'];
  listHeight: number;
}) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  // See the offer rows: "one install at a time" is the shelf's rule, and the reader has to see it.
  const busy = offers.some((offer) => offer.status === 'installing');
  const rows = useMemo(
    () => buildPackGroups(offers, query, i18n.language),
    [offers, query, i18n.language]
  );
  return (
    <View style={styles.panel} testID="study-no-source">
      <Text style={styles.panelTitle}>{t('common:study.noSource', { type: typeLabel })}</Text>

      {catalogue === 'idle' ? (
        <Pressable
          onPress={onLoadCatalogue}
          accessibilityRole="button"
          accessibilityLabel={t('common:study.getContent')}
          style={styles.action}
          testID="study-get-content"
        >
          <Text style={styles.actionLabel}>{t('common:study.getContent')}</Text>
        </Pressable>
      ) : null}

      {catalogue === 'loading' ? (
        <LoadingView size="small" testID="study-catalogue-loading" />
      ) : null}

      {catalogue === 'unavailable' ? (
        <InlineError
          message={t('common:study.catalogueOffline')}
          onRetry={onLoadCatalogue}
          retryLabel={t('common:study.retry')}
          testID="study-catalogue-error"
        />
      ) : null}

      {catalogue === 'ready' && offers.length === 0 ? (
        <Text style={styles.notice} testID="study-no-offers">
          {t('common:study.noOffers')}
        </Text>
      ) : null}

      {offers.length > OFFER_SEARCH_THRESHOLD ? (
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('common:study.searchSources')}
          style={styles.panelSearch}
          testID="study-offer-search"
        />
      ) : null}

      {offers.length > 0 ? (
        // A bounded box that shrinks to its content for a short list: `maxHeight`, and a list that
        // measures itself, so three offers do not leave a tall empty panel above the Arabic.
        <View style={{ height: Math.min(listHeight, estimatedHeight(rows)) }}>
          {rows.length === 0 ? (
            <Text style={styles.notice} testID="study-offer-no-matches">
              {t('common:study.noMatches')}
            </Text>
          ) : (
            <FlashList
              data={rows}
              keyExtractor={(row) =>
                row.kind === 'language' ? `language-${row.language}` : row.pack.id
              }
              getItemType={(row) => row.kind}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }: { item: PackListRow<StudyOffer> }) =>
                item.kind === 'language' ? (
                  <LanguageHeading name={item.languageName} language={item.language} />
                ) : (
                  <OfferRow offer={item.pack} busy={busy} onInstall={onInstall} />
                )
              }
              testID="study-offer-list"
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Roughly how tall a grouped list is — a heading line and an offer line are about the same. */
function estimatedHeight(rows: readonly unknown[]): number {
  return Math.max(rows.length, 1) * OFFER_ROW_ESTIMATE;
}
/** One heading or one offer line, at the body font with its padding. */
const OFFER_ROW_ESTIMATE = 36;

/**
 * One offer. It reads its OWN progress per key, so a tick re-renders this row and not the list
 * (`@/stores/packStore` § `usePackStatuses`).
 */
function OfferRow({
  offer,
  busy,
  onInstall,
}: {
  offer: StudyOffer;
  busy: boolean;
  onInstall: ReturnType<typeof useStudySources>['install'];
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  const progress = usePackProgress(offer.id);
  const running = offer.status === 'installing';
  return (
    <View>
      <Pressable
        onPress={() => onInstall(offer.pack)}
        /**
         * ⚠️ DISABLED WHILE **ANY** TRANSFER RUNS, NOT ONLY THIS ONE (story 8-3 review, S5).
         * `usePacks.install` enforces "one install at a time" by returning silently, so a press on
         * a second offer did nothing at all and said nothing at all — the reader cannot see the
         * first transfer from here, because this panel only ever draws the type they are on.
         */
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        accessibilityLabel={t('common:study.a11y.install', { title: offer.title })}
        style={[styles.action, busy && !running && styles.actionDim]}
        testID={`study-install-${offer.id}`}
      >
        <Text style={styles.actionLabel}>
          {running
            ? t('common:study.installing', {
                percent: formatQuranNumber(Math.round(progress * 100)),
              })
            : t('common:study.install', {
                title: isolate(offer.title),
                size: isolate(formatBytes(offer.bytes)),
              })}
        </Text>
      </Pressable>
      {/* ⚠️ THE REASON THE LAST ATTEMPT FAILED, WHICH THE SHEET USED TO SWALLOW (review S5). */}
      {offer.status === 'error' ? (
        <Text style={styles.notice} testID={`study-install-${offer.id}-failure`}>
          {t(`profile:content.failure.${offer.failure ?? 'failed'}`)}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    body: {
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
    },
    /**
     * ⚠️ A HORIZONTAL `ScrollView` IN A COLUMN GROWS TO FILL THE COLUMN UNLESS IT IS TOLD NOT TO,
     * and on a device that is exactly what it did: measured on the CloudQuran emulator, the two
     * chip rows each took a third of the sheet and pushed the Arabic below the fold, with two
     * empty bands where a reader expects the text. `flexGrow: 0` makes each row as tall as one
     * chip. Jest cannot see it — RNTL has no layout engine, so this is a device-only defect.
     */
    chipScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    /** See the `study-types` row: the scroller takes the full sheet width, `chipRow` re-insets. */
    chipBleed: {
      marginHorizontal: -SPACING.md,
    },
    /**
     * ⚠️ THE HORIZONTAL PADDING IS THE SCROLL INSET, AND ITS ABSENCE CLIPPED A CHIP FLUSH AGAINST
     * THE EDGE (owner, 1.5× system font scale, 2026-09-19). With the row exactly as wide as the
     * sheet, the overflowing chip was sliced by the container's own boundary with no gap before
     * it — which reads as a broken layout rather than as "there is more, scroll". An inset makes
     * the cut land inside the padding, so a partly-visible chip looks partly visible.
     *
     * ⚠️ IT IS ON THE **CONTENT CONTAINER**, NOT THE `ScrollView`. Padding on the scroller itself
     * shrinks the viewport and clips the same way one inset further in; on the content container
     * it becomes scrollable space, which is what a content inset is.
     */
    chipRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.xs,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
    },
    /** The list's box: everything above it is fixed height, so the remainder is the reading area. */
    content: {
      flex: 1,
      minHeight: 0,
    },
    list: {
      paddingBottom: SPACING.md,
    },
    entry: {
      gap: SPACING.xs,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    verseNumber: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.secondary,
      textAlign: TEXT_ALIGN_START,
    },
    arabic: {
      fontFamily: UTHMANI_FONT_FAMILY,
      fontSize: SHEET_ARABIC_FONT_SIZE,
      lineHeight: SHEET_ARABIC_FONT_SIZE * ARABIC_LINE_HEIGHT,
      color: theme.colors.text.primary,
    },
    /** An ayah marker inside a passage's Arabic: quiet, the theme's secondary text. */
    marker: {
      color: theme.colors.text.secondary,
    },
    /** The SELECTED ayah's marker: the theme accent, so the reader finds their place. */
    markerSelected: {
      color: theme.colors.accent.primary,
      fontWeight: FONT_WEIGHT.semibold,
    },
    arabicProse: {
      fontFamily: 'Amiri',
      fontSize: FONT_SIZE.body * 1.15,
      lineHeight: FONT_SIZE.body * 1.15 * 1.85,
    },
    contentText: {
      fontSize: FONT_SIZE.body,
      lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
      color: theme.colors.text.primary,
    },
    footnotes: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.secondary,
    },
    attribution: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.tertiary,
    },
    /** The credit's own box: never squeezed by the list (`flexShrink: 0`), scrolls if taller. */
    attributionBox: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: FONT_SIZE.caption * LINE_HEIGHT.body * 4,
    },
    attributionContent: {
      paddingBottom: SPACING.xs,
    },
    panelSearch: {
      paddingHorizontal: 0,
    },
    groupLabel: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.tertiary,
      textAlign: TEXT_ALIGN_START,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    optionLabel: {
      fontSize: FONT_SIZE.bodySmall,
      color: theme.colors.text.primary,
    },
    optionSelected: {
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.accent.primary,
    },
    notice: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.secondary,
      textAlign: TEXT_ALIGN_START,
    },
    panel: {
      gap: SPACING.sm,
      padding: SPACING.md,
      borderRadius: RADII.md,
      backgroundColor: theme.colors.background.secondary,
    },
    panelTitle: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.primary,
      textAlign: TEXT_ALIGN_START,
    },
    /** The session notice and its release control share one line — one subject, one row. */
    sessionRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: SPACING.sm,
    },
    action: {
      paddingVertical: SPACING.xs,
    },
    /** A control that is live but not YET pressable — the other transfer owns the shelf. */
    actionDim: {
      opacity: OPACITY.disabled,
    },
    actionLabel: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.accent.primary,
      textAlign: TEXT_ALIGN_START,
    },
    /** Direction is the CONTENT's, not the interface's — the repo-wide content-site rule. */
    /**
     * ⚠️ `'auto'`, NOT `TEXT_ALIGN_START` — MEASURED IN ARABIC ON AN EMULATOR, 2026-09-19.
     * `TEXT_ALIGN_START` is `'left'`, and under a forced-RTL layout React Native resolves that to
     * the INTERFACE's start edge — the right. So with the app in Arabic the French translation
     * rendered flush RIGHT and ragged LEFT: every line ending at the same edge, each one starting
     * somewhere different, which is how a Latin paragraph is never set. It is the same mistake
     * `isRTLContent` fixed one field over — a CONTENT value taking the interface's answer
     * — and it is invisible in an English build, where the two answers coincide.
     *
     * `'auto'` aligns by the text's OWN resolved direction on all three platforms: natural
     * alignment against the `writingDirection` above on iOS, first-strong-character direction on
     * Android, and `start` in an unmirrored document on web. The `rtl` pair below keeps its
     * explicit `'right'`, which is the rule `lib/rtl.ts` states for Quran content.
     */
    ltr: {
      writingDirection: 'ltr' as const,
      textAlign: contentTextAlign(false),
    },
    rtl: {
      writingDirection: 'rtl' as const,
      textAlign: contentTextAlign(true),
    },
  }));
