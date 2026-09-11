/**
 * The whole-reciter offline block (story 7-5).
 *
 * ⚠️ THE CASE THIS FILE EXISTS FOR IS THE ORDERING. "An approximate total was shown BEFORE the
 * confirmation" is an explicit acceptance criterion, and moving `setPrompt` above the `await`
 * satisfies every type and renders a dialog promising "About 0 B" — a confirmation the reader
 * answers on no information at all. Nothing else in the tree can see that edit.
 *
 * The runner is mocked throughout: what it does to the queue is `audioDownloads.test.ts`'s
 * subject, and what is proven only here is which row calls what, and when.
 */

const mockQueueAll = jest.fn();
const mockDeleteAll = jest.fn();
const mockCancelAll = jest.fn();
const mockRetryFailed = jest.fn();
const mockDeleteOrphans = jest.fn();
const mockHydrate = jest.fn();
let mockBytesOnDisk = 0;
let mockOrphanBytes = 0;
/** Free bytes the platform reports; `null` is "it would not say". */
let mockFreeSpace: number | null = null;
let mockMetered = false;

jest.mock('../lib/audioDownloads', () => ({
  DOWNLOADS_SUPPORTED: true,
  hydrateDownloadState: (...args: unknown[]) => mockHydrate(...args),
  queueReciterDownloads: (...args: unknown[]) => mockQueueAll(...args),
  deleteReciterDownloads: (...args: unknown[]) => mockDeleteAll(...args),
  cancelReciterDownloads: (...args: unknown[]) => mockCancelAll(...args),
  retryFailedDownloads: (...args: unknown[]) => mockRetryFailed(...args),
  deleteOrphanedDownloads: (...args: unknown[]) => mockDeleteOrphans(...args),
  reciterBytesOnDisk: () => mockBytesOnDisk,
  orphanedDownloadBytes: () => mockOrphanBytes,
  availableDownloadSpace: () => mockFreeSpace,
  // The real arithmetic is `audioDownloads.test.ts`'s; here it only has to be deterministic.
  estimateReciterDownload: () => ({ bytes: 1_000_000, surahs: 114 }),
}));

/**
 * ⚠️ THE NATIVE `<Dialog>` IS OS CHROME AND IS NOT QUERYABLE IN JEST (UIAlertController / M3
 * AlertDialog render host views, not RN buttons) — `ConfirmDialog.test.tsx` records this and
 * stubs it the same way. Only one prompt is ever open, so the two dialogs cannot collide.
 */
jest.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ open, title, message, confirmText, cancelText, onConfirm, onCancel }: any) => {
    const React = require('react');
    const { Pressable, Text } = require('react-native');
    if (!open) return null;
    return React.createElement(
      Pressable,
      null,
      React.createElement(Text, null, title),
      React.createElement(Text, null, message),
      React.createElement(
        Pressable,
        { onPress: onConfirm },
        React.createElement(Text, null, confirmText)
      ),
      React.createElement(
        Pressable,
        { onPress: onCancel },
        React.createElement(Text, null, cancelText)
      )
    );
  },
}));

jest.mock('@/lib/connectivity', () => ({
  isMeteredConnection: jest.fn(async () => mockMetered),
}));

