/**
 * WelcomeBackBanner — the 7-day gate, the 4s lifecycle, and the placement that closes
 * `welcome-banner-overlap` (story 6-3).
 *
 * ⚠️ THE PLACEMENT CASE IS THE RECORDED DEFECT'S PIN. The pre-fork banner sat at
 * `insets.top + spacing.sm` — the header's own Y — with a higher z-index, and covered the surah
 * title for four seconds. Ours must clear the whole header zone: `top ≥ insets.top +
 * CHROME_BAR_HEIGHT` (insets are 0 under Jest, so the assertion binds on the bar height).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react-native';

const mockReadingPositionRow = {
  current: null as { surah: number; verse: number; updatedAt?: number } | null,
};

jest.mock('@/lib/sync', () => ({
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
}));

import { DURATIONS } from '@/constants/animation';
import { CHROME_BAR_HEIGHT } from '@/constants/navigation';
import { WelcomeBackBanner } from './WelcomeBackBanner';

const DAY_MS = 24 * 60 * 60 * 1000;

function rowAgedDays(days: number, surah = 2) {
  return { surah, verse: 255, updatedAt: Date.now() - days * DAY_MS };
}

/** Flattened style of the banner container. */
function bannerStyle(): Record<string, unknown> {
  const style = screen.getByTestId('welcome-back-banner').props.style;
  const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
  return Object.assign({}, ...flat.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

beforeEach(() => {
  mockReadingPositionRow.current = null;
});

describe('the 7-day gate', () => {
  it('shows for a row 8 days old, naming the saved surah warmly — and only that', () => {
    mockReadingPositionRow.current = rowAgedDays(8, 18);
    render(<WelcomeBackBanner dismissed={false} />);
    expect(screen.getByText('Welcome back. You were reading Al-Kahf.')).toBeTruthy();
  });

  it('shows at exactly 7 days — the gate is ≥, not >', () => {
    mockReadingPositionRow.current = rowAgedDays(7);
    render(<WelcomeBackBanner dismissed={false} />);
    expect(screen.getByTestId('welcome-back-banner')).toBeTruthy();
  });

  it('does NOT show at 6 days', () => {
    // MUTATION: the gate loosened to 6 days (or the comparison flipped) must redden here.
    mockReadingPositionRow.current = rowAgedDays(6);
    render(<WelcomeBackBanner dismissed={false} />);
    expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
  });

  it('does NOT show with no row at all — a first-ever reader gets no "welcome back"', () => {
    mockReadingPositionRow.current = null;
    render(<WelcomeBackBanner dismissed={false} />);
    expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
  });

  it('renders nothing — and does not crash — for a corrupt saved surah', () => {
    // Clamp, never trust: a surah outside the book names nothing true, so no banner.
    mockReadingPositionRow.current = { surah: 200, verse: 1, updatedAt: Date.now() - 8 * DAY_MS };
    render(<WelcomeBackBanner dismissed={false} />);
    expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
  });
});

describe('the lifecycle', () => {
  it('is gone after the 4s timer', () => {
    jest.useFakeTimers();
    try {
      mockReadingPositionRow.current = rowAgedDays(8);
      render(<WelcomeBackBanner dismissed={false} />);
      expect(screen.getByTestId('welcome-back-banner')).toBeTruthy();
      // The 4s hold, then the fade itself (plus frames for the animation to report finished).
      act(() => {
        jest.advanceTimersByTime(4000 + DURATIONS.standard * 5);
      });
      expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('is NOT gone before the 4s timer', () => {
    jest.useFakeTimers();
    try {
      mockReadingPositionRow.current = rowAgedDays(8);
      render(<WelcomeBackBanner dismissed={false} />);
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('welcome-back-banner')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('the `dismissed` prop takes it down — the screen’s page-move dismissal', () => {
    mockReadingPositionRow.current = rowAgedDays(8);
    const view = render(<WelcomeBackBanner dismissed={false} />);
    expect(screen.getByTestId('welcome-back-banner')).toBeTruthy();
    view.rerender(<WelcomeBackBanner dismissed={true} />);
    expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
  });
});

describe('the placement — `welcome-banner-overlap` stays closed', () => {
  it('sits BELOW the header zone: top ≥ insets.top + CHROME_BAR_HEIGHT', () => {
    // MUTATION: the pre-fork `top: insets.top + spacing.sm` puts `top` at 8 under Jest's zero
    // insets — far below the 56pt bar — and this reddens.
    mockReadingPositionRow.current = rowAgedDays(8);
    render(<WelcomeBackBanner dismissed={false} />);
    const style = bannerStyle();
    expect(style.position).toBe('absolute');
    expect(style.top as number).toBeGreaterThanOrEqual(CHROME_BAR_HEIGHT);
  });
});

describe('it is not chrome', () => {
  it('never imports the chrome reveal — its lifecycle is its own', () => {
    // The one-driver walk in `ReadingChrome.test.tsx` EXCLUDES this file by name; this is the
    // companion case that keeps the exclusion honest from the banner's side. Comment-stripped:
    // the docblock legitimately NAMES the hook while forbidding it.
    const source = readFileSync(join(__dirname, 'WelcomeBackBanner.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/useChromeReveal/);
  });
});
