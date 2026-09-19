/**
 * Content — the shelf of installable content packs (story 8-2).
 *
 * ⚠️ THIS STORY SHIPS THE MECHANISM AND EXACTLY ONE PACK. The screen is deliberately a plain list
 * of groups rather than the scope × type × source matrix the study sheet will need: that matrix is
 * story 8-3's, and building it here against a single row would be a shape nobody could check.
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
 * ⚠️ THE ATTRIBUTION AND THE PREVIEW ARE RENDERED AS THE PACK'S OWN TEXT, WITH THE PACK'S OWN
 * DIRECTION. Both are content in the pack's language, not UI copy in the reader's — the next pack
 * types are Arabic tafsir, and this repo sets content direction locally at every content site
 * because web is deliberately not mirrored. They are siblings of the card rather than a
 * `SettingsRow` `description`, which takes a plain string and no style. (Story 8-2 review, S6.)
 */

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { LoadingView, SettingsGroup, SettingsRow } from '@/components/ui';
import { PACKS_SUPPORTED } from '@/constants/packs';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { type PackRow, usePacks } from '@/features/packs';
import { formatBytes, isolate, useQuranNumerals } from '@/lib/format';
import { contentTextAlign, isRTLContentLanguage } from '@/lib/rtl';
import { useThemedStyles } from '@/lib/useThemedStyles';

export default function ContentScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  // ⚠️ `deferCatalogue` ON WEB, BECAUSE THIS SCREEN DOES NOT RENDER A SHELF THERE. Story 8-3 made
  // `usePacks` platform-uniform, so without this the web build would fetch the catalogue to draw
  // a single sentence. Native is unchanged and fetches eagerly.
  const { rows, catalogue, disk, installedBytes, install, cancel, remove, refresh } = usePacks({
    deferCatalogue: !PACKS_SUPPORTED,
  });

  if (!PACKS_SUPPORTED) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <SettingsGroup testID="content-unsupported">
          <SettingsRow
            icon="information-circle-outline"
            label={t('profile:content.webUnsupported')}
          />
        </SettingsGroup>
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      testID="content-screen"
    >
      {installedCount > 0 && disk === 'ready' ? (
        <SettingsGroup testID="content-storage">
          <SettingsRow
            icon="folder-outline"
            /**
             * ⚠️ `count` STAYS A NUMBER AND `number` IS WHAT IS DRAWN (story 8-3 review, D5b).
             * i18next selects the plural from `count`, so formatting it would hand the selector a
             * string and collapse six Arabic categories to one — but leaving it as the DISPLAYED
             * value bypassed the reader's numeral preference, which the percent five rows down
             * has respected since 8-2. Two interpolations, one for the grammar and one for the
             * glyphs.
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

      {rows.map((row) => {
        const contentStyle = isRTLContentLanguage(row.language)
          ? styles.contentRtl
          : styles.contentLtr;
        return (
          <View key={row.id} testID={`content-pack-${row.id}`}>
            {/* ⚠️ THE TITLE IS THE PACK'S OWN TEXT TOO (story 8-3 review, D5c). The preview and the
                attribution below already take the pack's direction; the group header was the one
                element still taking the interface's, which is invisible with one French pack and
                wrong the day story 8-4 ships Urdu and Persian. */}
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
                percent: formatQuranNumber(Math.round(row.progress * 100)),
                onInstall: () => row.offered && install(row.offered),
                onCancel: () => cancel(row.id),
                onRemove: () =>
                  row.installedVersion !== null && remove(row.id, row.installedVersion),
              })}
            </SettingsGroup>
            {row.preview ? (
              <Text
                style={[styles.preview, contentStyle]}
                testID={`content-pack-${row.id}-preview`}
              >
                {row.preview}
              </Text>
            ) : null}
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
      })}
    </ScrollView>
  );
}

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
    preview: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.md,
      color: theme.colors.text.secondary,
      fontSize: FONT_SIZE.bodySmall,
    },
    attribution: {
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.md,
      color: theme.colors.text.tertiary,
      fontSize: FONT_SIZE.caption,
    },
    // Direction is the CONTENT's, not the interface's — see the header.
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
    contentLtr: {
      writingDirection: 'ltr' as const,
      textAlign: contentTextAlign(false),
    },
    contentRtl: {
      writingDirection: 'rtl' as const,
      textAlign: contentTextAlign(true),
    },
  }));
