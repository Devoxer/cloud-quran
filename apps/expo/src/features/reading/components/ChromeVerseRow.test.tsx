/**
 * The contextual chrome row — its three states, and the one path from a verse to sound
 * (story 7-8).
 *
 * ⚠️ THE STORE IS THE REAL ONE, WITH THE ENGINE ACTIONS REGISTERED AS MOCKS. That is the shape
 * every other audio suite in this tree uses (`read-screen`, `mushaf-screen`), and it is what makes
 * the play control's assertion mean something: `useVerseSeek`'s branch reads the LIVE store at
 * press time, so a fake store would let this file assert its own arithmetic instead of the rule.
 *
 * ⚠️ THE SYNC MODULE IS MOCKED AT ITS DOOR. What `addBookmark`/`removeBookmark` DO — the local
 * apply, the outbox entry, the union-merge — belongs to `lib/sync.test.ts` against the real
 * outbox. What is proven only here is the wiring: which control calls them, and with WHICH PAIR.
 */

const mockAddBookmark = jest.fn();
const mockRemoveBookmark = jest.fn();
/** ⚠️ `undefined` IS A REAL STATE — the first read before any MMKV cache exists. See the P13 case. */
let mockBookmarks: { id: string; surah: number; verse: number }[] | undefined = [];

jest.mock('@/lib/sync', () => ({
  addBookmark: (...args: unknown[]) => mockAddBookmark(...args),
  removeBookmark: (...args: unknown[]) => mockRemoveBookmark(...args),
  useBookmarks: () => ({ data: mockBookmarks }),
}));

// `expo-crypto`'s native module is absent under Jest — the `auth.test.ts` convention.
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-under-test' }));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { ChromeVerseRow } from './ChromeVerseRow';

const playSurah = jest.fn(async () => {});
const seekToVerse = jest.fn(async () => {});
const pause = jest.fn(async () => {});
const resume = jest.fn(async () => {});

const store = () => useAudioPlayerStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  mockBookmarks = [];
  act(() => {
    store().clearPlayback();
    // What `RecitationEngineHost` does at boot; before it the actions are inert, by design.
    store().registerEngineActions({
      playSurah,
      seekToVerse,
      pause,
      resume,
      stop: async () => {},
      abandonPlayback: async () => {},
    });
  });
});

// ⚠️ AND AFTER, TOO. The playback store is a module singleton: a suite that leaves it `playing`
// changes what every later file's screens render.
afterEach(() => act(() => store().clearPlayback()));

function renderRow(selected: { surah: number; verse: number } | null = null) {
  return render(
    <ChromeVerseRow
      selected={selected}
      interactive
      onOpenReciters={mockOpenReciters}
      onOpenPlaybackOptions={mockOpenPlaybackOptions}
      onInteract={mockInteract}
    />
  );
}

const mockOpenReciters = jest.fn();
const mockOpenPlaybackOptions = jest.fn();
/** `useChromeReveal`'s `keepAlive` — every control here owes it a call. */
const mockInteract = jest.fn();

