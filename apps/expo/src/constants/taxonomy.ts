/**
 * Book category taxonomy — re-exported from the SINGLE source of truth in
 * `@cloudquran/shared` (Story 26.4). This thin shim keeps the stable `@/constants/taxonomy`
 * import path for the existing call sites; the canonical 35-slug set, the alias→canonical
 * forward guard, the display names, the icons, and the slug helpers all live in
 * `packages/shared/taxonomy.ts` (imported by the pipeline too, so the two tables can't drift
 * again). `getCategoryDisplayName` / `getCategoryIcon` canonicalize before lookup — an alias
 * slug resolves to its canonical display/icon.
 *
 * ⚠️ Story 24.14 (§ D6): this stays a PURE RE-EXPORT and the per-language label maps stay in
 * `packages/shared`. `scripts/lint-i18n.mjs` roots its scan at `apps/expo/src`, so defining the
 * 275 French labels here would trip a gate built for COPY on what is a data table keyed by query
 * key — and the only way to satisfy it would be to fork a category's label between the bundle and
 * this map. Keep the data on the shared side of the line.
 *
 * ⚠️ `getCategoryDisplayName` / `getCategoryShortName` / `getTopicDisplayName` all take the ACTIVE
 * LANGUAGE as a required argument. It is required rather than defaulted precisely so a missed call
 * site is a tsc error instead of a silently-English chip.
 */
export {
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_ICONS,
  CATEGORY_IDS,
  CATEGORY_SHORT_NAMES,
  canonicalizeCategorySlug,
  getCategoryDisplayName,
  getCategoryIcon,
  getCategoryShortName,
  getTopicDisplayName,
  TOPIC_DISPLAY_NAMES,
} from '@cloudquran/shared';
