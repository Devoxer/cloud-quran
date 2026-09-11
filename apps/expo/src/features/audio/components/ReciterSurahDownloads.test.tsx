/**
 * One reciter's surah list, opened from the picker row's chevron (2026-09-11).
 *
 * ⚠️ WHAT THIS PINS IS THE THING NO NATIVE SURFACE CAN SEE: the control is a SIBLING of the row,
 * never inside its `trailing` slot. That slot renders inside the row's own `Pressable`, and
 * react-native-web turns every `accessibilityRole="button"` Pressable into a real `<button>` — a
 * control there is a `<button>` in a `<button>`, which React reports as a hydration error and
 * which story 7-5 measured in Safari after shipping it. iOS and Android render the nesting fine,
 * so a test is the only cheap guard.
 *
 * ⚠️ AND IT PINS THE RESOLUTION. A link carrying a withdrawn id (`abdulkareem`, removed
 * 2026-09-08) must not open a screen that files downloads under a voice nothing can play.
 *
 * ⚠️ AND IT PINS THAT THE BODY DOES NOT NAME THE VOICE. The header bar does, from the route's
 * `id` (`(profile)/_layout.tsx`), so an h2 here would be the same subject announced twice under a
 * bar that already said it. (Owner, 2026-09-11.)
 *
 * ⚠️ AND IT PINS REMOVE-ALL AS THE FOOTER. At the top it sat one thumb-width under "Download all
 * surahs"; at the bottom it is where a list screen's irreversible action belongs, and it is
 * absent entirely while there is nothing to remove.
 */

const mockHydrate = jest.fn();
const mockDeleteReciter = jest.fn();
jest.mock('../lib/audioDownloads', () => ({
  DOWNLOADS_SUPPORTED: true,
  hydrateDownloadState: (...args: unknown[]) => mockHydrate(...args),
  startSurahDownload: jest.fn(),
  cancelSurahDownload: jest.fn(),
  deleteSurahDownload: jest.fn(),
  cancelReciterDownloads: jest.fn(),
  deleteReciterDownloads: (...args: unknown[]) => mockDeleteReciter(...args),
  deleteOrphanedDownloads: jest.fn(),
  retryFailedDownloads: jest.fn(),
  orphanedDownloadBytes: () => 0,
  reciterBytesOnDisk: () => 0,
  availableDownloadSpace: () => null,
  estimateReciterDownload: () => ({ bytes: 1_000_000, surahs: 114 }),
  queueReciterDownloads: jest.fn(),
}));

/**
 * ⚠️ THE GLOBAL FLASHLIST MOCK IS A REAL `FlatList`, WHICH VIRTUALIZES — it renders about ten
 * rows and nothing below them. A non-virtualizing stand-in is the house answer here
 * (`surahs-screen.test.tsx` and the picker's suite both do it), but this list is 114 rows, so it
 * renders only the header and the first handful deliberately: every assertion below is about
 * surah 1 or the header.
 */
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = (props: any) =>
    React.createElement(
      View,
      { testID: props.testID },
      props.ListHeaderComponent ?? null,
      (props.data ?? [])
        .slice(0, 3)
        .map((item: any, index: number) =>
          React.createElement(
            React.Fragment,
            { key: props.keyExtractor(item, index) },
            props.renderItem({ item, index })
          )
        ),
      // The footer is a real branch of this screen — a mock that dropped it would leave
      // remove-all unobserved in both directions.
      props.ListFooterComponent ?? null
    );
  return { __esModule: true, FlashList };
});

/** The native dialog is OS chrome and is not queryable in jest — `ConfirmDialog.test.tsx`'s note. */
jest.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ open, message, confirmText, onConfirm }: any) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    if (!open) return null;
    return React.createElement(
      Pressable,
      null,
      React.createElement(Text, null, message),
      React.createElement(
        Pressable,
        { onPress: onConfirm },
        React.createElement(Text, null, confirmText)
      )
    );
  },
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import { setDownloadEntry, useDownloadQueueStore } from '@/stores/downloadQueueStore';
import { ReciterSurahDownloads } from './ReciterSurahDownloads';

beforeEach(() => {
  jest.clearAllMocks();
  useDownloadQueueStore.setState({ entries: {} });
});

it('seeds the queue mirror for the voice it is about', () => {
  render(<ReciterSurahDownloads reciterId="husary" />);

  expect(mockHydrate).toHaveBeenCalledWith('husary');
  expect(screen.getByTestId('reciter-downloads-body')).toBeTruthy();
});

it('does NOT repeat the voice name in the body — the header bar is the one that says it', () => {
  render(<ReciterSurahDownloads reciterId="husary" />);

  expect(screen.queryByText('Mahmoud Khalil Al-Husary')).toBeNull();
});

describe('remove-all', () => {
  it('is absent while nothing is kept — a remove with nothing to remove', () => {
    render(<ReciterSurahDownloads reciterId="husary" />);

    expect(screen.queryByTestId('reciter-downloads-remove-all')).toBeNull();
  });

  it('is the list FOOTER once something is kept, and confirms before deleting', () => {
    setDownloadEntry('husary:1', { status: 'downloaded', progress: 1 });
    render(<ReciterSurahDownloads reciterId="husary" />);

    fireEvent.press(screen.getByTestId('reciter-downloads-remove-all'));
    expect(mockDeleteReciter).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Remove'));
    expect(mockDeleteReciter).toHaveBeenCalledWith('husary');
  });
});

it('falls back to the default voice for an id the catalogue no longer offers', () => {
  render(<ReciterSurahDownloads reciterId="abdulkareem" />);

  // Resolved, never merely read — a withdrawn id must not become a download directory.
  expect(mockHydrate).toHaveBeenCalledWith('alafasy');
  expect(screen.queryByText('abdulkareem')).toBeNull();
});

it('keeps the per-surah control OUTSIDE the row, where web would nest two buttons', () => {
  render(<ReciterSurahDownloads reciterId="husary" />);

  const row = screen.getByTestId('reciter-surah-row-1');
  const stack: any[] = [row];
  let nested = false;
  while (stack.length > 0) {
    const node = stack.pop();
    if (node?.props?.testID === 'reciter-surah-download-1') nested = true;
    for (const child of node?.children ?? []) if (typeof child !== 'string') stack.push(child);
  }

  expect(screen.getByTestId('reciter-surah-download-1')).toBeTruthy();
  expect(nested).toBe(false);
});

/**
 * ⚠️ A ROW PRESS DOES NOTHING HERE, AND `ListRow` WITHOUT `onPress` IS A PLAIN `View`. This is a
 * downloads surface for a voice that may not be the reader's chosen one, so a tap that jumped
 * into reading would either silently change their reciter or play the wrong one.
 */
it('leaves the row itself inert — the control is the whole interaction', () => {
  render(<ReciterSurahDownloads reciterId="husary" />);

  expect(screen.getByTestId('reciter-surah-row-1').props.accessibilityRole).toBeUndefined();
});
