/**
 * The global storage footer (2026-09-11).
 *
 * ⚠️ WHAT THIS PINS IS THE REASON IT SURVIVED. The recitation screen's "download all" block was
 * deleted because every reciter row now carries the same action; these two facts stayed because
 * neither has a row to live on — the total across ALL voices, and the leftovers of a voice the
 * catalogue no longer offers (`abdulkareem`, withdrawn 2026-09-08), which by definition has no
 * row at all. A test that let the block render with nothing to report would be letting the
 * clutter back in through the other door, so the absent case is asserted first.
 *
 * ⚠️ AND IT PINS THE CONFIRMATION. Every other remove in this feature is one press, by story
 * 23.13's rule that a reversible remove does not get a dialog. This one is not reversible: the
 * app cannot download a withdrawn voice again, at any price.
 */

const mockDeleteOrphans = jest.fn();
let mockOrphanBytes = 0;
let mockBytesOnDisk = 0;

jest.mock('../lib/audioDownloads', () => ({
  DOWNLOADS_SUPPORTED: true,
  deleteOrphanedDownloads: (...args: unknown[]) => mockDeleteOrphans(...args),
  orphanedDownloadBytes: () => mockOrphanBytes,
  reciterBytesOnDisk: () => mockBytesOnDisk,
}));

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

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useDownloadQueueStore } from '@/stores/downloadQueueStore';
import { DownloadStorage } from './DownloadStorage';

beforeEach(() => {
  jest.clearAllMocks();
  mockOrphanBytes = 0;
  mockBytesOnDisk = 0;
  useDownloadQueueStore.setState({ entries: {} });
});

/** Render and let the debounced disk walk land. */
async function renderSettled() {
  jest.useFakeTimers();
  try {
    render(<DownloadStorage />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  } finally {
    jest.useRealTimers();
  }
}

it('renders nothing at all when no audio has been downloaded', async () => {
  await renderSettled();
  expect(screen.queryByTestId('download-storage')).toBeNull();
});

it('states the total across every voice, which no single row can', async () => {
  // 39 reciters × 1,000,000 bytes each; the assertion is a literal, not the sum re-derived.
  mockBytesOnDisk = 1_000_000;
  await renderSettled();

  expect(screen.getByTestId('download-storage-total')).toHaveTextContent(
    '37.2 MB downloaded on this device'
  );
});

describe('downloads under a withdrawn voice', () => {
  it('are offered for removal, and confirmed before anything is deleted', async () => {
    mockOrphanBytes = 5_000_000;
    await renderSettled();

    fireEvent.press(screen.getByTestId('download-storage-remove-orphans'));
    expect(mockDeleteOrphans).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Remove'));
    expect(mockDeleteOrphans).toHaveBeenCalled();
  });

  it('are not mentioned when there are none', async () => {
    mockBytesOnDisk = 1_000_000;
    await renderSettled();

    expect(screen.queryByTestId('download-storage-remove-orphans')).toBeNull();
  });
});
