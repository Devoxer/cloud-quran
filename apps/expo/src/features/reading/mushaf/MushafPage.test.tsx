/**
 * MushafPage, driven with the REAL renderer (story 6-2).
 *
 * ⚠️ THE LOADING→LOADED TRANSITION IS THE REGRESSION CASE FOR `mushaf-page-crash`. The pre-fork
 * component called a hook after its early returns, so the hook COUNT changed between the loading
 * render and the loaded one and React threw on every page load — and its harness stubbed React's
 * hooks, which made the crash structurally unobservable. These cases use RNTL's real renderer:
 * move any hook in `MushafPage` below an early return and the transition case reddens with
 * React's own "change in the order of Hooks" error. Do not swap this harness for one that stubs
 * hooks; the stub is how the defect shipped the first time.
 *
 * The async lifecycle is mocked at the two lib doors (`mushafLayout` / `mushafFonts`), because
 * what is under test here is the component's rendering of their answers, not the loaders —
 * `mushafLayout.test.ts` and `mushafFonts.test.ts` own those against the real data.
 */

/** The window the component sizes against — a case can make it wide-and-short (an iPad turned). */
const mockWindow = { width: 750, height: 1334, scale: 2, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const mockGetPageLayout = jest.fn<Promise<unknown>, [number]>();
const mockLoadPageFont = jest.fn<Promise<string>, [number]>();

jest.mock('@/lib/mushafLayout', () => ({
  getPageLayout: (page: number) => mockGetPageLayout(page),
}));

jest.mock('@/lib/mushafFonts', () => ({
  getPageFontFamily: (page: number) => `QCF_P${String(page).padStart(3, '0')}`,
  loadPageFont: (page: number) => mockLoadPageFont(page),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { MushafPageLayout } from 'quran-data';
import { SURAH_METADATA } from 'quran-data';
import { UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import {
  BASMALA_SCALE,
  BASMALA_TEXT,
  MUSHAF_GLYPH_SCALE,
  MUSHAF_HEIGHT_BUDGET,
  MUSHAF_LINE_HEIGHT_RATIO,
  MUSHAF_WEB_MAX_WIDTH,
} from '@/constants/mushaf';
import { MushafPage } from './MushafPage';

/** What the component computes for a native run at the default window — width is the binding
 *  constraint there, which is the whole point of the phone case. */
const GLYPH_SIZE = mockWindow.width * MUSHAF_GLYPH_SCALE;

/** A believable page 40: header, basmala, and a text line with two verses' words on it. */
const PAGE_40: MushafPageLayout = {
  page: 40,
  lines: [
    { line: 1, type: 'surah-header', text: 'x', surah: '002' },
    { line: 2, type: 'basmala' },
    {
      line: 3,
      type: 'text',
      text: 'x y z',
      verseRange: '2:1-2:15',
      words: [
        { location: '2:1:1', word: 'a', qpcV1: 'ﭑ', qpcV2: '' },
        { location: '2:1:2', word: 'b', qpcV1: 'ﭒ', qpcV2: '' },
        { location: '2:15:1', word: 'c', qpcV1: 'ﭓ', qpcV2: '' },
      ],
    },
  ],
};

/** Page 1's short framed shape. */
const PAGE_1: MushafPageLayout = {
  page: 1,
  lines: [
    { line: 1, type: 'surah-header', text: 'x', surah: '001' },
    {
      line: 2,
      type: 'text',
      text: 'x',
      verseRange: '1:1-1:1',
      words: [{ location: '1:1:1', word: 'a', qpcV1: 'ﭑ', qpcV2: '' }],
    },
  ],
};

/** Flattened style of the first Text rendering `glyph`. */
function styleOfGlyph(glyph: string): Record<string, unknown> {
  const style = screen.getByText(glyph).props.style;
  const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
  return Object.assign({}, ...flat);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWindow.width = 750;
  mockWindow.height = 1334;
  mockGetPageLayout.mockImplementation(async (page) => (page === 1 ? PAGE_1 : PAGE_40));
  mockLoadPageFont.mockImplementation(async (page) => `QCF_P${String(page).padStart(3, '0')}`);
});

describe('the hook-order regression', () => {
  it('renders the loading→loaded transition without a hook-order error', async () => {
    // The skeleton first, the page after — the exact pair of renders the pre-fork component
    // could not survive. A hook moved below an early return makes React throw right here.
    let resolveLayout: (layout: MushafPageLayout) => void = () => {};
    mockGetPageLayout.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLayout = resolve;
        })
    );
    render(<MushafPage pageNumber={40} />);
    expect(screen.getByTestId('mushaf-page-loading-40')).toBeTruthy();
    await act(async () => resolveLayout(PAGE_40));
    expect(screen.getByTestId('mushaf-page-40')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-page-loading-40')).toBeNull();
  });

  it('survives the loading→error transition the same way', async () => {
    mockLoadPageFont.mockRejectedValue(new Error('offline'));
    render(<MushafPage pageNumber={40} />);
    expect(await screen.findByTestId('mushaf-page-error-40')).toBeTruthy();
  });

  it('drops a slow page’s answer once the reader has moved on', async () => {
    // MUTATION: delete the `cancelled` guard `useMushafPage`'s docblock argues for. Every case
    // above stays green — and a page whose load resolves LATE then paints its lines under a
    // different page's number and page header. Reached in the app through `reload`, which
    // re-runs the effect on the same mounted component.
    let landPage40 = () => {};
    mockGetPageLayout.mockImplementation((page) =>
      page === 40
        ? new Promise<MushafPageLayout>((resolve) => {
            landPage40 = () => resolve(PAGE_40);
          })
        : Promise.resolve(PAGE_1)
    );
    render(<MushafPage pageNumber={40} />);
    screen.rerender(<MushafPage pageNumber={1} />);
    await screen.findByTestId('mushaf-page-1');
    await act(async () => landPage40());
    // Al-Fatihah prints no basmala line; page 40's fixture carries one, so its arrival is
    // visible even though both pages render inside the same container.
    expect(screen.queryByText(BASMALA_TEXT)).toBeNull();
    expect(screen.getByTestId('mushaf-page-1')).toBeTruthy();
  });
});

describe('the measured geometry', () => {
  it('carries the numbers the mushaf was measured at, not merely uses them', () => {
    // MUTATION: change any of these four and every case above stays green — they assert the
    // component READS the constant, which a changed value survives (`VerseRow.test.tsx` pins its
    // badge geometry as literals for the same reason). The provenance is in `constants/mushaf.ts`.
    expect(MUSHAF_GLYPH_SCALE).toBe(0.0628);
    expect(MUSHAF_HEIGHT_BUDGET).toBe(0.86);
    expect(MUSHAF_LINE_HEIGHT_RATIO).toBe(1.4);
    expect(BASMALA_SCALE).toBe(0.8);
    expect(MUSHAF_WEB_MAX_WIDTH).toBe(700);
  });
});

describe('the three line types', () => {
  it('frames the surah header with the surah’s Arabic name in the KFGQPC face', async () => {
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    const name = SURAH_METADATA[1].nameArabic; // '002' on the header line, resolved from data
    const style = styleOfGlyph(name);
    expect(style.fontFamily).toBe(UTHMANI_FONT_FAMILY);
    expect(style.writingDirection).toBe('rtl');
  });

  it('renders the basmala from the CONSTANT — the data rows carry no glyph — at 0.8×', async () => {
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    const style = styleOfGlyph(BASMALA_TEXT);
    expect(style.fontFamily).toBe(UTHMANI_FONT_FAMILY);
    expect(style.fontSize).toBeCloseTo(GLYPH_SIZE * BASMALA_SCALE);
  });

  it('puts the page face and the glyph size on the LINE, not only on each word', async () => {
    // MUTATION: drop these two from the line's `Text` and every other case here stays green —
    // each word carries its own. The `' '` separators do NOT: they are raw children of the line
    // and inherit it, so without this they are system-font spaces at RN's default 14pt, ~4pt of
    // width per word that `MUSHAF_GLYPH_SCALE`'s measured ceiling does not budget for. Measured
    // on the simulator: it wraps every line of an ordinary page onto a second row.
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    const style = screen.getByTestId('mushaf-line-3').props.style;
    const flat = Object.assign(
      {},
      ...(Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean)
    );
    expect(flat.fontFamily).toBe('QCF_P040');
    expect(flat.fontSize).toBeCloseTo(GLYPH_SIZE);
  });

  it('caps the glyph size by HEIGHT on a window wider than it is tall', async () => {
    // MUTATION: drop the `Math.min` and size by width alone. Every other case stays green — they
    // all run at a phone-shaped window where width is the binding constraint. Measured on an
    // iPad Pro 13" simulator in landscape (1376 × 1032): width alone asks for 82.6pt glyphs and
    // ~1,734pt of lines in a ~1,010pt column, i.e. a page several times too large to read.
    mockWindow.width = 1376;
    mockWindow.height = 1032;
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    const capped = (1032 * MUSHAF_HEIGHT_BUDGET) / (15 * MUSHAF_LINE_HEIGHT_RATIO);
    expect(capped).toBeLessThan(1376 * MUSHAF_GLYPH_SCALE); // the cap really is the smaller one
    expect(styleOfGlyph('ﭑ').fontSize).toBeCloseTo(capped);
  });

  it('does NOT cap on a phone in portrait — width is the binding constraint there', async () => {
    // Anti-vacuity for the case above: the cap must not quietly shrink the mushaf on the shape
    // it was measured against.
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    expect(styleOfGlyph('ﭑ').fontSize).toBeCloseTo(GLYPH_SIZE);
  });

  it('renders each word’s qpcV1 in the PAGE’s own font at the measured scale', async () => {
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    const style = styleOfGlyph('ﭑ');
    expect(style.fontFamily).toBe('QCF_P040');
    expect(style.fontSize).toBeCloseTo(GLYPH_SIZE);
  });

  it('renders pages 1–2 centered inside the frame, and ordinary pages without it', async () => {
    render(<MushafPage pageNumber={1} />);
    await screen.findByTestId('mushaf-page-1');
    expect(screen.getByTestId('mushaf-special-frame')).toBeTruthy();
    screen.unmount();
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.queryByTestId('mushaf-special-frame')).toBeNull();
  });

  it('does NOT frame page 3 — the boundary the `<= 2` threshold sits on', async () => {
    // MUTATION: widen `SPECIAL_PAGE_MAX` to 3. The case above renders only pages 1 and 40, so
    // it survives — and page 3, the first full 15-line page, would render mis-framed and
    // centered. `mushafLayout.test.ts` pins the DATA side (8 lines on 1–2, 15 everywhere else).
    render(<MushafPage pageNumber={3} />);
    await screen.findByTestId('mushaf-page-3');
    expect(screen.queryByTestId('mushaf-special-frame')).toBeNull();
  });

  it('labels the page for a screen reader with its number and surah', async () => {
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.getByLabelText('Page 40, Surah Al-Baqarah')).toBeTruthy();
  });
});

