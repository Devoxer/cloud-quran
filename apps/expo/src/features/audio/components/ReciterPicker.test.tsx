/**
 * The reciter picker — grouping, the search filter, the write, and the empty state (story 7-2).
 *
 * ⚠️ THE GROUPING IS ASSERTED ON THE PURE FUNCTION, NOT ON THE RENDERED LIST. What matters about
 * forty rows is their ORDER, and a rendered virtualized list can only be interrogated one testID
 * at a time — a test that fetched three rows and found them present would pass with the other
 * thirty-seven in any order, or missing. `buildReciterRows` returns the list as data, so the
 * expectation can be a literal sequence.
 *
 * ⚠️ THE WRITE SEAM IS MOCKED, AND `patchPreferences`'s OWN BEHAVIOUR IS NOT RE-PROVEN HERE. What
 * the partial does — the merge base, the seven named fields, the coalescing — belongs to
 * `lib/sync.test.ts` against the real outbox. What is proven only here is the wiring: which row
 * calls it, with what, and how many times. (The appearance picker's suite draws the same line.)
 */

const mockPatchPreferences = jest.fn();
let mockPreferences: Record<string, unknown> | null = null;

jest.mock('@/lib/sync', () => ({
  patchPreferences: (...args: unknown[]) => mockPatchPreferences(...args),
  usePreferences: () => ({ data: mockPreferences }),
}));

/**
 * ⚠️ THE GLOBAL FLASHLIST MOCK IS A REAL `FlatList`, WHICH VIRTUALIZES — it renders about ten
 * rows and nothing below them, so `reciter-row-alafasy` (row 23 of 44) simply is not in the tree.
 * A non-virtualizing stand-in is the house answer (`surahs-screen.test.tsx` does the same for the
 * 114-row index); the alternative is a suite that can only ever assert on the first ten voices.
 */
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = (props: any) =>
    React.createElement(
      View,
      { testID: props.testID },
      (props.data ?? []).map((item: any, index: number) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ item, index })
        )
      )
    );
  return { __esModule: true, FlashList };
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import { buildReciterRows, ReciterPicker } from './ReciterPicker';

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferences = null;
});

/** Type into the search field. */
function search(query: string) {
  fireEvent.changeText(screen.getByTestId('reciter-search-input'), query);
}

describe('grouping — murattal, then mujawwad, then muallim', () => {
  it('lists all thirty-nine voices under three headings', () => {
    const rows = buildReciterRows('');
    expect(rows.filter((row) => row.kind === 'reciter')).toHaveLength(39);
    expect(rows.filter((row) => row.kind === 'style').map((row) => row.style)).toEqual([
      'murattal',
      'mujawwad',
      'muallim',
    ]);
  });

  it('puts each heading immediately above its own style, in catalogue order', () => {
    // The literal head and tail of the sequence: a heading, then its members, and no reciter of
    // one style anywhere inside another's run.
    const shape = buildReciterRows('').map((row) =>
      row.kind === 'style' ? `#${row.style}` : row.reciter.style
    );
    expect(shape.slice(0, 3)).toEqual(['#murattal', 'murattal', 'murattal']);
    expect(shape.slice(35, 40)).toEqual([
      'murattal',
      '#mujawwad',
      'mujawwad',
      'mujawwad',
      'mujawwad',
    ]);
    expect(shape.slice(40)).toEqual(['#muallim', 'muallim']);
  });

  it('renders the headings and the rows', () => {
    render(<ReciterPicker />);
    expect(screen.getByTestId('reciter-style-murattal')).toBeTruthy();
    expect(screen.getByTestId('reciter-style-mujawwad')).toBeTruthy();
    expect(screen.getByTestId('reciter-style-muallim')).toBeTruthy();
    expect(screen.getByTestId('reciter-row-alafasy')).toBeTruthy();
  });
});