describe('state 1 — an ayah is selected', () => {
  it('draws the verse actions and names the ayah', () => {
    renderRow({ surah: 2, verse: 255 });
    expect(screen.getByTestId('chrome-verse-row')).toBeTruthy();
    expect(screen.getByTestId('chrome-verse-label').props.children).toBe('Al-Baqarah · 255');
    // The mini player is the OTHER state; both at once would be the two-bar clutter the single
    // row exists to avoid.
    expect(screen.queryByTestId('chrome-mini-player')).toBeNull();
  });

  it('is the ONLY path from a verse to sound — the play control STARTS the selected ayah', () => {
    // ⚠️ THE WHOLE STORY, AS ONE CASE. `useVerseSeek`'s rule is unchanged (start when nothing is
    // loaded); what changed is that only a deliberate press reaches it.
    renderRow({ surah: 2, verse: 255 });
    fireEvent.press(screen.getByTestId('chrome-verse-play'));
    expect(playSurah).toHaveBeenCalledWith(2, 255);
    expect(seekToVerse).not.toHaveBeenCalled();
  });

  it('…and SEEKS inside the loaded track when it is already that surah', () => {
    // The other half of `useVerseSeek`'s branch, read from the live store at press time.
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setPlaybackState('playing');
    });
    renderRow({ surah: 2, verse: 255 });
    fireEvent.press(screen.getByTestId('chrome-verse-play'));
    expect(seekToVerse).toHaveBeenCalledWith(255);
    expect(playSurah).not.toHaveBeenCalled();
  });

  it('bookmarks the SELECTED pair, never the surah anything else believes it is on', () => {
    // ⚠️ 6-4's RECORDED DEFECT, IN A NEW PLACE. The screens move their current-surah ref
    // synchronously while the old surah's rows are still on screen; the selection carries its own
    // pair, so there is nothing here to substitute. MUTATION: read a screen-held surah.
    renderRow({ surah: 18, verse: 4 });
    fireEvent.press(screen.getByTestId('chrome-verse-bookmark'));
    expect(mockAddBookmark).toHaveBeenCalledWith({
      id: 'uuid-under-test',
      surah: 18,
      verse: 4,
    });
  });

  it('REMOVES by id when the selected ayah is already bookmarked', () => {
    mockBookmarks = [{ id: 'bm-1', surah: 2, verse: 255 }];
    renderRow({ surah: 2, verse: 255 });
    fireEvent.press(screen.getByTestId('chrome-verse-bookmark'));
    expect(mockRemoveBookmark).toHaveBeenCalledWith('bm-1');
    expect(mockAddBookmark).not.toHaveBeenCalled();
  });

  it('announces the bookmark STATE, and it is about THIS ayah and not another', () => {
    // A bookmark on a DIFFERENT verse must not make this one look saved — the match is on the
    // pair, not on "are there any bookmarks".
    mockBookmarks = [{ id: 'bm-1', surah: 2, verse: 254 }];
    renderRow({ surah: 2, verse: 255 });
    expect(screen.getByTestId('chrome-verse-bookmark').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('names the ayah its play control acts on, for a screen reader', () => {
    renderRow({ surah: 2, verse: 255 });
    expect(screen.getByTestId('chrome-verse-play').props.accessibilityLabel).toBe(
      'Play from verse 255'
    );
  });
});

describe('state 2 — audio is loaded and nothing is selected', () => {
  it('draws the mini player: the reciter, the ayah, and a transport', () => {
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
      store().setActiveVerse(23);
    });
    renderRow(null);
    expect(screen.getByTestId('chrome-mini-player')).toBeTruthy();
    expect(screen.getByTestId('chrome-now-playing').props.children).toBe('Al-Kahf · 23');
    expect(screen.getByTestId('chrome-reciter')).toBeTruthy();
    expect(screen.queryByTestId('chrome-verse-row')).toBeNull();
  });

  it('gives way to the verse actions the moment an ayah is selected', () => {
    // The row's whole rule — "the thing you are acting on right now" — as a case. MUTATION:
    // render the player whenever audio is loaded; both would then draw at once.
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });
    renderRow({ surah: 2, verse: 255 });
    expect(screen.queryByTestId('chrome-mini-player')).toBeNull();
    expect(screen.getByTestId('chrome-verse-row')).toBeTruthy();
  });

  it('is drawn while PAUSED too — a paused listen is when the transport matters most', () => {
    // MUTATION: gate on `playbackState === 'playing'`. The reader pauses, the row disappears, and
    // there is nothing left to resume from.
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('paused');
    });
    renderRow(null);
    expect(screen.getByTestId('chrome-mini-player')).toBeTruthy();
    fireEvent.press(screen.getByTestId('chrome-mini-transport'));
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('pauses what is playing', () => {
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });
    renderRow(null);
    fireEvent.press(screen.getByTestId('chrome-mini-transport'));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('names the ayah with the TRACK alone when the manifest cannot name one', () => {
    // `isSurahTimed` leaving `activeVerseKey` null for a whole track is the documented case; the
    // surah is still knowable, so the label says that rather than nothing.
    act(() => {
      store().setTrack(18, 'alafasy', false);
      store().setPlaybackState('playing');
      store().setActiveVerse(23);
    });
    renderRow(null);
    expect(screen.getByTestId('chrome-now-playing').props.children).toBe('Al-Kahf');
  });

  it('opens the reciter picker rather than mounting it here', () => {
    // The sheet lives OUTSIDE the animated bars (`ReadingChrome` owns it) — a sheet inside the
    // footer would inherit the reveal's opacity and vanish when the dwell fired.
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });
    renderRow(null);
    fireEvent.press(screen.getByTestId('chrome-reciter'));
    expect(mockOpenReciters).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('reciter-sheet')).toBeNull();
  });

  it('names the LOADED TRACK’s voice, resolved — a withdrawn id falls back, never shows raw', () => {
    act(() => {
      store().setTrack(18, 'nope', true);
      store().setPlaybackState('playing');
    });
    renderRow(null);
    expect(screen.getByText('Mishary Rashid Al-Afasy')).toBeTruthy();
  });

  it('…and it is the TRACK’s voice, not the preference the next track will use', () => {
    // ⚠️ THE WRONG-SOURCE DEFECT. `preferences.reciterId` is what the NEXT track will use; the
    // store's is what is playing. They disagree for the whole of any track that outlives a
    // preference change, and the row was labelling the recitation with a voice nobody could hear.
    // MUTATION: read `usePreferences()` again — this file no longer mocks it, so that reddens.
    act(() => {
      store().setTrack(18, 'husary', true);
      store().setPlaybackState('playing');
    });
    renderRow(null);
    expect(screen.getByText('Mahmoud Khalil Al-Husary')).toBeTruthy();
  });

  it('ignores a transport press while the track is still LOADING', () => {
    // ⚠️ RESTARTING AN IN-FLIGHT LOAD IS THE DEFECT. The glyph shows play while a track comes up,
    // so a press ran `playSurah(surah)` — discarding the load and starting again at ayah 1.
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('loading');
    });
    renderRow(null);
    fireEvent.press(screen.getByTestId('chrome-mini-transport'));
    expect(playSurah).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('retries a FAILED track at the ayah it failed on, not at ayah 1', () => {
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setActiveVerse(23);
      store().setError('player:errors.playFailed');
    });
    renderRow(null);
    fireEvent.press(screen.getByTestId('chrome-mini-transport'));
    expect(playSurah).toHaveBeenCalledWith(18, 23);
  });
});

