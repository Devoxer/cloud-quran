/**
 * The per-reciter downloads header (story 7-5's block, rewritten 2026-09-11).
 *
 * ⚠️ THE CASE THIS FILE EXISTS FOR IS THE ORDERING. "An approximate total was shown BEFORE the
 * confirmation" is an explicit acceptance criterion, and moving `setPrompt` above the `await`
 * satisfies every type and renders a dialog promising "About 0 B" — a confirmation the reader
 * answers on no information at all. Nothing else in the tree can see that edit.
 *
 * ⚠️ AND IT PINS THE DE-CLUTTERING, which is otherwise a thing only a screenshot can see. The
 * block this replaces drew four rows over a progress panel; the rule now is that a running queue
 * shows the progress card and NO action row, a complete voice shows a mark and NO action, and a
 * failure is a message carrying its own retry rather than a menu item that is usually absent.
 *
 * The runner is mocked throughout: what it does to the queue is `audioDownloads.test.ts`'s
 * subject, and what is proven only here is which control calls what, and when.
 */

const mockQueueAll = jest.fn();
const mockCancelAll = jest.fn();
const mockRetryFailed = jest.fn();
const mockHydrate = jest.fn();
let mockBytesOnDisk = 0;
/** Free bytes the platform reports; `null` is "it would not say". */
let mockFreeSpace: number | null = null;
let mockMetered = false;

jest.mock('../lib/audioDownloads', () => ({
  DOWNLOADS_SUPPORTED: true,
  hydrateDownloadState: (...args: unknown[]) => mockHydrate(...args),
  queueReciterDownloads: (...args: unknown[]) => mockQueueAll(...args),
  cancelReciterDownloads: (...args: unknown[]) => mockCancelAll(...args),
  retryFailedDownloads: (...args: unknown[]) => mockRetryFailed(...args),
  reciterBytesOnDisk: () => mockBytesOnDisk,
  availableDownloadSpace: () => mockFreeSpace,
  // The real arithmetic is `audioDownloads.test.ts`'s; here it only has to be deterministic.
  estimateReciterDownload: () => ({ bytes: 1_000_000, surahs: 114 }),
}));

/**
 * ⚠️ THE NATIVE `<Dialog>` IS OS CHROME AND IS NOT QUERYABLE IN JEST (UIAlertController / M3
 * AlertDialog render host views, not RN buttons) — `ConfirmDialog.test.tsx` records this and
 * stubs it the same way.
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
import { ReciterDownloadsHeader } from './ReciterDownloadsHeader';

const PREFIX = 'downloads';

beforeEach(() => {
  jest.clearAllMocks();
  mockManifestFails = false;
  mockBytesOnDisk = 0;
  mockFreeSpace = null;
  mockMetered = false;
  useDownloadQueueStore.setState({ entries: {} });
});

function renderBlock() {
  return render(
    <ReciterDownloadsHeader
      reciterId="husary"
      reciterName="Mahmoud Khalil Al-Husary"
      testIDPrefix={PREFIX}
    />
  );
}

/** Press the action row and let the manifest promise settle. */
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
    expect(screen.getByText('About 976.6 KB across 114 files, approximate.')).toBeTruthy();
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
      screen.getByText('About 976.6 KB across 114 files on a metered connection.')
    ).toBeTruthy();
  });

  it('says nothing about the connection when it is not metered', async () => {
    renderBlock();
    await pressDownloadAll();

    expect(screen.getByText('About 976.6 KB across 114 files, approximate.')).toBeTruthy();
  });
});

describe('the one action row', () => {
  it('offers the whole book when nothing is kept', () => {
    renderBlock();
    expect(screen.getByTestId(`${PREFIX}-download-all`)).toHaveTextContent(/Download all surahs/);
    expect(screen.getByTestId(`${PREFIX}-download-all`)).toHaveTextContent(
      /Nothing downloaded yet/
    );
  });

  it('offers only the REST once part of the book is kept', () => {
    act(() => setDownloadEntry('husary:1', { status: 'downloaded', progress: 1 }));
    renderBlock();

    expect(screen.getByTestId(`${PREFIX}-download-all`)).toHaveTextContent(
      /Download the remaining surahs/
    );
  });

  /**
   * ⚠️ NOT A DISABLED BUTTON — NO BUTTON. A control that cannot act reads as a broken row; the
   * complete state states the fact and offers nothing, and removing is the list footer's job.
   */
  it('becomes a mark, not an action, once every surah is kept', () => {
    act(() => {
      for (let surah = 1; surah <= 114; surah += 1) {
        setDownloadEntry(`husary:${surah}`, { status: 'downloaded', progress: 1 });
      }
    });
    renderBlock();

    expect(screen.queryByTestId(`${PREFIX}-download-all`)).toBeNull();
    expect(screen.getByTestId(`${PREFIX}-complete`)).toHaveTextContent(/114 of 114 surahs/);
  });
});

describe('a running queue', () => {
  /**
   * ⚠️ THE ACTION ROW AND THE PROGRESS CARD ARE MUTUALLY EXCLUSIVE. Shipping both is exactly the
   * redundancy the owner called out: a row saying "3 still queued" over a panel saying the same
   * thing in bytes. The stop is inside the card.
   */
  it('replaces the action row with the progress card, stop and all', () => {
    renderBlock();
    expect(screen.queryByTestId(`${PREFIX}-progress`)).toBeNull();

    act(() => setDownloadEntry('husary:1', { status: 'downloading', progress: 0.3 }));

    expect(screen.queryByTestId(`${PREFIX}-download-all`)).toBeNull();
    fireEvent.press(screen.getByTestId(`${PREFIX}-progress-stop`));
    expect(mockCancelAll).toHaveBeenCalledWith('husary');
  });
});

describe('failures', () => {
  /** "102 of 114" with nothing saying twelve failed is the state this ends. (Review P6.) */
  it('are counted, and retryable, on the message itself', () => {
    act(() => {
      setDownloadEntry('husary:1', { status: 'downloaded', progress: 1 });
      setDownloadEntry('husary:2', { status: 'error', progress: 0, error: 'HTTP 404' });
    });
    renderBlock();

    expect(screen.getByText('1 could not be downloaded')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry failed downloads'));
    expect(mockRetryFailed).toHaveBeenCalledWith('husary');
  });

  it('leave the notice absent when there are none', () => {
    renderBlock();
    expect(screen.queryByTestId(`${PREFIX}-retry-failed`)).toBeNull();
  });
});

describe('the mirror', () => {
  it('is seeded from disk on arrival', () => {
    renderBlock();
    expect(mockHydrate).toHaveBeenCalledWith('husary');
  });
});
