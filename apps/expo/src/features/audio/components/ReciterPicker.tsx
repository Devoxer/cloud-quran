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
 * Grouping and filtering are `buildReciterRows`, exported and unit-tested as a pure function —
 * a rendered list can only be asserted one row at a time, and the property that matters here is
 * the ORDER of all of them.
 */

import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { EmptyState, Icon, SearchBar, SettingsRow } from '@/components/ui';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { haptics } from '@/lib/haptics';
import { patchPreferences, usePreferences } from '@/lib/sync';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  RECITER_STYLES,
  RECITERS,
  type Reciter,
  type ReciterStyle,
  resolveReciterId,
} from '../data/reciters';

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

export function ReciterPicker() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const { data: preferences } = usePreferences();
  const [query, setQuery] = useState('');

  const storedId = preferences?.reciterId;
  const selectedId = resolveReciterId(storedId);
  const rows = useMemo(() => buildReciterRows(query), [query]);

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
        <Text style={styles.groupLabel} testID={`reciter-style-${item.style}`}>
          {t(`player:reciters.styles.${item.style}`)}
        </Text>
      );
    }
    const { reciter } = item;
    const selected = reciter.id === selectedId;
    return (
      <SettingsRow
        // The names are DATA, not copy — a reciter is called what he is called in every locale.
        label={reciter.nameEnglish}
        description={reciter.nameArabic}
        // ⚠️ `selected` is what carries the choice to VoiceOver and TalkBack. The checkmark glyph
        // below has no semantics of its own, so without this an assistive-tech reader cannot tell
        // which of 39 rows is the one in force.
        selected={selected}
        trailing={
          selected ? <Icon name="checkmark" size={20} color={colors.accent.primary} /> : undefined
        }
        onPress={() => choose(reciter.id)}
        testID={`reciter-row-${reciter.id}`}
      />
    );
  };

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
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            testID="reciter-list"
          />
        )}
      </View>
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
    listContent: {
      paddingBottom: SPACING.xl,
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
  }));
