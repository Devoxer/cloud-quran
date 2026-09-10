/**
 * `/recitation` — the voice picker (story 7-2) with the playback options above it (story 7-4).
 *
 * Lives HERE, never beside the route: a co-located test under `app/` becomes a phantom route in
 * the web export (the rule `route-integrity.test.ts` enforces).
 *
 * ⚠️ WHAT THIS FILE IS FOR IS THE SECOND HOST, AND NOTHING ELSE. What the controls DO is proven
 * in `PlaybackOptionsSheet.test.tsx` against the same component; what is proven only here is that
 * speed and the sleep timer are reachable with NOTHING PLAYING — the hole the review found (P9),
 * because the sheet opens from a mini player that needs a loaded track, while the persistence
 * design is argued around a rate being right "before the first press".
 */

const mockPreferences: Record<string, unknown> | null = { reciterId: 'alafasy' };

jest.mock('@/lib/sync', () => ({
  patchPreferences: jest.fn(),
  usePreferences: () => ({ data: mockPreferences }),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import RecitationScreen from '@/app/(tabs)/(profile)/recitation';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

const store = () => useAudioPlayerStore.getState();

beforeEach(() =>
  act(() => {
    store().clearPlayback();
    store().setSpeed(1);
  })
);

afterEach(() =>
  act(() => {
    store().clearSleepTimer();
    store().setSpeed(1);
  })
);

it('offers speed and the sleep timer with nothing loaded at all', () => {
  render(<RecitationScreen />);
  // ⚠️ `idle` — no track, so the chrome's mini player (the sheet's only door) does not exist.
  expect(store().playbackState).toBe('idle');

  fireEvent.press(screen.getByTestId('settings-playback-options-speed-increment'));
  expect(store().speed).toBe(1.1);

  fireEvent.press(screen.getByTestId('settings-playback-options-sleep-30'));
  expect(store().sleepDurationMs).toBe(30 * 60_000);
});

it('still shows the voice picker it shared the screen with', () => {
  // Anti-vacuity: a screen that dropped `ReciterPicker` while adding the options block would pass
  // the case above and silently lose story 7-2's surface.
  render(<RecitationScreen />);
  expect(screen.getByTestId('reciter-picker')).toBeTruthy();
});

it('is the SAME controls as the sheet, not a second copy of them', () => {
  // ⚠️ ONE COMPONENT, TWO HOSTS. A copy would be a second place for the single-select rules to
  // drift; this reads the shared store back, which is what makes them one setting.
  render(<RecitationScreen />);
  act(() => store().setSleepTimer('surah'));
  expect(
    screen.getByTestId('settings-playback-options-sleep-surah').props.accessibilityState
  ).toMatchObject({ selected: true });
});
