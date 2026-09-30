/**
 * Content — the shelf of installable content packs (story 8-2).
 *
 * ⚠️ 75 EDITIONS IN 56 LANGUAGES (story 8-4), SO IT IS A SEARCHABLE, LANGUAGE-GROUPED, VIRTUALIZED
 * LIST. Story 8-2 shipped one pack and a `ScrollView` over `rows.map`; that shape mounted every
 * card at once and offered no way to find Urdu among dozens. The grouping and the search are
 * `buildPackGroups` (pure, tested on its order), rendered by a `FlashList` — `ReciterPicker`'s
 * shape, reused rather than reinvented.
 *
 * ⚠️ WEB SAYS SO RATHER THAN OFFERING A DEAD CONTROL. `PACKS_SUPPORTED` is false there —
 * `expo-file-system` has nowhere to put a downloaded database and `openDatabaseAsync`'s
 * `directory` argument is explicitly unsupported — so a rendered Install button would take the
 * reader's press and do nothing at all. `features/audio` answers the same question the same way.
 *
 * ⚠️ NEITHER ABSENCE IS AN ERROR SCREEN, AND THE TWO ARE DIFFERENT. An unreachable CATALOGUE
 * degrades to "installed only": every installed pack still lists, still reads, still deletes. An
 * unreadable DISK degrades to "we cannot say what you have" — which must NOT render as "Install",
 * because that is the believable-wrong-value the `null`-is-not-`[]` rule exists to prevent.
 * (Story 8-2 review, C2.)
 *
 * ⚠️ THE TITLE AND THE ATTRIBUTION ARE RENDERED AS THE PACK'S OWN TEXT, WITH THE PACK'S OWN
 * DIRECTION — taken from the pack's `direction` field (story 8-4), never from a language list and
 * never from the interface. This repo sets content direction locally at every content site
 * because web is deliberately not mirrored. The attribution is a sibling of the card rather than
 * a `SettingsRow` `description`, which takes a plain string and no style. (Story 8-2 review, S6.)
 *
 * ⚠️ THE ONE-AYAH PREVIEW IS GONE (story 8-4). It was read out of every installed pack on every
 * mount — which is what forced every installed pack OPEN. A pack is read in the study sheet now,
 * and opened only there.
 */

import { FlashList } from '@shopify/flash-list';
import type { TFunction } from 'i18next';
import { BUNDLED_TRANSLATION } from 'quran-data';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { EmptyState, LoadingView, SearchBar, SettingsGroup, SettingsRow } from '@/components/ui';
import { PACKS_SUPPORTED } from '@/constants/packs';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { buildPackGroups, type PackListRow, type PackRow, usePacks } from '@/features/packs';
import { formatBytes, isolate, useQuranNumerals } from '@/lib/format';
import { contentTextAlign, isRTLContent, TEXT_ALIGN_START } from '@/lib/rtl';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { usePackProgress } from '@/stores/packStore';

