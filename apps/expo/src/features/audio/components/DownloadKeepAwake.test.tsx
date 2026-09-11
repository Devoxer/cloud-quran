/**
 * The download wake lock (story 7-5 follow-up).
 *
 * ⚠️ THE PROPERTY UNDER TEST IS THE *RELEASE*, NOT THE HOLD. A lock that is taken and never given
 * back is invisible to every other gate and costs the reader their battery — and because
 * `useKeepAwake` holds for as long as its owner is mounted, "released" here means "the owner is
 * gone". So the cases assert on mounting: nothing while the queue is idle, something while it
 * moves, and nothing again once the last surah lands.
 */

const mockUseKeepAwake = jest.fn();
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: (...args: unknown[]) => mockUseKeepAwake(...args),
}));

import { act, render } from '@testing-library/react-native';

import {
  resetDownloadEntry,
  setDownloadEntry,
  useDownloadQueueStore,
} from '@/stores/downloadQueueStore';
import { DownloadKeepAwake } from './DownloadKeepAwake';

beforeEach(() => {
  jest.clearAllMocks();
  useDownloadQueueStore.setState({ entries: {} });
});

describe('the screen is kept lit', () => {
  it('is not held while nothing is downloading', () => {
    render(<DownloadKeepAwake reciterId="husary" />);
    expect(mockUseKeepAwake).not.toHaveBeenCalled();
  });

  it('is held while a surah is in flight', () => {
    render(<DownloadKeepAwake reciterId="husary" />);
    act(() => setDownloadEntry('husary:18', { status: 'downloading', progress: 0.4 }));
    expect(mockUseKeepAwake).toHaveBeenCalled();
  });

  /** A serial queue is between files for a tick after each one; the lock must not drop there. */
  it('is held while surahs are merely queued', () => {
    render(<DownloadKeepAwake reciterId="husary" />);
    act(() => setDownloadEntry('husary:2', { status: 'queued', progress: 0 }));
    expect(mockUseKeepAwake).toHaveBeenCalled();
  });

  it('is released once the last surah lands', () => {
    render(<DownloadKeepAwake reciterId="husary" />);
    act(() => setDownloadEntry('husary:18', { status: 'downloading', progress: 0.4 }));
    mockUseKeepAwake.mockClear();

    act(() => setDownloadEntry('husary:18', { status: 'downloaded', progress: 1 }));
    expect(mockUseKeepAwake).not.toHaveBeenCalled();
  });

  it('is released when the download is cancelled', () => {
    render(<DownloadKeepAwake reciterId="husary" />);
    act(() => setDownloadEntry('husary:18', { status: 'downloading', progress: 0.4 }));
    mockUseKeepAwake.mockClear();

    act(() => resetDownloadEntry('husary:18'));
    expect(mockUseKeepAwake).not.toHaveBeenCalled();
  });

  /** Downloads are per reciter, and so is the reason to keep the screen on. */
  it('ignores another voice queue', () => {
    render(<DownloadKeepAwake reciterId="husary" />);
    act(() => setDownloadEntry('alafasy:18', { status: 'downloading', progress: 0.4 }));
    expect(mockUseKeepAwake).not.toHaveBeenCalled();
  });
});
