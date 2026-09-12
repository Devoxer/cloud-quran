/**
 * ReciterPicker — the voice surface: 39 reciters, grouped by style, one of them chosen
 * (story 7-2).
 *
 * ⚠️ IT RENDERS NO HEADER, AND THAT IS THE SHELL'S JOB. The `(profile)` group mounts `AppHeader`
 * + `AppTabBar` ONCE, above the navigator (story 6-6), with the title resolved from the focused
 * segment's entry in that layout's `TITLE_KEYS`. A header here would draw a second bar under the
 * first. `lint:header-controls` forbids the native slots outright, so there is no third option.
 *
 * ⚠️ THE CHOICE IS `preferences.reciterId`, WRITTEN THROUGH `patchPreferences` — one value, not
 * two. There is no device-local reciter setting beside the synced one: the engine reads the same
 * preference through `RecitationEngineHost`, so the write is the whole mechanism and a second
 * device learns the choice on its next pull. The wire format has no partial update, which is why
 * this goes through `patchPreferences` (query cache → MMKV → defaults) rather than
 * `setPreferences`.
 *
 * ⚠️ THE SAME-VALUE GUARD COMPARES AGAINST THE STORED ROW, NEVER AGAINST THE RESOLVED SELECTION.
 * `selectedId` is `resolveReciterId(row)`, so a row holding a withdrawn or foreign id (`'nope'`)
 * shows Al-Afasy as chosen — and a guard written against `selectedId` would then refuse to write
 * when the reader taps Al-Afasy, leaving the bad row unrepairable from the one screen that could
 * fix it. That is the appearance picker's measured defect, in a different costume: comparing
 * against what the SERVER holds is what makes a disagreement self-heal. (`appearance.tsx`'s
 * `mirror`.)
 *
 * ⚠️ A SELECTION DOES NOT POP. Choosing a voice mid-listen re-plays the current ayah in it
 * (`useRecitationEngine`'s switch), so the reader is one tap from hearing the difference and
 * another tap from trying the next one. Popping would make comparing two reciters a four-tap
 * round trip through Settings.
 *
 * ⚠️ THE DOWNLOADED INDICATOR (story 7-5, deferred here by 7-2) IS READ FROM DISK, NOT FROM THE
 * QUEUE STORE. The store mirrors ONE reciter at a time — whichever surface hydrated it last —
 * while this list asks a question about all 39 at once, and a mirror that has only ever been
 * seeded for the current voice would report every other reciter as empty. One listing of
 * `{document}/audio` answers all of them.
 *
 * ⚠️ IT REFRESHES ON THE COUNT OF *KEPT* SURAHS, AND THE FIRST CUT KEYED ON THE WRONG THING. The
 * total entry count moves when a download is QUEUED (no file yet) and does NOT move when one
 * COMPLETES (a status change on a key that already existed) — so a reciter's first kept surah
 * never lit its indicator while this screen stayed mounted, and a queue lit it before a byte had
 * landed. Wrong in both directions. `useDownloadedCount` counts `downloaded` rows, which is
 * exactly "a file was added or removed". (Story 7-5 review, P12.)
 *
 * ⚠️ AND THE RE-READ IS DEBOUNCED, BECAUSE THIS LIST SHARES A SCREEN WITH "DOWNLOAD ALL". The
 * listing walks the audio root and every reciter directory under it; keyed straight on the count
 * it ran once per completed surah — 114 times on the JS thread, during the one operation the
 * reader most wants to stay responsive. (Story 7-5 review, P13.)
 *
 * ⚠️ THE FOOTER IS THE CALLER'S, AND THAT IS WHAT KEEPS THE SHEET CLEAN. The recitation screen
 * hands it `DownloadStorage` (what every voice costs on disk, plus a withdrawn voice's
 * leftovers); `ReciterSheet` hands it nothing, because a voice switch mid-listen is not a
 * storage screen. See `listFooter`.
 *
 * Grouping and filtering are `buildReciterRows`, exported and unit-tested as a pure function —
 * a rendered list can only be asserted one row at a time, and the property that matters here is
 * the ORDER of all of them.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  ConfirmDialog,
  EmptyState,
  Icon,
  InlineError,
  SearchBar,
  SettingsRow,
} from '@/components/ui';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { patchPreferences, usePreferences } from '@/lib/sync';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useDownloadedCount } from '@/stores/downloadQueueStore';
import {
  RECITER_STYLES,
  RECITERS,
  type Reciter,
  type ReciterStyle,
  resolveReciterId,
} from '../data/reciters';
import { useDownloadAllPrompt } from '../hooks/useDownloadAllPrompt';
import { DOWNLOADS_SUPPORTED, reciterDownloadCounts } from '../lib/audioDownloads';
import { ReciterDownloadButton } from './ReciterDownloadButton';

/** One entry of the flat list: a style heading, or a reciter under it. */
export type ReciterRow =
  | { kind: 'style'; style: ReciterStyle }
  | { kind: 'reciter'; reciter: Reciter };

