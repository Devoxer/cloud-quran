/**
 * `/bookmarks` — the Bookmarks tab, driven (story 6-4). Lives HERE, never beside the route: a
 * co-located test under `app/` becomes a phantom route in the web export (the rule
 * `route-integrity.test.ts` enforces).
 *
 * ⚠️ WHAT THIS FILE PINS IS THE WRITE DISCIPLINE AT THE SEAM — the same pin `surahs-screen`
 * carries, because a row tap is 6-3's mechanism verbatim: ONE `reportVerse` through
 * `usePosition('reading')`, which must land BEFORE the navigation (the read surface re-resolves
 * the saved pair on FOCUS; a write arriving after the refocus is a jump that never happens), and
 * the navigation itself is deferred one macrotask (the 6-3 measured stale-ref fix). This suite
 * runs the REAL `usePosition` over a mocked `@/lib/sync` precisely so its comparison is the
 * thing under test — a same-pair tap writes NOTHING and still navigates.
 *
 * The screen is NOT immersive: no reveal driver, no `useChromeReveal` — pinned by a source scan
 * below, because a rendered test cannot observe an import that merely exists.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    navigate: mockNavigate,
    push: jest.fn(),
    canGoBack: () => false,
  }),
  useSegments: () => ['(tabs)', 'bookmarks'],
}));

/** Captured on every render so a case can assert what the list was configured with. */
const mockListProps: Record<string, unknown>[] = [];

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = React.forwardRef((props: any, ref: any) => {
    mockListProps.push(props);
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: jest.fn(),
      scrollToOffset: jest.fn(),
    }));
    const data = props.data ?? [];
    return React.createElement(
      View,
      { testID: props.testID },
      data.map((item: any, index: number) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ item, index })
        )
      )
    );
  });
  FlashList.displayName = 'FlashList';
  return { __esModule: true, FlashList, MasonryFlashList: FlashList };
});

const mockSetReadingPosition = jest.fn();
const mockRemoveBookmark = jest.fn();
const mockReadingPositionRow = { current: null as { surah: number; verse: number } | null };
type TestBookmark = {
  id: string;
  userId: string;
  surah: number;
  verse: number;
  label: string | null;
  createdAt: number;
};
const mockBookmarksRow = { current: [] as TestBookmark[] };

jest.mock('@/lib/sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  removeBookmark: (...args: unknown[]) => mockRemoveBookmark(...args),
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
  useBookmarks: () => ({ data: mockBookmarksRow.current }),
}));

const mockGetVersesForPositions = jest.fn();
jest.mock('@/lib/quranDb', () => ({
  getVersesForPositions: (...args: unknown[]) => mockGetVersesForPositions(...args),
}));

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getPageForVerse } from 'quran-data';
import Bookmarks from '@/app/(tabs)/bookmarks';

jest.useFakeTimers();

function bookmark(id: string, surah: number, verse: number, createdAt: number): TestBookmark {
  return { id, userId: 'u', surah, verse, label: null, createdAt };
}

/** Render and flush the preview join's microtask, under the suite's fake timers. */
async function renderScreen() {
  render(<Bookmarks />);
  await act(async () => {});
}

/** Press, then run the deferred navigation macrotask (the 6-3 deferral, see the header). */
function pressAndSettle(testID: string) {
  fireEvent.press(screen.getByTestId(testID));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps.length = 0;
  mockReadingPositionRow.current = null;
  mockBookmarksRow.current = [];
  mockGetVersesForPositions.mockResolvedValue([]);
});

describe('the list', () => {
  it('renders the matrix row: transliteration name + ref, Arabic preview, delete — newest first', async () => {
    mockBookmarksRow.current = [bookmark('bk-old', 1, 1, 100), bookmark('bk-new', 2, 255, 200)];
    mockGetVersesForPositions.mockResolvedValue([
      { surah: 1, verse: 1, textUthmani: 'بِسْمِ', textSimple: 'b' },
      { surah: 2, verse: 255, textUthmani: 'آية الكرسي', textSimple: 'a' },
    ]);
    await renderScreen();
    expect(screen.getByText('Al-Baqarah · 2:255')).toBeTruthy();
    expect(screen.getByText('Al-Fatihah · 1:1')).toBeTruthy();
    expect(screen.getByText('آية الكرسي')).toBeTruthy();
    expect(screen.getByTestId('bookmark-row-2:255-delete')).toBeTruthy();
    // Most-recent-first: the list's data is the sorted rows, ids in createdAt-desc order.
    const data = mockListProps[mockListProps.length - 1].data as { id: string }[];
    expect(data.map((r) => r.id)).toEqual(['bk-new', 'bk-old']);
  });

  it('keys rows by the bookmark ID, not by index or pair', async () => {
    mockBookmarksRow.current = [bookmark('bk-1', 1, 1, 100)];
    await renderScreen();
    const props = mockListProps[mockListProps.length - 1];
    const keyExtractor = props.keyExtractor as (item: { id: string }) => string;
    expect(keyExtractor({ id: 'bk-1' })).toBe('bk-1');
  });
});

describe('the empty state', () => {
  it('teaches the control, exactly, and renders NO list', async () => {
    await renderScreen();
    // The epic's rule: empty states teach. The how-to names the verse control AND the surface
    // that carries it — a new reader lands on the mushaf, where no bookmark icon exists, so
    // copy that omits "reading mode" teaches a control they cannot find (6-4's review).
    expect(screen.getByText('No bookmarks yet')).toBeTruthy();
    expect(
      screen.getByText('In reading mode, tap the bookmark icon on any verse to save it here.')
    ).toBeTruthy();
    expect(screen.queryByTestId('bookmarks-list')).toBeNull();
    expect(mockListProps).toHaveLength(0);
  });
});

