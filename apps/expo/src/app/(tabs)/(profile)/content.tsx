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
import { formatBytes, useQuranNumerals } from '@/lib/format';
import { isRTLLanguage, TEXT_ALIGN_START } from '@/lib/rtl';
import { useThemedStyles } from '@/lib/useThemedStyles';

export default function ContentScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const formatQuranNumber = useQuranNumerals();
  const { rows, catalogue, disk, installedBytes, install, cancel, remove, refresh } = usePacks();

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
            label={t('profile:content.storage', {
              count: installedCount,
              size: formatBytes(installedBytes),
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
        const contentStyle = isRTLLanguage(row.language) ? styles.contentRtl : styles.contentLtr;
        return (
          <View key={row.id} testID={`content-pack-${row.id}`}>
            <SettingsGroup label={row.title}>
              <SettingsRow
                icon="document-text-outline"
                label={t('profile:content.facts', {
                  language: row.languageName,
                  size: formatBytes(row.bytes),
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
    contentLtr: {
      writingDirection: 'ltr' as const,
      textAlign: TEXT_ALIGN_START,
    },
    contentRtl: {
      writingDirection: 'rtl' as const,
      textAlign: 'right' as const,
    },
  }));