export default function ContentScreen() {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  const [query, setQuery] = useState('');
  // ⚠️ `deferCatalogue` ON WEB, BECAUSE THIS SCREEN DOES NOT RENDER A SHELF THERE. Story 8-3 made
  // `usePacks` platform-uniform, so without this the web build would fetch the catalogue to draw
  // a single sentence. Native is unchanged and fetches eagerly.
  const { rows, catalogue, disk, installedBytes, install, cancel, remove, refresh } = usePacks({
    deferCatalogue: !PACKS_SUPPORTED,
  });
  const listRows = useMemo(
    () => buildPackGroups(rows, query, i18n.language),
    [rows, query, i18n.language]
  );

  if (!PACKS_SUPPORTED) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <SettingsGroup testID="content-unsupported">
          <SettingsRow
            icon="information-circle-outline"
            label={t('profile:content.webUnsupported')}
          />
        </SettingsGroup>
        <BundledGroup />
      </ScrollView>
    );
  }

  const installedCount = rows.filter((row) => row.installedVersion !== null).length;

  // ⚠️ A FIRST ARRIVAL IS NOT A BLANK SCREEN. With nothing installed and the catalogue still in
  // flight there was literally nothing on the page — no title, no spinner, no explanation — for
  // the whole of a cold fetch. (Story 8-2 review, S3.)
  if (rows.length === 0 && (catalogue === 'loading' || disk === 'loading')) {
    return (
      <View style={styles.container} testID="content-screen">
        <LoadingView testID="content-loading" />
      </View>
    );
  }

  /**
   * ⚠️ EVERYTHING ABOVE THE PACKS IS THE LIST'S HEADER, SO IT SCROLLS AWAY WITH THEM. The status
   * notes and the bundled English are a handful of rows; the packs are 75, and on a phone a fixed
   * block above a virtualized list would leave it a sliver of the screen.
   */
  const header = (
    <View style={styles.header}>
      {installedCount > 0 && disk === 'ready' ? (
        <SettingsGroup testID="content-storage">
          <SettingsRow
            icon="folder-outline"
            /**
             * ⚠️ `count` STAYS A NUMBER AND `number` IS WHAT IS DRAWN (story 8-3 review, D5b).
             * i18next selects the plural from `count`, so formatting it would hand the selector a
             * string and collapse six Arabic categories to one — but leaving it as the DISPLAYED
             * value bypassed the reader's numeral preference, which the percent on an installing
             * row has respected since 8-2. Two interpolations, one for the grammar and one for
             * the glyphs.
             */
            label={t('profile:content.storage', {
              count: installedCount,
              number: formatQuranNumber(installedCount),
              size: isolate(formatBytes(installedBytes)),
            })}
            testID="content-storage-total"
          />
        </SettingsGroup>
      ) : null}

      {/* ⚠️ A NEUTRAL ROW, NOT AN `InlineError`. Being offline is the ordinary state of a reader on
          a plane, which is the state this whole app is built for — drawing it in the destructive
          red the error primitive uses tells them something has gone wrong when nothing has. It
          still carries the retry, because the one action available is to try again. */}
      {catalogue === 'unavailable' ? (
        <SettingsGroup testID="content-offline">
          <SettingsRow
            icon="cloud-offline-outline"
            label={t('profile:content.offline')}
            trailing={t('profile:content.retryCatalogue')}
            onPress={refresh}
            testID="content-offline-retry"
          />
        </SettingsGroup>
      ) : null}

      {disk === 'unavailable' ? (
        <SettingsGroup testID="content-disk-unavailable">
          <SettingsRow
            icon="folder-outline"
            label={t('profile:content.diskUnavailable')}
            trailing={t('profile:content.retryCatalogue')}
            onPress={refresh}
            testID="content-disk-retry"
          />
        </SettingsGroup>
      ) : null}

      {rows.length === 0 && catalogue === 'ready' ? (
        <SettingsGroup testID="content-empty">
          <SettingsRow icon="library-outline" label={t('profile:content.empty')} />
        </SettingsGroup>
      ) : null}

      <BundledGroup />

      {rows.length > 0 ? (
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('profile:content.searchPlaceholder')}
          style={styles.search}
          testID="content-search"
        />
      ) : null}
      {rows.length > 0 && listRows.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={t('profile:content.noMatchesTitle')}
          description={t('profile:content.noMatchesBody')}
          testID="content-no-matches"
        />
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: PackListRow<PackRow> }) => {
    if (item.kind === 'language') {
      return (
        <Text
          style={styles.languageLabel}
          accessibilityRole="header"
          testID={`content-language-${item.language}`}
        >
          {/* The language's OWN name, never translated: a reader who does not read the interface
              language still recognises "اردو" or "Kiswahili". */}
          {item.languageName}
        </Text>
      );
    }
    return (
      <PackCard row={item.pack} t={t} onInstall={install} onCancel={cancel} onRemove={remove} />
    );
  };

  /**
   * ⚠️ A `FlashList`, WITH `getItemType`, BECAUSE THE SHELF IS 75 EDITIONS NOW (story 8-4). The
   * 8-2 screen was a `ScrollView` over `rows.map` — every card mounted at once, which is fine for
   * one pack and a visible stutter for 75 cards of four rows each. Headings and cards differ in
   * height, and FlashList recycles per type — `ReciterPicker`'s recorded shape.
   */
  return (
    <View style={styles.container} testID="content-screen">
      <FlashList
        data={listRows}
        renderItem={renderItem}
        keyExtractor={(item) =>
          item.kind === 'language' ? `language-${item.language}` : item.pack.id
        }
        getItemType={(item) => item.kind}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        testID="content-list"
      />
    </View>
  );
}

/**
 * The English the app ships inside `quran.db` (story 8-4) — QuranEnc's `english_rwwad`.
 *
 * ⚠️ IT IS HERE BECAUSE THE GRANT ASKS FOR A CREDIT AND A VERSION, AND THIS TEXT HAS NO PACK ROW TO
 * CARRY THEM. It is what search matches English against on a fresh install with no network, so it
 * is not installable or removable; it is simply stated, with its attribution, beside the packs.
 */
