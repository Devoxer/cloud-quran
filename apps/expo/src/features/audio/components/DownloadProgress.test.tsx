/**
 * The granular progress panel (2026-09-11).
 *
 * ⚠️ WHAT THIS PINS IS THAT A READER CAN TELL A WORKING DOWNLOAD FROM A DEAD ONE. The reciter
 * block's own rows move once per completed FILE; through Al-Baqarah that is minutes of a number
 * that does not change, which is exactly the "we can't know" the device test produced. Delete the
 * byte line and every other suite in the tree stays green.
 *
 * ⚠️ AND IT PINS THE FOREGROUND-ONLY SENTENCE, which is the one place the app corrects a claim it
 * shipped. Only the transfer already handed to the OS survives suspension on iOS; the loop that
 * starts the next one is JS, and a suspended app runs none. A UI that says "download all" without
 * saying that has lied to a reader who came back to 1 of 114.
 */

import { render, screen } from '@testing-library/react-native';

import { setDownloadEntry, useDownloadQueueStore } from '@/stores/downloadQueueStore';
import { DownloadProgress } from './DownloadProgress';

beforeEach(() => {
  useDownloadQueueStore.setState({ entries: {} });
});

describe('while nothing is transferring', () => {
  it('renders nothing at all', () => {
    render(<DownloadProgress reciterId="husary" testID="progress" />);
    expect(screen.queryByTestId('progress')).toBeNull();
  });

  it('stays absent for a queue that has not started a file yet', () => {
    setDownloadEntry('husary:2', { status: 'queued', progress: 0 });
    render(<DownloadProgress reciterId="husary" testID="progress" />);
    expect(screen.queryByTestId('progress')).toBeNull();
  });

  it('ignores another voice entirely — downloads are per reciter', () => {
    setDownloadEntry('alafasy:2', {
      status: 'downloading',
      progress: 0.5,
      bytesWritten: 1,
      totalBytes: 2,
    });
    render(<DownloadProgress reciterId="husary" testID="progress" />);
    expect(screen.queryByTestId('progress')).toBeNull();
  });
});

describe('while a surah is transferring', () => {
  it('names the surah and reports the BYTES, not only a fraction', () => {
    setDownloadEntry('husary:2', {
      status: 'downloading',
      progress: 0.3,
      bytesWritten: 13_000_000,
      totalBytes: 43_000_000,
    });
    setDownloadEntry('husary:3', { status: 'queued', progress: 0 });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
    // Literal, not derived from the formatter under the component.
    expect(screen.getByTestId('progress-detail').props.children).toBe(
      '12.4 MB of 41 MB · 2 in queue'
    );
  });

  it('draws the bar at the fraction the transfer has reached', () => {
    setDownloadEntry('husary:2', {
      status: 'downloading',
      progress: 0.25,
      bytesWritten: 10,
      totalBytes: 40,
    });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    expect(screen.getByTestId('progress-fill').props.style).toEqual(
      expect.arrayContaining([{ width: '25%' }])
    );
  });

  /**
   * ⚠️ `totalBytes: 0` IS "THE SERVER SENT NO CONTENT-LENGTH", NOT AN EMPTY FILE. A rising count
   * is still proof of life; `12.4 MB of 0 B` is the believable-wrong-value family this repo keeps
   * recording, and a bar that never moves is the stuck look the panel exists to end.
   */
  it('drops the denominator when the server sent no Content-Length', () => {
    setDownloadEntry('husary:2', {
      status: 'downloading',
      progress: 0,
      bytesWritten: 13_000_000,
      totalBytes: 0,
    });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    expect(screen.getByTestId('progress-detail').props.children).toBe(
      '12.4 MB so far · 1 in queue'
    );
  });

  it('says the queue needs the app open — the claim the device test disproved', () => {
    setDownloadEntry('husary:2', {
      status: 'downloading',
      progress: 0.1,
      bytesWritten: 1,
      totalBytes: 10,
    });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    expect(
      screen.getByText('Downloads pause when you leave the app. Keep it open to finish the queue.')
    ).toBeTruthy();
  });
});