describe('the search filter', () => {
  it('matches the English name, case-insensitively', () => {
    expect(
      buildReciterRows('HUSARY')
        .map((row) => (row.kind === 'style' ? null : row.reciter.id))
        .filter(Boolean)
    ).toEqual(['husary', 'husary-mujawwad', 'husary-muallim']);
  });

  it('matches a mid-name fragment rather than only a prefix', () => {
    const ids = buildReciterRows('ghamidi')
      .filter((row) => row.kind === 'reciter')
      .map((row) => row.reciter.id);
    expect(ids).toEqual(['ghamidi']);
  });

  it('ignores Latin diacritics on either side of the comparison', () => {
    // `Ḥusary` — the transliteration a reader may well type. NFD splits the dot below off the H.
    const ids = buildReciterRows('Ḥusary')
      .filter((row) => row.kind === 'reciter')
      .map((row) => row.reciter.id);
    expect(ids).toEqual(['husary', 'husary-mujawwad', 'husary-muallim']);
  });

  it('matches the ARABIC name — the whole point of carrying one', () => {
    const ids = buildReciterRows('الحصري')
      .filter((row) => row.kind === 'reciter')
      .map((row) => row.reciter.id);
    expect(ids).toEqual(['husary', 'husary-mujawwad', 'husary-muallim']);
  });

  it('drops a heading whose whole style filtered out', () => {
    // Only murattal has an Al-Afasy; a bare `#mujawwad` over nothing reads as a stuck row.
    expect(
      buildReciterRows('afasy').map((row) => (row.kind === 'style' ? row.style : row.reciter.id))
    ).toEqual(['murattal', 'alafasy']);
  });

  it('an empty query is every reciter, not none', () => {
    expect(buildReciterRows('   ')).toHaveLength(buildReciterRows('').length);
  });

  it('narrows the rendered list and drops the rest', () => {
    render(<ReciterPicker />);
    search('husary');
    expect(screen.getByTestId('reciter-row-husary')).toBeTruthy();
    expect(screen.queryByTestId('reciter-row-alafasy')).toBeNull();
  });
});

describe('the empty state — a stated absence, never a blank screen', () => {
  it('says so when nothing matches', () => {
    render(<ReciterPicker />);
    search('zzzz');
    expect(screen.getByTestId('reciter-empty')).toBeTruthy();
    expect(screen.queryByTestId('reciter-list')).toBeNull();
    // The search field survives, so the reader can correct the query in place.
    expect(screen.getByTestId('reciter-search-input')).toBeTruthy();
  });

  it('comes back when the query is cleared', () => {
    render(<ReciterPicker />);
    search('zzzz');
    search('');
    expect(screen.queryByTestId('reciter-empty')).toBeNull();
    expect(screen.getByTestId('reciter-row-alafasy')).toBeTruthy();
  });
});

describe('choosing a voice', () => {
  it('writes the id through patchPreferences, and nothing else', () => {
    render(<ReciterPicker />);
    fireEvent.press(screen.getByTestId('reciter-row-ghamidi'));
    expect(mockPatchPreferences).toHaveBeenCalledTimes(1);
    expect(mockPatchPreferences).toHaveBeenCalledWith({ reciterId: 'ghamidi' });
  });

  it('marks the stored reciter as the selected one', () => {
    mockPreferences = { reciterId: 'ghamidi' };
    render(<ReciterPicker />);
    expect(screen.getByTestId('reciter-row-ghamidi').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('reciter-row-alafasy').props.accessibilityState.selected).toBe(false);
  });

  it('re-tapping the stored reciter writes nothing', () => {
    mockPreferences = { reciterId: 'ghamidi' };
    render(<ReciterPicker />);
    fireEvent.press(screen.getByTestId('reciter-row-ghamidi'));
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ THE GUARD IS AGAINST THE STORED ROW, NOT AGAINST THE RESOLVED SELECTION, and this is the
   * case that tells the two apart. A row holding an id this build does not publish shows the
   * default as chosen — so a guard written against the resolved value would refuse the one tap
   * that could repair the row, forever.
   */
  it('repairs a row holding an unknown id', () => {
    mockPreferences = { reciterId: 'nope' };
    render(<ReciterPicker />);
    expect(screen.getByTestId('reciter-row-alafasy').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('reciter-row-alafasy'));
    expect(mockPatchPreferences).toHaveBeenCalledWith({ reciterId: 'alafasy' });
  });

  it('with no row at all, the first choice still writes', () => {
    mockPreferences = null;
    render(<ReciterPicker />);
    fireEvent.press(screen.getByTestId('reciter-row-husary-mujawwad'));
    expect(mockPatchPreferences).toHaveBeenCalledWith({ reciterId: 'husary-mujawwad' });
  });
});