describe('state 3 — nothing loaded, nothing selected', () => {
  it('renders NO row at all, so the footer is just the tab bar', () => {
    // MUTATION: return an empty `<View>` instead of null. The footer would grow a permanent
    // empty band above the tabs on a cold launch, which is exactly the clutter one row avoids.
    const { toJSON } = renderRow(null);
    expect(toJSON()).toBeNull();
  });

  it('…and an `idle` store with a stale surah is still nothing', () => {
    // `clearPlayback` nulls the surah, but a surface must not draw a player for a track that has
    // been released — `idle` is the authority, not the leftover number.
    act(() => store().setPlaybackState('idle'));
    const { toJSON } = renderRow(null);
    expect(toJSON()).toBeNull();
  });
});

describe('the bookmark waits for the data it needs (story 7-8 review)', () => {
  it('is DISABLED while the bookmark read has not answered — `undefined` is not "no bookmark"', () => {
    // ⚠️ `useBookmarks().data` IS `undefined` BEFORE THE FIRST READ LANDS with no MMKV cache
    // behind it (a fresh install, a signed-out device). Treating that as "not bookmarked" lets a
    // press mint a SECOND row for an ayah the account already holds — the worker's union-merge
    // absorbs it, but the reader watches the indicator lie in between. MUTATION: drop the guard.
    mockBookmarks = undefined;
    renderRow({ surah: 2, verse: 255 });
    fireEvent.press(screen.getByTestId('chrome-verse-bookmark'));
    expect(mockAddBookmark).not.toHaveBeenCalled();
    expect(screen.getByTestId('chrome-verse-bookmark').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('…and works normally the moment the read answers, even with nothing in it', () => {
    // Anti-vacuity: an empty ARRAY is a real answer, and must not be confused with `undefined`.
    mockBookmarks = [];
    renderRow({ surah: 2, verse: 255 });
    fireEvent.press(screen.getByTestId('chrome-verse-bookmark'));
    expect(mockAddBookmark).toHaveBeenCalledTimes(1);
  });
});

describe('every control re-arms the chrome’s dwell (story 7-8 review)', () => {
  it.each(['chrome-verse-play', 'chrome-verse-bookmark'])('%s reports the interaction', (id) => {
    // ⚠️ ONLY `revealFor` USED TO BUMP THE TOKEN, so the bars could vanish in the instant after a
    // press. MUTATION: drop `onInteract()` from either handler.
    renderRow({ surah: 2, verse: 255 });
    fireEvent.press(screen.getByTestId(id));
    expect(mockInteract).toHaveBeenCalledTimes(1);
  });

  it.each(['chrome-reciter', 'chrome-mini-transport'])('%s reports it too', (id) => {
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });
    renderRow(null);
    fireEvent.press(screen.getByTestId(id));
    expect(mockInteract).toHaveBeenCalledTimes(1);
  });
});

describe('it goes inert with the rest of the bar', () => {
  /** Flattened style of one element. */
  function styleOf(testID: string): Record<string, unknown> {
    const style = screen.getByTestId(testID).props.style;
    return Object.assign({}, ...(Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean));
  }

  /** The row in one of its two faces, at a given `interactive`. */
  function renderAt(interactive: boolean, selected: { surah: number; verse: number } | null) {
    render(
      <ChromeVerseRow
        selected={selected}
        interactive={interactive}
        onOpenReciters={mockOpenReciters}
        onOpenPlaybackOptions={mockOpenPlaybackOptions}
        onInteract={mockInteract}
      />
    );
  }

  it('takes no DOM hit-test and no keyboard focus while the chrome is dismissed', () => {
    // ⚠️ THE FOURTH TREE (2026-09-10): react-native-web's `box-none` hands children
    // `pointer-events: auto`, and a child's own `auto` beats a parent's `none` in CSS — so a
    // dismissed bar's controls stayed CLICKABLE on web. Every control in the chrome carries its
    // own `inert`; this row is inside that bar and owes the same.
    renderAt(false, { surah: 2, verse: 255 });
    expect(styleOf('chrome-verse-row').pointerEvents).toBe('none');
    expect(screen.getByTestId('chrome-verse-play').props.focusable).toBe(false);
    expect(screen.getByTestId('chrome-verse-bookmark').props.focusable).toBe(false);
  });

  it('⚠️ sets `tabIndex` AS WELL AS `focusable` — on web the second one alone is INERT', () => {
    // ⚠️ THE RECORDED FACT THIS FILE MISSED. react-native-web derives the DOM tab order from
    // `tabIndex ?? (disabled ? -1 : 0)` and NEVER reads `focusable`, so a raw `Pressable`
    // carrying only `focusable` stayed in the tab order of a bar at opacity 0 — one Tab from a
    // bookmark nobody could see, and Enter would write it. `HeaderActionButton` ships both; these
    // two raw Pressables were the exception. MUTATION: remove either `tabIndex`.
    renderAt(false, { surah: 2, verse: 255 });
    expect(screen.getByTestId('chrome-verse-bookmark').props.tabIndex).toBe(-1);
    screen.unmount();

    // …and the mini player's reciter control, which no case reached at all before this one.
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });
    renderAt(false, null);
    expect(screen.getByTestId('chrome-reciter').props.tabIndex).toBe(-1);
    expect(screen.getByTestId('chrome-reciter').props.focusable).toBe(false);
    screen.unmount();

    // Both directions: a revealed bar puts them BACK in the tab order.
    renderAt(true, null);
    expect(screen.getByTestId('chrome-reciter').props.tabIndex).toBe(0);
  });

  it('hangs no DEAD accessibility label on either container', () => {
    // ⚠️ A LABELLED PLAIN `View` WITH NO `accessible` AND NO ROLE IS NEVER ANNOUNCED ON iOS, and
    // marking it accessible would swallow the buttons inside it — the things worth reaching. The
    // controls name the ayah instead. MUTATION: put a label back; this reddens, and a string
    // would be shipped to three locales for nothing.
    renderRow({ surah: 2, verse: 255 });
    expect(screen.getByTestId('chrome-verse-row').props.accessibilityLabel).toBeUndefined();
    screen.unmount();
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });
    renderRow(null);
    expect(screen.getByTestId('chrome-mini-player').props.accessibilityLabel).toBeUndefined();
  });
});