let mockManifestFails = false;
jest.mock('@/lib/reciterManifest', () => ({
  loadReciterManifest: jest.fn(async () => {
    if (mockManifestFails) throw new Error('offline');
    return new Map();
  }),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { setDownloadEntry, useDownloadQueueStore } from '@/stores/downloadQueueStore';
import { ReciterDownloads } from './ReciterDownloads';

const PREFIX = 'downloads';

beforeEach(() => {
  jest.clearAllMocks();
  mockManifestFails = false;
  mockBytesOnDisk = 0;
  mockOrphanBytes = 0;
  mockFreeSpace = null;
  mockMetered = false;
  useDownloadQueueStore.setState({ entries: {} });
});

function renderBlock() {
  return render(<ReciterDownloads reciterId="husary" testIDPrefix={PREFIX} />);
}

/** Press "download all" and let the manifest promise settle. */
async function pressDownloadAll() {
  await act(async () => {
    fireEvent.press(screen.getByTestId(`${PREFIX}-download-all`));
  });
}

describe('the estimate is shown BEFORE the confirmation', () => {
  it('opens no dialog until the size is known, then opens one carrying it', async () => {
    renderBlock();
    // Nothing is promised before the press.
    expect(screen.queryByText(/About/)).toBeNull();

    await pressDownloadAll();

    // 1,000,000 bytes → "976.6 KB"; the copy says "About", and names the manifest's count.
    expect(
      screen.getByText('About 976.6 KB across 114 files. The size is approximate.')
    ).toBeTruthy();
    // …and nothing has been queued yet — the dialog is a question, not an action.
    expect(mockQueueAll).not.toHaveBeenCalled();
  });

  it('queues the whole book only once the reader confirms', async () => {
    renderBlock();
    await pressDownloadAll();
    fireEvent.press(screen.getByText('Download'));
    expect(mockQueueAll).toHaveBeenCalledWith('husary');
  });

  /** No network means no estimate AND nothing to download — but never silence. (Review P15.) */
  it('opens no dialog when the manifest cannot be loaded, and says so', async () => {
    mockManifestFails = true;
    renderBlock();
    await pressDownloadAll();

    expect(screen.queryByText(/About/)).toBeNull();
    expect(screen.getByTestId(`${PREFIX}-estimate-failed`)).toBeTruthy();
    expect(mockQueueAll).not.toHaveBeenCalled();
  });
});

describe('before a gigabyte is spent', () => {
  /**
   * ⚠️ A REFUSAL THAT SAYS NOTHING IS A BROKEN BUTTON. The estimate is 1,000,000 bytes here and
   * the device has 500,000 free: no dialog opens, nothing queues, and the row says why.
   */
  it('refuses when there is not room, and states the size', async () => {
    mockFreeSpace = 500_000;
    renderBlock();
    await pressDownloadAll();

    expect(screen.queryByText(/About/)).toBeNull();
    expect(mockQueueAll).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Not enough free space for about 976.6 KB. Free some up, or download surahs one by one.'
      )
    ).toBeTruthy();
  });

  /** ⚠️ UNKNOWN IS NOT FULL — `null` must never stop a reader whose device has plenty. */
  it('asks anyway when the platform will not say how much room there is', async () => {
    mockFreeSpace = null;
    renderBlock();
    await pressDownloadAll();

    expect(screen.getByText(/About 976.6 KB/)).toBeTruthy();
  });

  it('asks when there is room', async () => {
    mockFreeSpace = 8_000_000_000;
    renderBlock();
    await pressDownloadAll();

    expect(screen.getByText(/About 976.6 KB/)).toBeTruthy();
  });

  /**
   * A metered connection WARNS rather than refusing: it is the situation the reader is
   * downloading for, and the only failure worth preventing is spending an allowance unaware.
   */
  it('names a metered connection in the confirmation', async () => {
    mockMetered = true;
    renderBlock();
    await pressDownloadAll();

    expect(
      screen.getByText(
        'About 976.6 KB across 114 files, on a metered connection. The size is approximate.'
      )
    ).toBeTruthy();
  });

  it('says nothing about the connection when it is not metered', async () => {
    renderBlock();
    await pressDownloadAll();

    expect(
      screen.getByText('About 976.6 KB across 114 files. The size is approximate.')
    ).toBeTruthy();
  });
});

describe('remove-all', () => {
  it('confirms first, then deletes', () => {
    act(() => setDownloadEntry('husary:1', { status: 'downloaded', progress: 1 }));
    renderBlock();

    fireEvent.press(screen.getByTestId(`${PREFIX}-remove-all`));
    expect(mockDeleteAll).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Remove'));
    expect(mockDeleteAll).toHaveBeenCalledWith('husary');
  });

  it('is absent while nothing is kept — a remove with nothing to remove', () => {
    renderBlock();
    expect(screen.queryByTestId(`${PREFIX}-remove-all`)).toBeNull();
  });
});

describe('a running queue', () => {
  /** Per-row cancel is on another screen and remove-all needs something kept. (Review P7.) */
  it('offers a stop, which is absent when nothing is moving', () => {
    renderBlock();
    expect(screen.queryByTestId(`${PREFIX}-stop`)).toBeNull();

    act(() => setDownloadEntry('husary:1', { status: 'downloading', progress: 0.3 }));
    fireEvent.press(screen.getByTestId(`${PREFIX}-stop`));
    expect(mockCancelAll).toHaveBeenCalledWith('husary');
  });
});

describe('failures', () => {
  /** "102 of 114" with nothing saying twelve failed is the state this ends. (Review P6.) */
  it('are counted, and retryable, separately from what is kept', () => {
    act(() => {
      setDownloadEntry('husary:1', { status: 'downloaded', progress: 1 });
      setDownloadEntry('husary:2', { status: 'error', progress: 0, error: 'HTTP 404' });
    });
    renderBlock();

    expect(screen.getByText('1 could not be downloaded')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`${PREFIX}-retry-failed`));
    expect(mockRetryFailed).toHaveBeenCalledWith('husary');
  });

  it('leave the retry row absent when there are none', () => {
    renderBlock();
    expect(screen.queryByTestId(`${PREFIX}-retry-failed`)).toBeNull();
  });
});

describe('downloads under a withdrawn voice', () => {
  /** `abdulkareem` left the catalogue; its files are otherwise unreachable. (Review P14.) */
  it('are offered for removal once the disk read lands', async () => {
    mockOrphanBytes = 5_000_000;
    jest.useFakeTimers();
    try {
      renderBlock();
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      fireEvent.press(screen.getByTestId(`${PREFIX}-remove-orphans`));
      expect(mockDeleteOrphans).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('are not mentioned when there are none', () => {
    renderBlock();
    expect(screen.queryByTestId(`${PREFIX}-remove-orphans`)).toBeNull();
  });
});

describe('the mirror', () => {
  it('is seeded from disk on arrival', () => {
    renderBlock();
    expect(mockHydrate).toHaveBeenCalledWith('husary');
  });
});