function BundledGroup() {
  const { t } = useTranslation();
  const styles = useStyles();
  const contentStyle = isRTLContent(BUNDLED_TRANSLATION.direction)
    ? styles.contentRtl
    : styles.contentLtr;
  return (
    <View testID="content-bundled">
      <SettingsGroup label={t('profile:content.bundled.label')}>
        <SettingsRow
          icon="book-outline"
          label={BUNDLED_TRANSLATION.title}
          description={t('profile:content.bundled.description')}
          testID="content-bundled-row"
        />
      </SettingsGroup>
      <Text style={[styles.attribution, contentStyle]} testID="content-bundled-attribution">
        {BUNDLED_TRANSLATION.attribution}
      </Text>
    </View>
  );
}

interface PackCardProps {
  row: PackRow;
  /** The screen's own `t`, passed down so the card is a pure function of its props. */
  t: TFunction;
  onInstall: ReturnType<typeof usePacks>['install'];
  onCancel: ReturnType<typeof usePacks>['cancel'];
  onRemove: ReturnType<typeof usePacks>['remove'];
}

/**
 * One pack. MEMOISED, and it reads its own progress PER KEY, so a progress tick re-renders this
 * card and no other (`@/stores/packStore` § `usePackStatuses`).
 */
const PackCard = memo(function PackCard({ row, t, onInstall, onCancel, onRemove }: PackCardProps) {
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  const progress = usePackProgress(row.id);
  // ⚠️ THE PACK'S OWN DIRECTION, FROM ITS OWN DATA (story 8-4) — its title, attribution and any
  // text are content in the pack's language, not UI copy in the reader's. See `lib/rtl.ts`.
  const contentStyle = isRTLContent(row.direction) ? styles.contentRtl : styles.contentLtr;
  return (
    <View style={styles.card} testID={`content-pack-${row.id}`}>
      {/* ⚠️ THE TITLE IS THE PACK'S OWN TEXT TOO (story 8-3 review, D5c). */}
      <SettingsGroup label={row.title} labelStyle={contentStyle}>
        <SettingsRow
          icon="document-text-outline"
          /* A language's own endonym and a figure-plus-unit, either side of a neutral
             separator — `lib/format.ts` § isolate for why both are wrapped. */
          label={t('profile:content.facts', {
            language: isolate(row.languageName),
            size: isolate(formatBytes(row.bytes)),
          })}
          testID={`content-pack-${row.id}-facts`}
        />
        {/* An ARRAY, not a component: `SettingsGroup` clones each child to draw the
            between-rows hairline, and a component wrapping the rows swallows that prop. */}
        {packActionRows({
          row,
          t,
          percent: formatQuranNumber(Math.round(progress * 100)),
          onInstall: () => row.offered && onInstall(row.offered),
          onCancel: () => onCancel(row.id),
          onRemove: () => row.installedVersion !== null && onRemove(row.id, row.installedVersion),
        })}
      </SettingsGroup>
      {/* ⚠️ THE ATTRIBUTION WRAPS; IT IS NEVER CLIPPED. The grant's credit is title + QuranEnc +
          version, and an Urdu or Tamil title runs long. No `numberOfLines`. */}
      {row.attribution.length > 0 ? (
        <Text
          style={[styles.attribution, contentStyle]}
          testID={`content-pack-${row.id}-attribution`}
        >
          {row.attribution}
        </Text>
      ) : null}
    </View>
  );
});

interface PackActionRowsArgs {
  row: PackRow;
  /** The screen's own `t`, passed down so the rows are a pure function of the row data. */
  t: TFunction;
  /** Already formatted in the reader's numerals — a percent is a locale-sensitive figure. */
  percent: string;
  onInstall: () => void;
  onCancel: () => void;
  onRemove: () => void;
}

/**
 * The controls for one pack. Six states, and TWO of them need two rows.
 *
 * ⚠️ A FAILED UPDATE OF AN INSTALLED PACK MUST STILL OFFER REMOVE. The first cut returned early on
 * `error`, so a pack that was installed and whose UPDATE failed showed a retry and nothing else —
 * a reader with a pack they could not remove and an update they could not complete. The states are
 * not mutually exclusive: "the last attempt failed" and "something is installed" are both true.
 * (Story 8-2 review, S2.)
 *
 * ⚠️ AN INSTALLED PACK THE CATALOGUE NO LONGER OFFERS STILL GETS ITS REMOVE. That is the state a
 * reader most needs a control for, and it is the ordinary offline state as well.
 */
