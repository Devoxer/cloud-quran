/**
 * The reciter picker — grouping, the search filter, the write, and the empty state (story 7-2).
 *
 * ⚠️ THE GROUPING IS ASSERTED ON THE PURE FUNCTION, NOT ON THE RENDERED LIST. What matters about
 * 39 rows is their ORDER, and a rendered virtualized list can only be interrogated one testID
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
 * How many surahs each reciter has on disk, for the per-row download control (2026-09-11).
 *
 * ⚠️ THE CONTROL IS REMOVABLE WITH A GREEN SUITE WITHOUT THESE CASES. It is the only thing on
 * this screen that says whether a voice is kept offline, and taking it off all thirty-nine rows
 * is invisible to every other test in the tree. (Story 7-5 review, P22, re-pointed.)
 *
 * ⚠️ AND THE COUNT COMES FROM DISK, NEVER FROM THE QUEUE STORE — which mirrors ONE reciter at a
 * time, so a control drawn from it would report the other thirty-eight as empty.
 */
let mockKeptCounts = new Map<string, number>();
const mockCancelReciterDownloads = jest.fn();
jest.mock('../lib/audioDownloads', () => ({
  DOWNLOADS_SUPPORTED: true,
  reciterDownloadCounts: () => mockKeptCounts,
  cancelReciterDownloads: (...args: unknown[]) => mockCancelReciterDownloads(...args),
  availableDownloadSpace: () => null,
  estimateReciterDownload: () => ({ bytes: 1_000_000, surahs: 114 }),
  queueReciterDownloads: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

/**
 * ⚠️ THE GLOBAL FLASHLIST MOCK IS A REAL `FlatList`, WHICH VIRTUALIZES — it renders about ten
 * rows and nothing below them, so `reciter-row-alafasy` (row 22 of 42) simply is not in the tree.
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

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { buildReciterRows, ReciterPicker } from './ReciterPicker';

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferences = null;
  mockKeptCounts = new Map();
});

/**
 * Render the picker and let the indicator's debounced disk read land.
 *
 * The listing walks every reciter directory and this list shares a screen with "download all",
 * so it is deliberately not synchronous — see the component's docblock.
 */
async function renderSettled() {
  jest.useFakeTimers();
  try {
    const view = render(<ReciterPicker />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    return view;
  } finally {
    jest.useRealTimers();
  }
}

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
    /**
     * ⚠️ AND EACH HEADING GLOSSES ITSELF. Murattal / Mujawwad / Muallim stay untranslated —
     * they are technical terms, not copy — which means the divider teaches a reader nothing on
     * its own. Literal expected strings, because the value of the line IS its wording; reading
     * them back through `t()` would restate the bundle rather than test it.
     */
    expect(screen.getByText('Measured, unadorned recitation.')).toBeTruthy();
    expect(screen.getByText('Ornamented, melodic recitation.')).toBeTruthy();
    expect(screen.getByText('Teaching style — phrases repeated to learn by.')).toBeTruthy();
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

  it('matches an Arabic name whose letters DECOMPOSE — the case the other one cannot see', () => {
    // ⚠️ `الحصري` is NFD-stable, so the sibling test above passes whether or not the two sides are
    // normalized the same way. `أحمد` is not: NFD splits أ into ا + U+0654, which sits ABOVE the
    // stripped U+0300–U+036F range and survives the fold. Comparing that against an NFC-composed
    // catalogue matched nothing — 7 of 39 names were unfindable in Arabic while the suite was green.
    expect(
      buildReciterRows('أحمد').map((row) => (row.kind === 'style' ? row.style : row.reciter.id))
    ).toEqual(['murattal', 'ajmi', 'neana']);
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

/**
 * The row's download control, whatever state it is in.
 *
 * Its glyph is `accessibilityElementsHidden` — the control itself carries the label — so RNTL's
 * default query, which skips hidden subtrees, cannot see the glyph. Asking for the CONTROL and
 * reading its label is what makes the absence assertions mean something rather than pass
 * vacuously.
 */
const control = (id: string) => screen.queryByTestId(`reciter-download-${id}`);

describe('the per-row download control (2026-09-11)', () => {
  it('offers the whole book on a voice with nothing kept', async () => {
    await renderSettled();

    expect(control('husary')?.props.accessibilityLabel).toBe(
      'Download every surah for Mahmoud Khalil Al-Husary'
    );
  });

  it('offers only the REST on a voice that is partly kept', async () => {
    mockKeptCounts = new Map([['husary', 40]]);
    await renderSettled();

    expect(control('husary')?.props.accessibilityLabel).toBe(
      'Download the remaining surahs for Mahmoud Khalil Al-Husary'
    );
    // Untouched voices still offer everything — the count is per reciter, from disk.
    expect(control('alafasy')?.props.accessibilityLabel).toBe(
      'Download every surah for Mishary Rashid Al-Afasy'
    );
  });

  /**
   * ⚠️ A COMPLETE VOICE IS NOT PRESSABLE, AND THAT IS THE POINT RATHER THAN A GAP. Remove-all
   * confirms, and a confirmation belongs on the surface that can also name the megabytes — one
   * tap away through the chevron beside this control.
   */
  it('shows a non-pressable mark once every surah is kept', async () => {
    mockKeptCounts = new Map([['husary', 114]]);
    await renderSettled();

    expect(screen.getByTestId('reciter-download-husary-complete')).toBeTruthy();
    expect(control('husary')?.props.accessibilityRole).toBeUndefined();
  });

  it("opens that reciter's own surah list from the chevron — not the row press", async () => {
    await renderSettled();

    fireEvent.press(screen.getByTestId('reciter-open-husary'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reciter-downloads',
      params: { id: 'husary' },
    });
    // The ROW still selects the voice. Two controls, two meanings, no overlap.
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ THE CONTROL AND THE CHEVRON ARE SIBLINGS OF THE ROW, NEVER INSIDE ITS `trailing` SLOT.
   * That slot renders inside the row's own `Pressable`, which react-native-web turns into a real
   * `<button>` — a control there is a `<button>` in a `<button>`, the hydration error story 7-5
   * measured in Safari and that no native surface can see.
   */
  it('keeps both controls OUTSIDE the row pressable', async () => {
    await renderSettled();

    const row = screen.getByTestId('reciter-row-husary');
    const inRow = (testID: string) => {
      const stack: any[] = [row];
      while (stack.length > 0) {
        const node = stack.pop();
        if (node?.props?.testID === testID) return true;
        for (const child of node?.children ?? []) if (typeof child !== 'string') stack.push(child);
      }
      return false;
    };
    expect(inRow('reciter-download-husary')).toBe(false);
    expect(inRow('reciter-open-husary')).toBe(false);
  });

  it('keeps the selection checkmark on the row it belongs to', async () => {
    mockPreferences = { reciterId: 'husary' };
    mockKeptCounts = new Map([['husary', 3]]);
    await renderSettled();

    expect(screen.getByTestId('reciter-row-husary').props.accessibilityState.selected).toBe(true);
    expect(control('husary')).toBeTruthy();
  });
});
