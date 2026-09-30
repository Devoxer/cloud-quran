/**
 * packGroups — dozens of packs made findable: filtered by a query, grouped by language, the
 * reader's own language first (story 8-4).
 *
 * ⚠️ IT IS `ReciterPicker`'s SHAPE, ON PURPOSE. That picker already solved "39 voices in one list"
 * with a pure `buildReciterRows(query)` returning headings and rows as ONE flat array, a search
 * field, and a `FlashList` whose `getItemType` separates the two heights. The content shelf and
 * the study sheet's source/offer lists are the same problem at 75 editions across 56 languages, so
 * they get the same answer rather than a second one: a pure function here, unit-tested on its
 * ORDER (a rendered virtualized list can only be interrogated one row at a time), and a list that
 * renders what it returns.
 *
 * ⚠️ GROUPED BY LANGUAGE CODE, HEADED BY THE LANGUAGE'S OWN NAME. A reader who does not read the
 * interface language still recognises "اردو" or "Kiswahili"; the English name is a search alias
 * (`languageNameEnglish`), because an English reader looking for Urdu types "urdu".
 *
 * ⚠️ THE READER'S OWN LANGUAGE COMES FIRST. With 56 languages on the shelf, the edition a French
 * reader is most likely to want should not sit below Amharic and Assamese because of the alphabet.
 * "Own language" is the INTERFACE language — the only statement of it the app has. Every other
 * group collates by its heading in the interface language, through `lib/format.ts` (the one module
 * `lint:i18n` allows a locale-sensitive comparator in).
 *
 * `lint:layers` rule 2: a feature `lib/` — pure logic, no UI, no routes.
 */

import { compareInAppLanguage } from '@/lib/format';

/** What an item must carry to be grouped and searched. `PackRow` and the study projections fit. */
export interface GroupablePack {
  id: string;
  title: string;
  /** The content's language code — the grouping key. */
  language: string;
  /** The language's own name — the heading. */
  languageName: string;
  /** The language's English name, or `''` — a search alias only. */
  languageNameEnglish?: string;
}

/** One entry of the flat list: a language heading, or an item under it. */
export type PackListRow<T extends GroupablePack> =
  | { kind: 'language'; language: string; languageName: string; count: number }
  | { kind: 'pack'; pack: T };

/**
 * Fold a query or a field down to what a match should ignore — `ReciterPicker`'s fold, for its
 * recorded reasons: NFD then strip the COMBINING DIACRITICAL MARKS block only (Latin accents), so
 * "francais" finds "Français" while Arabic-script letters, whose marks live elsewhere, fold the
 * same on both sides and still match each other.
 */
export function foldForSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Whether `pack` answers to an already-folded `needle` — title, either language name, or code. */
function matches(pack: GroupablePack, needle: string): boolean {
  if (needle === '') return true;
  return [pack.title, pack.languageName, pack.languageNameEnglish ?? '', pack.language].some(
    (field) => foldForSearch(field).includes(needle)
  );
}

/** The language code without region or script — `fr` for `fr-CA`. The interface's is two letters. */
const primary = (code: string): string => code.toLowerCase().split(/[-_]/)[0] ?? '';

/**
 * The list, filtered and grouped: a heading per language that has a match, then its items in the
 * order they arrived (the caller's collation — `buildRows` sorts by title).
 *
 * A language whose items all filter out drops its heading with them — a heading over nothing reads
 * as a loading row rather than as an absence.
 */
export function buildPackGroups<T extends GroupablePack>(
  packs: readonly T[],
  query: string,
  /** The interface language — its group, if it has one, goes first. */
  readerLanguage: string
): PackListRow<T>[] {
  const needle = foldForSearch(query);
  const groups = new Map<string, T[]>();
  for (const pack of packs) {
    if (!matches(pack, needle)) continue;
    const key = primary(pack.language) || pack.language;
    const group = groups.get(key);
    if (group) group.push(pack);
    else groups.set(key, [pack]);
  }
  const own = primary(readerLanguage);
  const order = [...groups.keys()].sort((a, b) => {
    if (a === own) return b === own ? 0 : -1;
    if (b === own) return 1;
    const byName = compareInAppLanguage(nameOf(groups.get(a)), nameOf(groups.get(b)));
    return byName !== 0 ? byName : a < b ? -1 : a > b ? 1 : 0;
  });
  const rows: PackListRow<T>[] = [];
  for (const language of order) {
    const members = groups.get(language) ?? [];
    rows.push({
      kind: 'language',
      language,
      languageName: nameOf(members),
      count: members.length,
    });
    for (const pack of members) rows.push({ kind: 'pack', pack });
  }
  return rows;
}

/** A group's heading: its first member's endonym, or the code when no member carries one. */
function nameOf(members: readonly GroupablePack[] | undefined): string {
  const named = members?.find((pack) => pack.languageName.length > 0);
  return named?.languageName ?? members?.[0]?.language ?? '';
}
