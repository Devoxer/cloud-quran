/**
 * The settings shell's header title — including the ONE leaf whose title is data (2026-09-11).
 *
 * ⚠️ WHAT THIS PINS IS THAT THE RECITER-DOWNLOADS SCREEN NAMES ITS VOICE IN THE BAR. The screen
 * used to read "Downloads" over a body that repeated the reciter's name as an h2; the body's copy
 * is gone (owner: "the reciter's name is already the screen title's subject — do not repeat it"),
 * so if this resolution ever regresses the screen stops saying WHICH voice it is about at all,
 * and nothing else in the tree would notice.
 *
 * ⚠️ AND IT PINS THE FALLBACKS IN BOTH DIRECTIONS: a link with no `id` still renders the static
 * "Downloads" key, and a link carrying a WITHDRAWN id renders the default voice rather than
 * echoing an id the catalogue no longer offers back at the reader.
 */

let mockSegments: string[] = ['(tabs)', '(profile)', 'account'];
let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  Stack: () => null,
  useSegments: () => mockSegments,
  useGlobalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
}));

jest.mock('@/components/ui/AppTabBar', () => ({ AppTabBar: () => null }));

import { render, screen } from '@testing-library/react-native';

import ProfileLayout from '@/app/(tabs)/(profile)/_layout';

function renderAt(leaf: string, params: Record<string, string | undefined> = {}) {
  mockSegments = ['(tabs)', '(profile)', leaf];
  mockParams = params;
  return render(<ProfileLayout />);
}

it('resolves a static leaf from the title table', () => {
  renderAt('recitation');
  expect(screen.getByTestId('app-header')).toHaveTextContent(/Recitation/);
});

it('names the VOICE on the reciter-downloads leaf, not the word Downloads', () => {
  renderAt('reciter-downloads', { id: 'husary' });

  expect(screen.getByTestId('app-header')).toHaveTextContent(/Mahmoud Khalil Al-Husary/);
  expect(screen.queryByText('Downloads')).toBeNull();
});

it('falls back to the static title when the link carries no id', () => {
  renderAt('reciter-downloads');
  expect(screen.getByTestId('app-header')).toHaveTextContent(/Downloads/);
});

/** `abdulkareem` left the catalogue on 2026-09-08; its id must never be printed at a reader. */
it('resolves a withdrawn id to the default voice rather than echoing it', () => {
  renderAt('reciter-downloads', { id: 'abdulkareem' });

  expect(screen.getByTestId('app-header')).toHaveTextContent(/Mishary Rashid Al-Afasy/);
  expect(screen.queryByText('abdulkareem')).toBeNull();
});

/** The `id` belongs to one leaf only — every other screen keeps its key. */
it('ignores a stale id left on the URL by another screen', () => {
  renderAt('appearance', { id: 'husary' });
  expect(screen.getByTestId('app-header')).toHaveTextContent(/Appearance/);
});