function packActionRows({
  row,
  t,
  percent,
  onInstall,
  onCancel,
  onRemove,
}: PackActionRowsArgs): React.ReactElement[] {
  const removeRow = (
    <SettingsRow
      key="remove"
      icon="trash-outline"
      label={t('profile:content.remove')}
      onPress={onRemove}
      accessibilityLabel={t('profile:content.a11y.removePack', { name: row.title })}
      testID={`content-pack-${row.id}-remove`}
    />
  );

  // The disk could not be listed, so nothing here knows whether this pack is installed. Offering
  // "Install" would be a guess; offering a retry is the truth.
  if (row.status === 'unknown') {
    return [
      <SettingsRow
        key="unknown"
        icon="help-circle-outline"
        label={t('profile:content.retry')}
        description={t('profile:content.diskUnavailable')}
        onPress={onInstall}
        testID={`content-pack-${row.id}-unknown`}
      />,
    ];
  }

  if (row.status === 'installing') {
    return [
      <SettingsRow
        key="installing"
        icon="cloud-download-outline"
        label={t('profile:content.installing', { percent })}
        trailing="spinner"
        onPress={onCancel}
        accessibilityLabel={t('profile:content.a11y.cancelPack', { name: row.title })}
        testID={`content-pack-${row.id}-cancel`}
      />,
    ];
  }

  if (row.status === 'error') {
    const retry = (
      <SettingsRow
        key="retry"
        icon="alert-circle-outline"
        label={t('profile:content.retry')}
        // Every failure reason is a different sentence. `failed` is the catch-all, and it is what
        // an unknown reason resolves to rather than a blank line.
        description={t(`profile:content.failure.${row.failure ?? 'failed'}`)}
        onPress={onInstall}
        accessibilityLabel={t('profile:content.a11y.installPack', { name: row.title })}
        testID={`content-pack-${row.id}-retry`}
      />
    );
    return row.installedVersion !== null ? [retry, removeRow] : [retry];
  }

  if (row.status === 'updatable' && row.offered) {
    return [
      <SettingsRow
        key="update"
        icon="cloud-download-outline"
        label={t('profile:content.update')}
        onPress={onInstall}
        accessibilityLabel={t('profile:content.a11y.installPack', { name: row.title })}
        testID={`content-pack-${row.id}-update`}
      />,
      removeRow,
    ];
  }

  if (row.installedVersion !== null) return [removeRow];

  return [
    <SettingsRow
      key="install"
      icon="cloud-download-outline"
      label={t('profile:content.install')}
      onPress={onInstall}
      accessibilityLabel={t('profile:content.a11y.installPack', { name: row.title })}
      testID={`content-pack-${row.id}-install`}
    />,
  ];
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    scrollContent: {
      ...screenContentStyle('content'),
      padding: SPACING.xl,
      gap: SPACING.xl,
    },
    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xl,
    },
    header: {
      ...screenContentStyle('content'),
      paddingTop: SPACING.xl,
      gap: SPACING.xl,
    },
    search: {
      paddingHorizontal: 0,
    },
    card: {
      paddingBottom: SPACING.lg,
    },
    /**
     * ⚠️ A SECTION HEADING, NOT A CAPTION (measured on the CloudQuran emulator, 2026-09-29). Drawn
     * in the caption treatment it was indistinguishable from the pack titles beneath it — which
     * `SettingsGroup` already draws as captions — so "Français" read as one more pack rather than
     * as the group the next two packs belong to.
     */
    languageLabel: {
      textAlign: TEXT_ALIGN_START,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.md,
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.primary,
    },
    attribution: {
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.md,
      color: theme.colors.text.tertiary,
      fontSize: FONT_SIZE.caption,
    },
    // Direction is the CONTENT's, not the interface's — see the header.
    /**
     * ⚠️ `contentTextAlign`, NOT `TEXT_ALIGN_START` — MEASURED IN ARABIC ON AN EMULATOR,
     * 2026-09-19. `TEXT_ALIGN_START` is `'left'`, and under a forced-RTL layout React Native
     * resolves that to the INTERFACE's start edge — the right. So with the app in Arabic the
     * French translation rendered flush RIGHT and ragged LEFT. `contentTextAlign` answers from
     * both directions; `lib/rtl.ts` carries the measured table.
     */
    contentLtr: {
      writingDirection: 'ltr' as const,
      textAlign: contentTextAlign(false),
    },
    contentRtl: {
      writingDirection: 'rtl' as const,
      textAlign: contentTextAlign(true),
    },
  }));