/**
 * Fold a query or a name down to what a match should ignore.
 *
 * ⚠️ THE DIACRITIC STRIP IS THE LATIN SIDE ONLY, BY CONSTRUCTION. `U+0300–U+036F` is Combining
 * Diacritical Marks — the block that carries `é`, `ā`, `ḥ` once NFD has split them off their
 * base letter. Arabic harakat live in `U+064B–U+065F` and are untouched, which is correct: they
 * are part of how an Arabic name is written, not an accent over it, and folding them would make
 * the Arabic side match things it should not.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Whether this reciter answers to `query` — by English name, Arabic name, or catalogue id.
 *
 * ⚠️ THE ARABIC SIDE IS FOLDED TOO, AND SKIPPING IT BROKE SEVEN NAMES. `fold` runs NFD, which
 * decomposes أ (U+0623) into ا + U+0654 — and U+0654 sits ABOVE the stripped U+0300–U+036F range,
 * so it survives. Comparing that decomposed needle against the catalogue's NFC-composed
 * `nameArabic` could never match: typing أحمد returned the empty state for Ahmed Al-Ajmi, and the
 * same for Abu Bakr Al-Shatri, Ahmed Neana, Akram Al-Alaqimy, Ayman Sowaid, Ibrahim Akhdar and
 * Muhammad Ayyoub — 7 of 39. Both sides go through the same fold, so the forms agree by
 * construction rather than by luck of which letters a name happens to use.
 */
function matches(reciter: Reciter, query: string): boolean {
  if (query === '') return true;
  return (
    fold(reciter.nameEnglish).includes(query) ||
    fold(reciter.id).includes(query) ||
    fold(reciter.nameArabic).includes(query)
  );
}

/**
 * The list, grouped and filtered — murattal, then mujawwad, then muallim.
 *
 * A style whose reciters all filter out drops its heading with them: a heading over nothing reads
 * as a loading row rather than as an absence.
 */
export function buildReciterRows(query: string): ReciterRow[] {
  const needle = fold(query);
  const rows: ReciterRow[] = [];
  for (const style of RECITER_STYLES) {
    const group = RECITERS.filter((reciter) => reciter.style === style && matches(reciter, needle));
    if (group.length === 0) continue;
    rows.push({ kind: 'style', style });
    for (const reciter of group) rows.push({ kind: 'reciter', reciter });
  }
  return rows;
}

/**
 * How long the disk listing waits for a draining queue to stop moving. See the docblock.
 *
 * Zero would be correct and unaffordable; a few hundred milliseconds is imperceptible on a mark
 * whose whole job is to say "this voice has something kept".
 */
const INDICATOR_REFRESH_DEBOUNCE_MS = 400;

export interface ReciterPickerProps {
  /**
   * Rendered after the last reciter, inside the list's own scroll.
   *
   * ⚠️ A PROP, NOT SOMETHING THIS COMPONENT DECIDES. The picker has two hosts: the recitation
   * screen, where the footer carries what every voice costs on disk, and `ReciterSheet`, which
   * is a quick voice switch and has no business showing a storage figure. A hardcoded footer
   * would put one in the sheet; a `Platform`/route test in here would be this component
   * guessing at its caller.
   */
  listFooter?: ReactNode;
}