describe('a row tap — write THEN navigate, the 6-3 seam pin', () => {
  it('writes ONE position through usePosition, then navigates to /read', async () => {
    mockReadingPositionRow.current = { surah: 1, verse: 1 };
    mockBookmarksRow.current = [bookmark('bk-1', 2, 255, 100)];
    await renderScreen();
    pressAndSettle('bookmark-row-2:255-open');
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({
      surah: 2,
      verse: 255,
      page: getPageForVerse(2, 255),
      mode: 'reading',
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/read');
    // Write-before-navigation: the read surface's focus resync reads the pair at refocus time.
    expect(mockSetReadingPosition.mock.invocationCallOrder[0]).toBeLessThan(
      mockNavigate.mock.invocationCallOrder[0]
    );
  });

  it('the navigation is DEFERRED — nothing has navigated when the press returns', async () => {
    // The 6-3 measured fix: a synchronous navigate fires the read tab's focus callback before
    // React has flushed the write's re-render, so the resync reads a stale ref and no-ops.
    mockBookmarksRow.current = [bookmark('bk-1', 2, 255, 100)];
    await renderScreen();
    fireEvent.press(screen.getByTestId('bookmark-row-2:255-open'));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1); // the write is NOT deferred
    expect(mockNavigate).not.toHaveBeenCalled();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('a second row pressed inside the deferral window writes ONCE, not twice', async () => {
    mockBookmarksRow.current = [bookmark('bk-1', 2, 255, 200), bookmark('bk-2', 3, 3, 100)];
    await renderScreen();
    fireEvent.press(screen.getByTestId('bookmark-row-2:255-open'));
    fireEvent.press(screen.getByTestId('bookmark-row-3:3-open'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 2, verse: 255 });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('the guard RE-ARMS after the hop — a later tap navigates again (the tab stays mounted)', async () => {
    // ⚠️ DEMONSTRATED REMOVABLE BY THE REVIEW: deleting the re-arm (`navigating.current = false`)
    // left every earlier case green — each presses only before its timer flush — while on device
    // the tab worked exactly once per app session and then silently ate every tap. Unlike the
    // pushed index, this screen survives its own navigation, so the one-shot latch shape the
    // sibling `QuranIndexScreen` uses is WRONG here; this pins the difference.
    mockBookmarksRow.current = [bookmark('bk-1', 2, 255, 200), bookmark('bk-2', 3, 3, 100)];
    await renderScreen();
    pressAndSettle('bookmark-row-2:255-open');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    pressAndSettle('bookmark-row-3:3-open');
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(2);
    expect(mockSetReadingPosition.mock.calls[1][0]).toMatchObject({ surah: 3, verse: 3 });
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('tapping the row for the verse ALREADY saved writes nothing and still navigates', async () => {
    // The real usePosition's comparison is the thing under test: the write is a no-op, the
    // reader still lands on their verse through the focus resync of an unchanged pair.
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    mockBookmarksRow.current = [bookmark('bk-1', 2, 255, 100)];
    await renderScreen();
    pressAndSettle('bookmark-row-2:255-open');
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/read');
  });
});

describe('delete', () => {
  it('calls removeBookmark with the row’s id — no confirmation, trivially reversible', async () => {
    mockBookmarksRow.current = [bookmark('bk-1', 2, 255, 100)];
    await renderScreen();
    fireEvent.press(screen.getByTestId('bookmark-row-2:255-delete'));
    expect(mockRemoveBookmark).toHaveBeenCalledTimes(1);
    expect(mockRemoveBookmark).toHaveBeenCalledWith('bk-1');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('the chrome', () => {
  it('renders OUR header with the Bookmarks title and no back control (a tab home)', async () => {
    await renderScreen();
    expect(screen.getByTestId('chrome-title').props.children).toBe('Bookmarks');
    expect(screen.queryByTestId('chrome-back')).toBeNull();
    expect(screen.getByTestId('app-tab-bar')).toBeTruthy();
  });

  it('never imports the reveal driver — the screen is chrome-forward, not immersive', () => {
    // A rendered test cannot see an import that merely exists; the source scan can. The same
    // idiom — comment-stripped source — `custom-chrome.test.ts` uses for its structural facts
    // (the screen's own docblock is allowed to NAME the driver it refuses).
    const stripped = (path: string) =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    // ⚠️ A DIRECTORY WALK, NOT A FILE LIST — the `ReadingChrome.test.tsx` precedent. A
    // hardcoded list fails OPEN: a file added to the feature later would escape the pin
    // entirely. Walking keeps "never" meaning never as the feature grows.
    const featureDir = join(__dirname, '..', '..', 'features', 'bookmarks');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
            ? [join(dir, entry.name)]
            : []
      );
    const sources = walk(featureDir);
    expect(sources.length).toBeGreaterThanOrEqual(4); // anti-vacuity: the walk finds the feature
    for (const file of sources) {
      expect(stripped(file)).not.toMatch(/useChromeReveal/);
    }
    expect(stripped(join(__dirname, '..', '..', 'app', '(tabs)', 'bookmarks.tsx'))).not.toMatch(
      /useChromeReveal/
    );
  });
});