/**
 * The overflow control, which is also the sleep indicator (story 7-4).
 *
 * ⚠️ IT BELONGS TO THE MINI PLAYER ONLY. The verse face is scoped to one ayah — speed and a
 * sleep timer are scoped to the recitation — so putting it there would be the "two bars of
 * everything" clutter the single row exists to avoid.
 */
describe('the playback-options control', () => {
  /** Load a track, which is the only state that draws the mini player. */
  const loadTrack = () =>
    act(() => {
      store().setTrack(18, 'alafasy', true);
      store().setPlaybackState('playing');
    });

  afterEach(() => act(() => store().clearSleepTimer()));

  /**
   * The SF glyph the control actually renders with — `VerseRow.test`'s idiom, and for its two
   * reasons: the icon is deliberately a11y-hidden (the Pressable carries the label), and the
   * suite runs on the iOS platform, so `Icon` resolves through the registry's `sf` half.
   */
  const glyph = (): unknown => {
    const frame = screen.getByTestId('chrome-playback-options-icon', {
      includeHiddenElements: true,
    });
    return (frame.props as { children: { props: { name?: unknown } } }).children.props.name;
  };

  it('appears in BOTH faces, so selecting an ayah cannot strand an armed timer', () => {
    /**
     * ⚠️ IT USED TO BE MINI-PLAYER-ONLY (story 7-4 review, P6). The row swaps to the verse face
     * the moment a reader selects an ayah — so an armed sleep timer went invisible AND
     * uncancellable, because this control is the only door onto the sheet that turns it off.
     * MUTATION: render it only in the player face; the second half reddens.
     */
    loadTrack();
    renderRow(null);
    expect(screen.getByTestId('chrome-playback-options')).toBeTruthy();
    screen.unmount();

    renderRow({ surah: 18, verse: 10 });
    expect(screen.getByTestId('chrome-verse-row')).toBeTruthy();
    expect(screen.getByTestId('chrome-playback-options')).toBeTruthy();
  });

  it('keeps the moon and the countdown across a selection', () => {
    loadTrack();
    renderRow({ surah: 18, verse: 10 });
    act(() => store().setSleepTimer(30 * 60_000));
    expect(screen.getByTestId('chrome-sleep-countdown').props.children).toBe('30m');
    // And it is still the door out: one press asks for the sheet that can cancel it.
    fireEvent.press(screen.getByTestId('chrome-playback-options'));
    expect(mockOpenPlaybackOptions).toHaveBeenCalled();
  });

  it('asks for the sheet, and re-arms the dwell like every other control here', () => {
    loadTrack();
    renderRow(null);
    fireEvent.press(screen.getByTestId('chrome-playback-options'));
    expect(mockOpenPlaybackOptions).toHaveBeenCalledTimes(1);
    expect(mockInteract).toHaveBeenCalled();
  });

  it('is the plain overflow while nothing is armed', () => {
    loadTrack();
    renderRow(null);
    expect(glyph()).toBe('ellipsis');
    expect(screen.queryByTestId('chrome-sleep-countdown')).toBeNull();
  });

  it('becomes the moon, with a countdown, while a duration is armed', () => {
    loadTrack();
    renderRow(null);
    act(() => store().setSleepTimer(30 * 60_000));

    expect(glyph()).toBe('moon');
    expect(screen.getByTestId('chrome-sleep-countdown').props.children).toBe('30m');
  });

  it('follows the countdown down, and back to nothing when it is cancelled', () => {
    loadTrack();
    renderRow(null);
    act(() => store().setSleepTimer(30 * 60_000));
    // What the engine's clock publishes as the timer runs.
    act(() => store().setSleepRemaining(12 * 60_000));
    expect(screen.getByTestId('chrome-sleep-countdown').props.children).toBe('12m');

    act(() => store().clearSleepTimer());
    expect(screen.queryByTestId('chrome-sleep-countdown')).toBeNull();
    expect(glyph()).toBe('ellipsis');
  });

  it('says “End” for an end-of-surah timer, which has no countdown to show', () => {
    loadTrack();
    renderRow(null);
    act(() => store().setSleepTimer('surah'));
    expect(screen.getByTestId('chrome-sleep-countdown').props.children).toBe('End');
  });

  it('goes inert with the bar, in the DOM tab order as well as the touch tree', () => {
    // See the reciter control's case: `focusable` alone is not read by react-native-web.
    loadTrack();
    render(
      <ChromeVerseRow
        selected={null}
        interactive={false}
        onOpenReciters={mockOpenReciters}
        onOpenPlaybackOptions={mockOpenPlaybackOptions}
        onInteract={mockInteract}
      />
    );
    expect(screen.getByTestId('chrome-playback-options').props.tabIndex).toBe(-1);
    expect(screen.getByTestId('chrome-playback-options').props.focusable).toBe(false);
  });
});
