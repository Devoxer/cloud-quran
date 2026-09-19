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
 */

import { FlashList } from '@shopify/flash-list';
import { SURAH_METADATA } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet, Chip, InlineError, LoadingView, SegmentedControl } from '@/components/ui';
import { ARABIC_LINE_HEIGHT, stripDisplayMarks, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { OPACITY } from '@/constants/opacity';
import { PACKS_SESSION_ONLY } from '@/constants/packs';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { formatBytes, isolate, useQuranNumerals } from '@/lib/format';
import { contentTextAlign, isRTLContentLanguage, TEXT_ALIGN_START } from '@/lib/rtl';
import { surahDisplayName } from '@/lib/surahName';
import type { VersePair } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { type StudyRow, useStudyContent } from '../hooks/useStudyContent';
import { type StudyOffer, useStudySources } from '../hooks/useStudySources';
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

  const range = useMemo(() => resolveScope(scope, verse), [scope, verse]);
  const { state, retry } = useStudyContent(range, sourceId);

  /**
   * ⚠️ A BARE AYAH NUMBER IS AMBIGUOUS THE MOMENT THE RANGE CROSSES A SURAH (owner, on an iPhone,
   * 2026-09-19). Mushaf page 221 is `10:107 → 11:5`: Yunus ends and Hud begins, so the sheet drew
   * "1" for Hud 11:1 under a chrome that says يونس, with nothing anywhere saying which surah that
   * "1" belonged to. Page scope crosses a surah on ~110 of the 604 pages; surah scope never does,
   * and neither does ayah scope — so the SURAH IS SHOWN ONLY WHEN IT IS IN QUESTION, and the
   * common case stays as quiet as it was.
   */
  const crossesSurahs = range.from.surah !== range.to.surah;
  const rowLabel = (row: StudyRow): string => {
    const verseNumber = formatQuranNumber(row.verse);
    if (!crossesSurahs) return verseNumber;
    const name =
      surahDisplayName(SURAH_METADATA[row.surah - 1]) ??
      t('common:bookmarks.surahFallback', { number: formatQuranNumber(row.surah) });
    // The surah name is CONTENT beside a number — isolated so the separator cannot reorder
    // around it once the catalogue carries a right-to-left title (`lib/format.ts` § isolate).
    return t('common:study.rowLabel', { name: isolate(name), verse: verseNumber });
  };

  const chooseSource = useCallback(
    (id: string) => setChosen((current) => ({ ...current, [type]: id })),
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

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('common:study.title')}
      snapPoints={SHEET_SNAP_POINTS}
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

        {/* Only when there is a choice to make: one source names itself in the attribution. */}
        {readable.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.chipScroll, styles.chipBleed]}
            contentContainerStyle={styles.chipRow}
            testID="study-sources"
          >
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
            percentOf={formatQuranNumber}
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
                  contentLanguage={source?.language ?? null}
                  verseLabel={rowLabel(item)}
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

        {/* Required by the pack's grant, rendered WITH its text rather than buried. */}
        {source && source.attribution.length > 0 ? (
          <Text
            style={[
              styles.attribution,
              isRTLContentLanguage(source.language) ? styles.rtl : styles.ltr,
            ]}
            testID="study-attribution"
          >
            {source.attribution}
          </Text>
        ) : null}
        {/* ⚠️ THE ONLY WAY TO LET A HELD SOURCE GO (story 8-3 review, C6). `/content` returns early
            on web, so `usePacks.remove` was unreachable there — a reader who tried three sources
            held all three in the JS heap, up to 32 MB each, until they reloaded the page. It is
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

/** One ayah: the Quran, then what the source says about it. */
function StudyEntry({
  row,
  contentLanguage,
  verseLabel,
  saysAbsent,
}: {
  row: StudyRow;
  contentLanguage: string | null;
  verseLabel: string;
  /** Whether "this source has nothing here" is worth saying — see the call site. */
  saysAbsent: boolean;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const contentStyle = isRTLContentLanguage(contentLanguage) ? styles.rtl : styles.ltr;
  return (
    <View style={styles.entry} testID={`study-entry-${row.surah}-${row.verse}`}>
      <Text style={styles.verseNumber}>{verseLabel}</Text>
      {/* ⚠️ THE ARABIC SETS ITS OWN DIRECTION AT THE DRAW SITE — web is deliberately not mirrored
          (`lib/rtl.ts`), so every content site in this repo does this locally. `stripDisplayMarks`
          is the measured KFGQPC U+06DF defect; the stored text is never touched. */}
      <Text style={[styles.arabic, styles.rtl]} testID={`study-arabic-${row.surah}-${row.verse}`}>
        {stripDisplayMarks(row.arabic)}
      </Text>
      {row.content === null ? (
        saysAbsent ? (
          <Text style={styles.notice} testID={`study-absent-${row.surah}-${row.verse}`}>
            {t('common:study.noEntryForVerse')}
          </Text>
        ) : null
      ) : (
        <Text
          style={[styles.contentText, contentStyle]}
          testID={`study-content-${row.surah}-${row.verse}`}
        >
          {row.content}
        </Text>
      )}
      {row.footnotes ? (
        <Text
          style={[styles.footnotes, contentStyle]}
          testID={`study-footnotes-${row.surah}-${row.verse}`}
        >
          {row.footnotes}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The empty state, which is never an empty panel.
 *
 * ⚠️ IT SAYS WHICH TYPE IS MISSING AND OFFERS THE DOWNLOAD, AND THE CATALOGUE IS FETCHED ONLY
 * WHEN THE READER ASKS. `idle` is the state the frozen "opening the sheet touches no network"
 * constraint produces; it is neither `loading` (which would spin forever) nor `unavailable`
 * (which would tell a connected reader they are offline).
 */
function NoSourcePanel({
  typeLabel,
  offers,
  catalogue,
  onLoadCatalogue,
  onInstall,
  percentOf,
}: {
  typeLabel: string;
  offers: StudyOffer[];
  catalogue: ReturnType<typeof useStudySources>['catalogue'];
  onLoadCatalogue: () => void;
  onInstall: ReturnType<typeof useStudySources>['install'];
  percentOf: (value: number) => string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  // See the offer rows: "one install at a time" is the shelf's rule, and the reader has to see it.
  const busy = offers.some((offer) => offer.status === 'installing');
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

      {offers.map((offer) => {
        const running = offer.status === 'installing';
        return (
          <View key={offer.id}>
            <Pressable
              onPress={() => onInstall(offer.pack)}
              /**
               * ⚠️ DISABLED WHILE **ANY** TRANSFER RUNS, NOT ONLY THIS ONE (story 8-3 review, S5).
               * `usePacks.install` enforces "one install at a time" by returning silently, so a
               * press on a second offer did nothing at all and said nothing at all — the reader
               * cannot see the first transfer from here, because this panel only ever draws the
               * type they are looking at.
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
                      percent: percentOf(Math.round(offer.progress * 100)),
                    })
                  : t('common:study.install', {
                      title: isolate(offer.title),
                      size: isolate(formatBytes(offer.bytes)),
                    })}
              </Text>
            </Pressable>
            {/* ⚠️ THE REASON THE LAST ATTEMPT FAILED, WHICH THE SHEET USED TO SWALLOW (review S5).
                A digest mismatch, a dead network and a pack too large to verify all re-rendered as
                a plain "Get {title}", so the reader pressed it again and was told nothing —
                `/content` has had four distinct sentences for exactly these states since 8-2. */}
            {offer.status === 'error' ? (
              <Text style={styles.notice} testID={`study-install-${offer.id}-failure`}>
                {t(`profile:content.failure.${offer.failure ?? 'failed'}`)}
              </Text>
            ) : null}
          </View>
        );
      })}
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
     * `isRTLContentLanguage` fixed one field over — a CONTENT value taking the interface's answer
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
