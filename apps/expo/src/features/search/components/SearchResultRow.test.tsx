/**
 * `SearchResultRow` — one matching ayah (story 6-7).
 *
 * What this file pins: the window arithmetic (three silent-wrong-slice edges), that the matched
 * words are emphasised and the rest are not, that the row says which SIDE matched, that the
 * English line appears only for a translation hit, and that a cross-orthography hit degrades to a
 * head snippet rather than emphasising the wrong word.
 *
 * ⚠️ THE ARABIC INPUTS ARE `\uXXXX` ESCAPES. This row's subject is which WORD a match landed on,
 * and a combining mark inside a rendered string attaches itself to whichever glyph the editor
 * decides — a reviewer has to be able to read the input, not just recognise the word.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { SearchResultRow, type SearchResultRowProps, windowAround } from './SearchResultRow';

/** 1:3 `al-rahmani l-rahim` verbatim — dagger alif, alef wasla, the lot. */
const VERSE_1_3 =
  '\u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650' +
  ' \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650';

/** The bare query a reader types for the first of those two words. */
const AL_RAHMAN = '\u0627\u0644\u0631\u062d\u0645\u0646';

function renderRow(props: Partial<SearchResultRowProps> = {}) {
  return render(
    <SearchResultRow
      entry={{
        surah: 1,
        verse: 3,
        textUthmani: VERSE_1_3,
        translation: 'The Entirely Merciful, the Especially Merciful,',
        arabicMatch: 'unused by the row',
        translationMatch: 'unused by the row',
      }}
      side="arabic"
      query={AL_RAHMAN}
      onPress={() => {}}
      testID="row"
      {...props}
    />
  );
}

/** Flattened style of one rendered node. */
function flatten(style: unknown): Record<string, unknown> {
  const parts = (Array.isArray(style) ? style.flat(2) : [style]).filter(Boolean);
  return Object.assign({}, ...parts.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

describe('windowAround', () => {
  const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('returns the whole line when it already fits, clipping neither end', () => {
    expect(windowAround(words, { start: 0, end: 1 }, 10)).toEqual({
      words,
      offset: 0,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it('centres on the match, clipping both ends', () => {
    // A one-word match with a budget of 3 spends one word on each side of it.
    expect(windowAround(words, { start: 3, end: 4 }, 3)).toEqual({
      words: ['c', 'd', 'e'],
      offset: 2,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it('spends the whole budget forward when the match is at the very start', () => {
    expect(windowAround(words, { start: 0, end: 1 }, 3)).toEqual({
      words: ['a', 'b', 'c'],
      offset: 0,
      clippedStart: false,
      clippedEnd: true,
    });
  });

  it('spends the whole budget backward when the match is at the very end', () => {
    expect(windowAround(words, { start: 6, end: 7 }, 3)).toEqual({
      words: ['e', 'f', 'g'],
      offset: 4,
      clippedStart: true,
      clippedEnd: false,
    });
  });

  it('falls back to the HEAD of the line when there is no range to centre on', () => {
    // ⚠️ THIS IS THE COMMON CASE, NOT AN ERROR PATH: a hit that came from `simple_text` has no
    // range in the Uthmani words the row draws.
    expect(windowAround(words, null, 3)).toEqual({
      words: ['a', 'b', 'c'],
      offset: 0,
      clippedStart: false,
      clippedEnd: true,
    });
  });
});

describe('the meta line', () => {
  it('names the surah, the reference and which SIDE matched', () => {
    renderRow();
    expect(screen.getByText('Al-Fatihah 1:3 \u00b7 Arabic')).toBeTruthy();
  });

  it('says Translation when that is what matched', () => {
    renderRow({ side: 'translation', query: 'Especially Merciful' });
    expect(screen.getByText('Al-Fatihah 1:3 \u00b7 Translation')).toBeTruthy();
  });

  it('falls back for a surah number that is not in the book — the row still renders', () => {
    renderRow({
      entry: {
        surah: 200,
        verse: 1,
        textUthmani: VERSE_1_3,
        translation: null,
        arabicMatch: '',
        translationMatch: '',
      },
    });
    expect(screen.getByText('Surah 200 200:1 \u00b7 Arabic')).toBeTruthy();
  });
});

describe('the Arabic line', () => {
  it('renders in the Uthmani face, right-aligned and RTL — set on the PARENT', () => {
    renderRow();
    // The face and the size sit on the parent so the raw ' ' separators inherit them; without
    // that they are system-font spaces at RN's default size inside a line of Uthmani.
    const style = flatten(screen.getByTestId('row-arabic').props.style);
    expect(style.fontFamily).toBe(UTHMANI_FONT_FAMILY);
    expect(style.writingDirection).toBe('rtl');
    expect(style.textAlign).toBe('right');
  });

  it('emphasises the matched WORD and leaves its neighbour alone', () => {
    renderRow();
    // Whole words, never characters: `al-rahman` is one span and `al-rahim` is another, so no
    // nested-Text boundary ever falls inside a cursive join.
    const matched = screen.getByText(
      '\u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 '
    );
    const other = screen.getByText('\u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650');
    expect(flatten(matched.props.style).fontWeight).toBeTruthy();
    expect(flatten(other.props.style)).toEqual({});
  });

  it('emphasises nothing when the hit came from the other orthography', () => {
    // `al-salah` matches 61 verses through `simple_text` and 0 through the Uthmani spelling the
    // row is drawing. A wrong emphasis would be worse than none.
    renderRow({ query: '\u0627\u0644\u0635\u0644\u0627\u0629' });
    const other = screen.getByText('\u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650');
    expect(flatten(other.props.style)).toEqual({});
  });
});

describe('the translation line', () => {
  it('is drawn only for a translation hit', () => {
    renderRow();
    expect(screen.queryByTestId('row-translation')).toBeNull();
    renderRow({ side: 'translation', query: 'Especially Merciful' });
    expect(screen.getByTestId('row-translation')).toBeTruthy();
  });

  it('is absent when the verse has no translation at all', () => {
    renderRow({
      side: 'translation',
      query: 'Especially Merciful',
      entry: {
        surah: 1,
        verse: 3,
        textUthmani: VERSE_1_3,
        translation: null,
        arabicMatch: '',
        translationMatch: '',
      },
    });
    expect(screen.queryByTestId('row-translation')).toBeNull();
  });
});

describe('the press', () => {
  it("reports the ROW's own pair, never a screen-level current verse", () => {
    const onPress = jest.fn();
    renderRow({ onPress });
    fireEvent.press(screen.getByTestId('row-open'));
    expect(onPress).toHaveBeenCalledWith(1, 3);
  });
});