export function ReciterPicker({ listFooter }: ReciterPickerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { data: preferences } = usePreferences();
  const [query, setQuery] = useState('');

  const storedId = preferences?.reciterId;
  const selectedId = resolveReciterId(storedId);
  const rows = useMemo(() => buildReciterRows(query), [query]);

  // Kept surahs across every reciter: the value that changes exactly when a file is added or
  // removed, and never on a progress tick or a queueing. Debounced — see the docblock.
  const downloadedCount = useDownloadedCount();
  const [keptCounts, setKeptCounts] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    const timer = setTimeout(
      () => setKeptCounts(reciterDownloadCounts()),
      INDICATOR_REFRESH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [downloadedCount]);

  // The estimate-then-confirm gate, ONE instance for 39 rows — see `useDownloadAllPrompt`.
  const prompt = useDownloadAllPrompt();

  const choose = (id: string) => {
    // Against the STORED value, not `selectedId` — see the docblock. Tapping the voice the row
    // already names is the one case worth skipping; tapping the default while the row holds an
    // unknown id must still write, because that write is the repair.
    if (id === storedId) return;
    haptics.selection();
    patchPreferences({ reciterId: id });
  };

  const renderRow = ({ item }: { item: ReciterRow }) => {
    if (item.kind === 'style') {
      return (
        <View testID={`reciter-style-${item.style}`}>
          <Text style={styles.groupLabel}>{t(`player:reciters.styles.${item.style}`)}</Text>
          {/* ⚠️ THE GLOSS IS THE POINT OF THE HEADING. Murattal / Mujawwad / Muallim are the
              ONLY structure in a 39-row list, and they are technical Arabic terms — correctly
              left untranslated, which also means a reader who does not already know them learns
              nothing from the divider. One line each says what the grouping is for. */}
          <Text style={styles.groupGloss}>{t(`player:reciters.styleGloss.${item.style}`)}</Text>
        </View>
      );
    }
    const { reciter } = item;
    const selected = reciter.id === selectedId;
    const kept = keptCounts.get(reciter.id) ?? 0;
    return (
      <View style={styles.row} testID={`reciter-row-${reciter.id}-container`}>
        <SettingsRow
          // The names are DATA, not copy — a reciter is called what he is called in every locale.
          label={reciter.nameEnglish}
          description={reciter.nameArabic}
          // ⚠️ `selected` is what carries the choice to VoiceOver and TalkBack. The checkmark
          // glyph below has no semantics of its own, so without this an assistive-tech reader
          // cannot tell which of 39 rows is the one in force.
          selected={selected}
          trailing={
            selected ? <Icon name="checkmark" size={20} color={colors.accent.primary} /> : undefined
          }
          onPress={() => choose(reciter.id)}
          style={styles.rowFlex}
          testID={`reciter-row-${reciter.id}`}
        />
        {/* ⚠️ SIBLINGS OF THE ROW, NEVER INSIDE ITS `trailing` SLOT — that slot renders inside
            the row's own Pressable, which on web is a real `<button>`. See
            `ReciterDownloadButton`'s docblock for the measured nesting defect. */}
        <ReciterDownloadButton
          reciterId={reciter.id}
          reciterName={reciter.nameEnglish}
          keptCount={kept}
          estimating={prompt.estimatingId === reciter.id}
          onDownloadAll={() => prompt.ask(reciter.id)}
          testID={`reciter-download-${reciter.id}`}
        />
        {!DOWNLOADS_SUPPORTED ? null : (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/reciter-downloads', params: { id: reciter.id } })
            }
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('player:download.reciterOpenA11y', { name: reciter.nameEnglish })}
            style={({ pressed }) => [styles.chevron, pressed ? styles.pressed : null]}
            testID={`reciter-open-${reciter.id}`}
          >
            <Icon name="chevron-forward" size={18} color={colors.text.tertiary} />
          </Pressable>
        )}
      </View>
    );
  };

  const refusalMessage =
    prompt.refusal === null
      ? null
      : prompt.refusal.kind === 'space'
        ? t('player:download.noSpace', { size: formatBytes(prompt.refusal.bytes) })
        : t('player:download.estimateFailed');

  return (
    <View style={styles.screen} testID="reciter-picker">
      <View style={styles.content}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('player:reciters.searchPlaceholder')}
          style={styles.search}
          testID="reciter-search"
        />
        {/* ⚠️ ABOVE THE LIST, NOT UNDER THE ROW THAT WAS PRESSED. A FlashList recycles rows, so a
            message attached to one would ride onto a different reciter on the next scroll. */}
        {refusalMessage === null ? null : (
          <InlineError
            message={refusalMessage}
            style={styles.refusal}
            testID="reciter-download-refused"
          />
        )}
        {rows.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t('player:reciters.emptyTitle')}
            description={t('player:reciters.emptyBody')}
            fullScreen
            testID="reciter-empty"
          />
        ) : (
          <FlashList
            data={rows}
            renderItem={renderRow}
            keyExtractor={(item) =>
              item.kind === 'style' ? `style-${item.style}` : item.reciter.id
            }
            // Headings and rows are different heights; FlashList recycles per type.
            getItemType={(item) => item.kind}
            ListFooterComponent={
              listFooter === undefined ? null : <View style={styles.footer}>{listFooter}</View>
            }
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            testID="reciter-list"
          />
        )}
      </View>
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
  useThemedStyles((t) => ({
    screen: {
      flex: 1,
      backgroundColor: t.colors.background.primary,
    },
    content: {
      ...screenContentStyle('content'),
      flex: 1,
    },
    search: {
      paddingVertical: SPACING.sm,
    },
    refusal: {
      marginBottom: SPACING.sm,
    },
    // The row and its two controls, side by side. `paddingEnd` replaces the inset the row
    // used to own; on web, where both controls are absent, it would just be missing inset.
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingEnd: DOWNLOADS_SUPPORTED ? SPACING.sm : 0,
    },
    rowFlex: {
      flex: 1,
    },
    chevron: {
      padding: SPACING.xs,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    pressed: {
      opacity: 0.6,
    },
    listContent: {
      paddingBottom: SPACING.xl,
    },
    // The list's rows carry their own 16pt inset (`SettingsRow`); a card in the footer needs
    // the same rail drawn for it.
    footer: {
      paddingTop: SPACING.lg,
      paddingHorizontal: SPACING.lg,
    },
    // The grouped-list caption treatment, matching `SettingsGroup`'s section label.
    groupLabel: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.xs,
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
      color: t.colors.text.tertiary,
    },
    // Sentence case under the caps heading — the caption treatment, without the caps.
    groupGloss: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
      fontSize: FONT_SIZE.caption,
      color: t.colors.text.tertiary,
    },
  }));
