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

/**
 * ⚠️ THE SELECTION SEAM (story 7-8) — the SAME prefix mechanism, a DIFFERENT channel.
 *
 * A word is a nested `<Text>` inside the line's justified RTL flow, and on iOS a nested Text is
 * an attributed-string range: border styles are not applied to ranges, backgrounds are. So the
 * selection is a text decoration, which is the only outline channel that exists here — and it has
 * to be a different channel from the highlight, because the recited ayah and the selected one are
 * frequently the same word.
 */
describe('the selection seam (story 7-8)', () => {
  it('underlines exactly the selected verse’s words', async () => {
    render(<MushafPage pageNumber={40} selectedVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    expect(styleOfGlyph('ﭑ').textDecorationLine).toBe('underline');
    expect(styleOfGlyph('ﭒ').textDecorationLine).toBe('underline');
  });

  it('does NOT let "2:1" match 2:15 — the same `+ \':\'` guard the highlight uses', async () => {
    // MUTATION: compare against the bare key. Selecting 2:1 would underline all of 2:15's words.
    render(<MushafPage pageNumber={40} selectedVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    expect(styleOfGlyph('ﭓ').textDecorationLine).toBeUndefined();
  });

  it('underlines nothing with no selection', async () => {
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    for (const glyph of ['ﭑ', 'ﭒ', 'ﭓ']) {
      expect(styleOfGlyph(glyph).textDecorationLine).toBeUndefined();
    }
  });

  it('draws ONE continuous stroke across an ayah, not one dash per word', async () => {
    // ⚠️ THE SEAM THIS STORY USED TO REJECT A SECOND FILL, ARRIVING IN THE CHANNEL THAT REPLACED
    // IT. The `' '` separators are raw children of the LINE — they must be, or a background
    // highlight bleeds across them — so the underline drew as a row of disconnected dashes until
    // a selected gap joined it. A decoration is not a fill; carrying it across the gap is what
    // makes one ayah read as one stroke. MUTATION: drop `bridged`; the gap loses its decoration.
    render(<MushafPage pageNumber={40} selectedVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    const gap = screen.getByTestId('mushaf-gap-2:1:2');
    const style = gap.props.style;
    const flat = Object.assign(
      {},
      ...(Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean)
    );
    expect(flat.textDecorationLine).toBe('underline');
  });

  it('…and stops at the ayah BOUNDARY — the gap into an unselected word stays plain', async () => {
    // Anti-vacuity for the case above: bridging every gap would join 2:1's stroke to 2:15's, i.e.
    // underline the whole line whenever any of its ayat is selected. `2:15:1` follows a SELECTED
    // word on page 40's fixture line, so its gap is exactly the boundary.
    render(<MushafPage pageNumber={40} selectedVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.queryByTestId('mushaf-gap-2:15:1')).toBeNull();
  });

  it('coexists with the recitation FILL on the SAME word — two channels, never two fills', async () => {
    // The overlap the whole decision exists for. MUTATION: draw the selection as a second
    // background; one of these two assertions loses to the other and the blend nobody authored
    // is what the reader sees.
    render(<MushafPage pageNumber={40} activeVerseKey="2:1" selectedVerseKey="2:1" />);
    await screen.findByTestId('mushaf-page-40');
    const style = styleOfGlyph('ﭑ');
    expect(style.backgroundColor).toBe('rgba(198, 93, 59, 0.12)');
    expect(style.textDecorationLine).toBe('underline');
    // The decoration's colour is `accent.soft`, as a literal — the token the contrast gate holds
    // at ≥3:1 over this very fill on all twelve palette slices.
    expect(style.textDecorationColor).toBe('#B14E2F');
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

/**
 * ⚠️ THE WORD PRESS (story 7-6, and a SELECTION rather than a seek since 7-8). The word `<Text>`
 * nodes already existed for the highlight; 7-6 gave them `onPress` and nothing else — no wrapper
 * views, no gesture detectors, because a word is a nested text node inside a justified RTL line
 * and boxing it breaks the page. 7-8 changed only what the press MEANS: it selects the ayah the
 * word belongs to, and nothing on this page reaches the audio engine any more.
 */
describe('the word press', () => {
  it('reports the pair from `location`, not from the line it sits on', async () => {
    const onSelectVerse = jest.fn();
    render(<MushafPage pageNumber={40} onSelectVerse={onSelectVerse} />);
    await screen.findByTestId('mushaf-page-40');
    // ⚠️ THE THIRD WORD IS 2:15's, ON A LINE WHOSE `verseRange` READS "2:1-2:15". A press that
    // took the range — or the line's first verse — would seek to 2:1 and the recitation would
    // jump backwards fourteen ayahs.
    fireEvent.press(screen.getByText('ﭓ'));
    expect(onSelectVerse).toHaveBeenCalledWith(2, 15);
  });

  it('…and a DRIFTED `verseRange` cannot move it — the 565-line defect, as a press', async () => {
    // MUTATION: parse `line.verseRange` instead of `word.location`. 565 committed lines carried a
    // drifted range before story 6-2 regenerated the data, so this is not a hypothetical.
    const onSelectVerse = jest.fn();
    mockGetPageLayout.mockResolvedValue({
      page: 50,
      lines: [
        {
          line: 1,
          type: 'text',
          text: 'x',
          verseRange: '9:1-9:1',
          words: [{ location: '2:255:1', word: 'a', qpcV1: 'ﭔ', qpcV2: '' }],
        },
      ],
    } as MushafPageLayout);
    render(<MushafPage pageNumber={50} onSelectVerse={onSelectVerse} />);
    await screen.findByTestId('mushaf-page-50');
    fireEvent.press(screen.getByText('ﭔ'));
    expect(onSelectVerse).toHaveBeenCalledWith(2, 255);
  });

  it('toggles the chrome from ALL THREE bands — header, page number, and the text column', async () => {
    // ⚠️ THESE THREE BANDS ARE THE MUSHAF'S ENTIRE CHROME-TOGGLE SURFACE, and together they
    // are the WHOLE PAGE (owner call 2026-09-11: "all the screen should either select a verse or
    // reveal the chrome"). The RNGH tap that used to cover the pager is still gone — there is no
    // second touch system to race — but the dead margins it left behind are gone too.
    const onToggleChrome = jest.fn();
    render(<MushafPage pageNumber={40} onToggleChrome={onToggleChrome} />);
    await screen.findByTestId('mushaf-page-40');

    fireEvent.press(screen.getByTestId('mushaf-chrome-band-header-40'));
    expect(onToggleChrome).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('mushaf-chrome-band-footer-40'));
    expect(onToggleChrome).toHaveBeenCalledTimes(2);
    // The third band is the one the 2026-09-10 shape had no answer for: the margins beside the
    // lines, the gaps between them, and a special page's frame.
    fireEvent.press(screen.getByTestId('mushaf-chrome-band-page-40'));
    expect(onToggleChrome).toHaveBeenCalledTimes(3);
  });

  it('reveals from a LINE too — the run-in beside the glyphs is not dead space', async () => {
    // ⚠️ THE LINE ANSWERS FOR ITSELF RATHER THAN LEANING ON THE BAND BEHIND IT. A line's
    // `<Text>` is full width while its glyphs are not, so whether a tap in the run-in reaches the
    // band is a platform hit-testing question. The owner reported the run-in dead on iOS; an A/B
    // on the Android emulator against the band-only build revealed either way, so this case pins
    // a behaviour that no longer DEPENDS on hit-testing — not a reproduced Android defect.
    const onToggleChrome = jest.fn();
    render(<MushafPage pageNumber={40} onToggleChrome={onToggleChrome} />);
    await screen.findByTestId('mushaf-page-40');
    // Line 3 is the fixture's TEXT line — 1 is the surah header and 2 the basmala, neither of
    // which holds word spans and so neither of which ever swallowed a press.
    fireEvent.press(screen.getByTestId('mushaf-line-3'));
    expect(onToggleChrome).toHaveBeenCalledTimes(1);
  });

  it('…and a WORD inside that line still selects instead, never both', async () => {
    // MUTATION: the line-level handler is the obvious way to re-introduce the double-fire story
    // 7-6 was built to remove. Nesting is what prevents it — the word span is the inner
    // responder — so this pins that adding the outer handler did not cost the inner rule.
    const onToggleChrome = jest.fn();
    const onSelectVerse = jest.fn();
    render(
      <MushafPage pageNumber={40} onSelectVerse={onSelectVerse} onToggleChrome={onToggleChrome} />
    );
    await screen.findByTestId('mushaf-page-40');
    fireEvent.press(screen.getByText('ﭑ'));
    expect(onSelectVerse).toHaveBeenCalledTimes(1);
    expect(onToggleChrome).not.toHaveBeenCalled();
  });

  it('leaves a WORD press to the SELECTION alone — it never toggles the chrome', async () => {
    // MUTATION: put `onToggleChrome` back on the word `<Text>`. This is the whole point of the
    // change: a press on the Quran moves the recitation and does nothing else.
    const onToggleChrome = jest.fn();
    const onSelectVerse = jest.fn();
    render(
      <MushafPage pageNumber={40} onSelectVerse={onSelectVerse} onToggleChrome={onToggleChrome} />
    );
    await screen.findByTestId('mushaf-page-40');
    fireEvent.press(screen.getByText('ﭑ'));
    expect(onSelectVerse).toHaveBeenCalledTimes(1);
    expect(onToggleChrome).not.toHaveBeenCalled();
  });

  it('draws both bands as plain text when no chrome is behind the page', async () => {
    // MUTATION: wire the bands unconditionally. `Pressable` with no handler still takes the
    // touch, so a page with no chrome would swallow presses and answer nothing.
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    expect(
      screen.getByTestId('mushaf-chrome-band-header-40').props.accessibilityRole
    ).toBeUndefined();
    expect(
      screen.getByTestId('mushaf-chrome-band-footer-40').props.accessibilityRole
    ).toBeUndefined();
    expect(
      screen.getByTestId('mushaf-chrome-band-page-40').props.accessibilityRole
    ).toBeUndefined();
  });

  it('exposes no press on a basmala row — there is no ayah there to select', async () => {
    // The layout's `basmala` and `surah-header` rows carry no `words`, so they are the boundary
    // of what is pressable — and since the bands became the only chrome control, a press there
    // does nothing at all rather than flipping the chrome.
    const onSelectVerse = jest.fn();
    render(<MushafPage pageNumber={40} onSelectVerse={onSelectVerse} />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.getByText(BASMALA_TEXT).props.onPress).toBeUndefined();
    expect(screen.getByText(SURAH_METADATA[1].nameArabic).props.onPress).toBeUndefined();
  });

  it('renders a page with no handlers at all — the props are optional', async () => {
    // MUTATION: make either handler required. `MushafPage` has one consumer today, but a page
    // with no player behind it must render plain glyphs rather than crash.
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.getByText('ﭑ').props.onPress).toBeUndefined();
    expect(() => fireEvent.press(screen.getByText('ﭑ'))).not.toThrow();
  });

  it('takes NO touch at all without `onSelectVerse`', async () => {
    // ⚠️ RN `Text` BECOMES PRESSABLE ON `onPressIn` ALONE, which is how an unconditionally-wired
    // handler once made every word swallow the touch while doing nothing. `VerseRow` avoids the
    // same trap with `disabled={!onSelectVerse}`.
    render(<MushafPage pageNumber={40} />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.getByText('ﭑ').props.onPress).toBeUndefined();
    expect(screen.getByText('ﭑ').props.onPressIn).toBeUndefined();
  });

  it('leaves a word whose `location` is out of range unpressable, in BOTH directions', async () => {
    // MUTATION: keep only the `Number.isInteger` check. `Number.parseInt` accepts '0' and '-1',
    // so `'0:0:1'` produced `playSurah(0, 0)` — a request for a surah that does not exist —
    // rather than a word that simply takes no touch. A page whose data is wrong must be inert,
    // never confidently wrong about the Quran.
    const onSelectVerse = jest.fn();
    mockGetPageLayout.mockResolvedValue({
      page: 51,
      lines: [
        {
          line: 1,
          type: 'text',
          text: 'x',
          verseRange: '1:1-1:1',
          words: [
            { location: '0:0:1', word: 'a', qpcV1: 'ﭕ', qpcV2: '' },
            { location: '115:1:1', word: 'b', qpcV1: 'ﭖ', qpcV2: '' },
            { location: '2:255:1', word: 'c', qpcV1: 'ﭗ', qpcV2: '' },
          ],
        },
      ],
    } as MushafPageLayout);
    render(<MushafPage pageNumber={51} onSelectVerse={onSelectVerse} />);
    await screen.findByTestId('mushaf-page-51');
    for (const glyph of ['ﭕ', 'ﭖ']) {
      expect(screen.getByText(glyph).props.onPress).toBeUndefined();
    }
    // …and the good word beside them still works, so the guard is a filter and not an off switch.
    fireEvent.press(screen.getByText('ﭗ'));
    expect(onSelectVerse).toHaveBeenCalledWith(2, 255);
    expect(onSelectVerse).toHaveBeenCalledTimes(1);
  });

  it('does not draw iOS’s press highlight over the facsimile', async () => {
    // A grey rectangle flashing across a page whose whole premise is faithful rendering.
    render(<MushafPage pageNumber={40} onSelectVerse={jest.fn()} />);
    await screen.findByTestId('mushaf-page-40');
    expect(screen.getByText('ﭑ').props.suppressHighlighting).toBe(true);
  });
});