describe('the highlight seam', () => {
  it('highlights exactly the active verse’s words', async () => {
    render(<MushafPage pageNumber={40} activeVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    expect(styleOfGlyph('ﭑ').backgroundColor).toBeDefined();
    expect(styleOfGlyph('ﭒ').backgroundColor).toBeDefined();
  });

  it('does NOT let "2:1" match 2:15 — the `+ \':\'` prefix guard', async () => {
    render(<MushafPage pageNumber={40} activeVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    expect(styleOfGlyph('ﭓ').backgroundColor).toBeUndefined();
  });

  it('highlights nothing with no active verse', async () => {
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    for (const glyph of ['ﭑ', 'ﭒ', 'ﭓ']) {
      expect(styleOfGlyph(glyph).backgroundColor).toBeUndefined();
    }
  });
});

describe('the error surface', () => {
  it('is a real surface with a retry that actually retries, and it reports BOTH edges', async () => {
    const onErrorChange = jest.fn();
    mockLoadPageFont.mockRejectedValue(new Error('offline'));
    render(<MushafPage pageNumber={40} onErrorChange={onErrorChange} />);
    await screen.findByTestId('mushaf-page-error-40');
    // The screen hears about it WITH the page number, so it can reveal chrome only for the
    // page the reader is looking at.
    expect(onErrorChange).toHaveBeenCalledWith(40, true);

    // Back online: the failed load was never cached, so the retry genuinely re-attempts.
    mockLoadPageFont.mockResolvedValue('QCF_P040');
    fireEvent.press(screen.getByText('Try Again'));
    expect(await screen.findByTestId('mushaf-page-40')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-page-error-40')).toBeNull();
    // MUTATION: report only the failure. The screen's record of which pages are broken then goes
    // stale, and coming back to a page that has since loaded flashes the chrome for no reason.
    expect(onErrorChange).toHaveBeenLastCalledWith(40, false);
  });

  it('does not call a page "fine" while it is still loading', async () => {
    // MUTATION: drop the `loading` guard. Every page then reports `false` on its very first
    // render, which is an answer the loader has not given yet.
    const onErrorChange = jest.fn();
    let resolveLayout: (layout: MushafPageLayout) => void = () => {};
    mockGetPageLayout.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLayout = resolve;
        })
    );
    render(<MushafPage pageNumber={40} onErrorChange={onErrorChange} />);
    expect(onErrorChange).not.toHaveBeenCalled();
    await act(async () => resolveLayout(PAGE_40));
    expect(onErrorChange).toHaveBeenCalledWith(40, false);
  });
});
