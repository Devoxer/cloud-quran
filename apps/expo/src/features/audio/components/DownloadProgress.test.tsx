/**
 * The granular progress panel (2026-09-11).
 *
 * ⚠️ WHAT THIS PINS IS THAT A READER CAN TELL A WORKING DOWNLOAD FROM A DEAD ONE. The reciter
 * block's own rows move once per completed FILE; through Al-Baqarah that is minutes of a number
 * that does not change, which is exactly the "we can't know" the device test produced. Delete the
 * byte line and every other suite in the tree stays green.
 *
 * ⚠️ AND IT PINS THE BACKGROUND SENTENCE, WHICH IS TRUE IN BOTH DIRECTIONS AND WAS WRONG IN ONE.
 * The shipped line said "Downloads pause when you leave the app" — then the owner started
 * Al-Baqarah alone, backgrounded for two minutes, and found the file COMPLETE (`sessionType:
 * 'background'` hands the transfer in flight to the OS). An earlier test on a 114-file queue came
 * back at 1 of 114, because the loop that starts the NEXT file is JS and a suspended app runs
 * none. Copy that says either half alone is a lie; the assertion below is on the literal, so
 * rewording it to one half again reddens here.
 *
 * ⚠️ AND IT PINS THAT THE STOP IS IN THIS CARD. It used to be a `SettingsRow` above, so a running
 * queue drew its size twice — once as a control and once in bytes. (Owner, 2026-09-11.)
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

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

  /**
   * ⚠️ A QUEUE WITH NOTHING IN FLIGHT IS A STATE, NOT AN ABSENCE — and this component used to
   * render nothing for it. Between the confirmation and the first byte the screen went back to
   * offering "Download all surahs", which is the dead-looking gap the card exists to end.
   */
  it('draws the starting state for a queue that has not opened a file yet', () => {
    setDownloadEntry('husary:2', { status: 'queued', progress: 0 });
    setDownloadEntry('husary:3', { status: 'queued', progress: 0 });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    expect(screen.getByText('Starting the download')).toBeTruthy();
    expect(screen.getByTestId('progress-detail').props.children).toBe('2 still queued');
    expect(screen.getByTestId('progress-fill').props.style).toEqual(
      expect.arrayContaining([{ width: '0%' }])
    );
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

  it('says the in-flight surah finishes and the REST wait — both halves, measured', () => {
    setDownloadEntry('husary:2', {
      status: 'downloading',
      progress: 0.1,
      bytesWritten: 1,
      totalBytes: 10,
    });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    // Literal, and deliberately the whole sentence: half of it is the claim the device test
    // disproved, and the other half is the claim the device test confirmed.
    expect(
      screen.getByText(
        'The surah in progress finishes in the background. The rest wait until you come back.'
      )
    ).toBeTruthy();
  });

  it('offers no stop when the caller gave it no way to stop', () => {
    setDownloadEntry('husary:2', { status: 'downloading', progress: 0.1 });
    render(<DownloadProgress reciterId="husary" testID="progress" />);

    expect(screen.queryByTestId('progress-stop')).toBeNull();
  });

  it('stops the whole queue from inside the card, not from a row above it', () => {
    const onStop = jest.fn();
    setDownloadEntry('husary:2', { status: 'downloading', progress: 0.1 });
    render(
      <DownloadProgress
        reciterId="husary"
        reciterName="Mahmoud Khalil Al-Husary"
        onStop={onStop}
        testID="progress"
      />
    );

    const stop = screen.getByTestId('progress-stop');
    expect(stop.props.accessibilityLabel).toBe('Stop downloading Mahmoud Khalil Al-Husary');
    fireEvent.press(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ `accessible` ON THE CARD WOULD HIDE THE STOP. A container marked accessible collapses its
   * subtree into one node, so the only action on a running queue would stop existing for
   * VoiceOver and TalkBack while remaining perfectly visible.
   */
  it('keeps the stop reachable beside the one-node progress announcement', () => {
    setDownloadEntry('husary:2', { status: 'downloading', progress: 0.1 });
    render(<DownloadProgress reciterId="husary" onStop={jest.fn()} testID="progress" />);

    expect(screen.getByTestId('progress').props.accessible).not.toBe(true);
    expect(screen.getByTestId('progress-stop')).toBeTruthy();
  });
});
