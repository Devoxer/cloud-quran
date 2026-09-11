/**
 * The per-surah offline control (story 7-5).
 *
 * ⚠️ WHAT THIS PINS IS WHICH ACTION EACH PRESS TAKES, and that is not decoration: swapping the
 * `downloaded` and `in flight` branches makes a completed download undeletable and re-queues a
 * file that is already there, and nothing else in the tree reddens for it. The glyph map is the
 * second half — four states, four different things on screen, none of which typecheck apart.
 *
 * ⚠️ AND IT PINS THE ROW'S OWN PAIR. Story 6-4's recorded defect was a control that reported the
 * SCREEN's current surah rather than its own row's, which minted bookmarks against the wrong
 * verse during an async resync; the same shape here would download the wrong surah. Two buttons
 * are rendered together and only one is pressed.
 *
 * The runner is mocked: what it does with the queue belongs to `audioDownloads.test.ts`, and
 * what is proven only here is the wiring.
 */

const mockStart = jest.fn();
const mockCancel = jest.fn();
const mockDelete = jest.fn();
let mockSupported = true;

jest.mock('../lib/audioDownloads', () => ({
  get DOWNLOADS_SUPPORTED() {
    return mockSupported;
  },
  startSurahDownload: (...args: unknown[]) => mockStart(...args),
  cancelSurahDownload: (...args: unknown[]) => mockCancel(...args),
  deleteSurahDownload: (...args: unknown[]) => mockDelete(...args),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  type DownloadEntry,
  setDownloadEntry,
  useDownloadQueueStore,
} from '@/stores/downloadQueueStore';
import { SurahDownloadButton } from './SurahDownloadButton';

beforeEach(() => {
  jest.clearAllMocks();
  mockSupported = true;
  useDownloadQueueStore.setState({ entries: {} });
});

/**
 * The glyphs are `accessibilityElementsHidden` on purpose — the Pressable carries the label — so
 * RNTL's default query, which skips hidden subtrees, cannot see them. Asking for them explicitly
 * is the point: their a11y invisibility is itself part of what this file pins.
 */
const glyph = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });

/** Render one control for Al-Ikhlas under `husary`, optionally with a starting entry. */
function renderControl(entry?: DownloadEntry) {
  if (entry) setDownloadEntry('husary:112', entry);
  return render(
    <SurahDownloadButton
      reciterId="husary"
      surah={112}
      surahName="Al-Ikhlas"
      testID="surah-download-112"
    />
  );
}

describe('the glyph says which state the surah is in', () => {
  it('offers a download when nobody has touched it', () => {
    renderControl();
    expect(glyph('surah-download-112-idle')).toBeTruthy();
  });

  it('spins while queued, before any byte has landed', () => {
    renderControl({ status: 'queued', progress: 0 });
    expect(screen.getByTestId('surah-download-112-pending')).toBeTruthy();
  });

  it('shows the percentage once there is one worth showing', () => {
    renderControl({ status: 'downloading', progress: 0.42 });
    expect(screen.getByTestId('surah-download-112-progress')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
  });

  /** ⚠️ A 137 MB surah reads under one per cent for seconds — the stuck look. (Review P17.) */
  it('stays indeterminate below one per cent rather than reading 0%', () => {
    renderControl({ status: 'downloading', progress: 0.004 });
    expect(screen.getByTestId('surah-download-112-pending')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('marks a kept surah', () => {
    renderControl({ status: 'downloaded', progress: 1 });
    expect(glyph('surah-download-112-downloaded')).toBeTruthy();
  });

  it('marks a failed one, and SPEAKS the reason', () => {
    renderControl({ status: 'error', progress: 0, error: 'HTTP 507' });
    expect(glyph('surah-download-112-error')).toBeTruthy();
    expect(screen.getByLabelText(/HTTP 507/)).toBeTruthy();
  });
});

describe('which action a press takes', () => {
  it('starts a download when nothing is kept', () => {
    renderControl();
    fireEvent.press(screen.getByTestId('surah-download-112'));
    expect(mockStart).toHaveBeenCalledWith('husary', 112);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('DELETES a kept one — never re-queues it', () => {
    renderControl({ status: 'downloaded', progress: 1 });
    fireEvent.press(screen.getByTestId('surah-download-112'));
    expect(mockDelete).toHaveBeenCalledWith('husary', 112);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('cancels one in flight', () => {
    renderControl({ status: 'downloading', progress: 0.5 });
    fireEvent.press(screen.getByTestId('surah-download-112'));
    expect(mockCancel).toHaveBeenCalledWith('husary', 112);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('cancels one that is merely queued', () => {
    renderControl({ status: 'queued', progress: 0 });
    fireEvent.press(screen.getByTestId('surah-download-112'));
    expect(mockCancel).toHaveBeenCalledWith('husary', 112);
  });

  it('retries a failed one', () => {
    renderControl({ status: 'error', progress: 0, error: 'HTTP 404' });
    fireEvent.press(screen.getByTestId('surah-download-112'));
    expect(mockStart).toHaveBeenCalledWith('husary', 112);
  });
});

describe('the row it reports', () => {
  /** Story 6-4's recorded wrong-row defect, in this control's shape. */
  it('is its OWN pair, never a neighbour it happens to be rendered beside', () => {
    setDownloadEntry('husary:113', { status: 'downloaded', progress: 1 });
    render(
      <>
        <SurahDownloadButton
          reciterId="husary"
          surah={112}
          surahName="Al-Ikhlas"
          testID="surah-download-112"
        />
        <SurahDownloadButton
          reciterId="husary"
          surah={113}
          surahName="Al-Falaq"
          testID="surah-download-113"
        />
      </>
    );

    // 113 is kept and 112 is not: each control reads its own key.
    expect(glyph('surah-download-112-idle')).toBeTruthy();
    expect(glyph('surah-download-113-downloaded')).toBeTruthy();

    fireEvent.press(screen.getByTestId('surah-download-112'));
    expect(mockStart).toHaveBeenCalledWith('husary', 112);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});

describe('web', () => {
  /** There is no document directory in a browser, so the control would be a dead button. */
  it('renders nothing at all', () => {
    mockSupported = false;
    renderControl();
    expect(screen.queryByTestId('surah-download-112')).toBeNull();
  });
});
