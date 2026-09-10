/**
 * ChromeVerseRow — the ONE contextual row inside the chrome's footer, above the tab bar
 * (story 7-8).
 *
 * ⚠️ ONE ROW, NOT TWO BARS, AND THE RULE IS "the thing you are acting on right now". It shows
 * VERSE ACTIONS when an ayah is selected (play from here, bookmark — and, in epic 8, tafsir and
 * translation), the MINI PLAYER when audio is loaded and nothing is selected (reciter, the ayah
 * being recited, play/pause), and NOTHING when neither. The two are genuinely different things —
 * the player is scoped to the recitation and lives as long as it does, the verse actions are
 * scoped to one ayah and are transient — and giving each a permanent bar is how other Quran apps
 * get cluttered.
 *
 * ⚠️ IT ADDS NO ANIMATION AND NO SECOND REVEAL. It is rendered INSIDE `ReadingChrome`'s footer
 * `Animated.View`, so it rides the one `useChromeReveal` driver that `chrome-render-storm` exists
 * to keep singular. This file must never grow a `useSharedValue` or a `withTiming` —
 * `ReadingChrome.test.tsx` walks the whole feature directory counting both.
 *
 * ⚠️ AND IT IS THE ONLY PATH FROM A VERSE TO SOUND. Story 7-1 wired the verse press itself to
 * `useVerseSeek`, which plays whenever the player is not already playing; 7-6 then made every
 * mushaf word a press target, so a mistap on the app's primary surface was one tap from
 * recitation out loud, from a cold launch and from paused. The press now SELECTS; this row's play
 * control is what seeks. `useVerseSeek`'s rule is unchanged — seek inside the loaded track,
 * otherwise start there — it simply has one caller instead of two surfaces.
 *
 * ⚠️ THE BOOKMARK REPORTS THE SELECTED PAIR, NEVER A SCREEN'S "current surah". That is 6-4's
 * recorded defect in a new place: the screens move their surah ref synchronously while the old
 * surah's rows are still on screen. The selection carries its own `(surah, verse)`, so there is
 * nothing here to substitute.
 *
 * ⚠️ THE RECITER SHEET IS NOT MOUNTED HERE. `ReadingChrome` owns it and renders it OUTSIDE both
 * animated bars: a sheet inside the footer would inherit the reveal's opacity and vanish under
 * the reader's hand when the 5s dwell fired. This row only asks for it to open.
 */

import * as Crypto from 'expo-crypto';
import { SURAH_METADATA } from 'quran-data';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { HeaderActionButton, Icon } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { RECITERS, resolveReciterId, useVerseSeek } from '@/features/audio';
import { formatSleepRemaining } from '@/lib/formatTime';
import { addBookmark, removeBookmark, useBookmarks } from '@/lib/sync';
import { useTheme } from '@/lib/theme';
import type { VersePair } from '@/lib/usePosition';
import { verseKey } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  type PlaybackState,
  useActiveVerseKey,
  usePlaybackControls,
  usePlaybackStatus,
  useSleepTimer,
} from '@/stores/audioPlayerStore';

/** The bookmark glyph, matching `VerseRow`'s control so one action looks like one action. */
const BOOKMARK_ICON_SIZE = 20;
const RECITER_ICON_SIZE = 18;
const CONTROL_HIT_SLOP = 10;

/**
 * Which of the row's three faces is drawn — exported because `ReadingChrome` has to ask the SAME
 * question to decide whether the HEADER transport yields (story 7-8's review).
 *
 * ⚠️ TWO TRANSPORTS DREW AT ONCE, WITH THE SAME LABEL, UNTIL THIS EXISTED. The header's play is
 * "resume where I left off listening" (7-7's resolver); the row's is "control what is playing".
 * With a track loaded and nothing selected both rendered, both announced `playRecitation`, and
 * they were separate implementations free to drift. The header now yields to the row.
 */
export type ChromeRowFace = 'verse' | 'player' | 'none';

/**
 * ⚠️ "LOADED" IS `surah !== null` AND NOT-`idle`, NOT "playing". A paused recitation is exactly
 * the state a reader most needs the transport for, and `error` keeps its track so the press is a
 * retry rather than a dead button.
 */
export function chromeRowFace(
  selected: VersePair | null,
  playbackState: PlaybackState,
  surah: number | null
): ChromeRowFace {
  if (selected) return 'verse';
  return surah !== null && playbackState !== 'idle' ? 'player' : 'none';
}

export interface ChromeVerseRowProps {
  /** The ayah the reader selected, or null. Comes straight from `useChromeReveal`. */
  selected: VersePair | null;
  /** The chrome's `interactive` — the row goes inert with the rest of the bar while it fades. */
  interactive: boolean;
  /** Open the reciter sheet. `ReadingChrome` owns the sheet itself (see the header). */
  onOpenReciters: () => void;
  /** Open the speed / sleep-timer sheet (story 7-4). Owned by `ReadingChrome` for the same reason. */
  onOpenPlaybackOptions: () => void;
  /**
   * Re-arm the chrome's dwell — `useChromeReveal`'s `keepAlive`. ⚠️ EVERY CONTROL HERE CALLS IT.
   * Without it the bars could vanish in the instant after the reader pressed play or bookmark,
   * because only `revealFor` bumped the token; that was the story's own open question.
   */
  onInteract: () => void;
}

export function ChromeVerseRow({
  selected,
  interactive,
  onOpenReciters,
  onOpenPlaybackOptions,
  onInteract,
}: ChromeVerseRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const seekToVerse = useVerseSeek();
  const { data: bookmarks } = useBookmarks();
  // ⚠️ TWO SEPARATE SUBSCRIPTIONS, the 7-1 rule: only `useActiveVerseKey` moves per ayah, and it
  // feeds the mini player's TITLE alone. Selecting them together would re-derive the controls and
  // the status ten times a second for a row that draws three glyphs.
  const activeVerseKey = useActiveVerseKey();
  const playback = usePlaybackStatus();
  /**
   * ⚠️ A THIRD SUBSCRIPTION, AND IT MOVES ONCE A SECOND — but only while a timer is armed, and
   * only in whole seconds (the engine buckets the countdown before publishing it). The row draws
   * four glyphs and a label; a second is not a tick rate.
   */
  const sleep = useSleepTimer();
  const { pause, resume, playSurah } = usePlaybackControls();

  /**
   * ⚠️ `undefined` IS NOT "not bookmarked" — IT IS "we do not know yet". `useBookmarks` answers
   * `undefined` before the first read lands with no MMKV cache behind it (a fresh install, a
   * signed-out device), and treating that as "no bookmark" lets a press mint a SECOND row for an
   * ayah the account already holds. The control waits instead.
   */
  const bookmarksKnown = bookmarks !== undefined;
  const bookmarkId = useMemo(() => {
    if (!selected || !bookmarks) return null;
    const key = verseKey(selected.surah, selected.verse);
    return bookmarks.find((b) => verseKey(b.surah, b.verse) === key)?.id ?? null;
  }, [bookmarks, selected]);

  const toggleBookmark = useCallback(() => {
    onInteract();
    if (!selected || !bookmarksKnown) return;
    if (bookmarkId) {
      removeBookmark(bookmarkId);
      return;
    }
    // Client-minted id, the `lib/auth.ts` convention — an offline create keeps its identity
    // through the drain and a retry is idempotent on the worker's unique index.
    addBookmark({ id: Crypto.randomUUID(), surah: selected.surah, verse: selected.verse });
  }, [bookmarkId, bookmarksKnown, selected, onInteract]);

  const playFromSelection = useCallback(() => {
    onInteract();
    if (!selected) return;
    seekToVerse(selected.surah, selected.verse);
  }, [seekToVerse, selected, onInteract]);

  const openReciters = useCallback(() => {
    onInteract();
    onOpenReciters();
  }, [onInteract, onOpenReciters]);

  const openPlaybackOptions = useCallback(() => {
    onInteract();
    onOpenPlaybackOptions();
  }, [onInteract, onOpenPlaybackOptions]);

  /**
   * The mini player's transport: pause what is playing, resume what is paused, retry what failed.
   *
   * ⚠️ `loading` AND `buffering` ARE NOT "not playing", AND TREATING THEM AS SUCH RESTARTED THE
   * RECITATION. The glyph shows play while a track loads, so a reader pressing it ran
   * `playSurah(surah)` — discarding the in-flight load and starting again at ayah 1, which is the
   * one thing they did not ask for. A press in those states does nothing; the load is already the
   * answer to it.
   *
   * ⚠️ AND A RETRY CARRIES THE AYAH. `playSurah(surah)` with no verse restarts a failed track at
   * ayah 1 rather than where it failed; `activeVerseKey` still names the last ayah the manifest
   * resolved, so the retry resumes there when it can.
   */
  const toggleTransport = useCallback(() => {
    onInteract();
    const { playbackState, surah } = playback;
    if (playbackState === 'playing') {
      void pause();
      return;
    }
    if (playbackState === 'paused') {
      void resume();
      return;
    }
    // Still coming up — the press has already been answered by the load in flight.
    if (playbackState === 'loading' || playbackState === 'buffering') return;
    // `error` — the track is still loaded, so a press is a retry. `idle` never reaches here: the
    // mini player does not render without a loaded track.
    if (surah === null) return;
    const [keySurah, keyVerse] = (activeVerseKey ?? '').split(':').map(Number);
    const resumeAt = keySurah === surah && Number.isInteger(keyVerse) ? keyVerse : undefined;
    void playSurah(surah, resumeAt);
  }, [pause, resume, playSurah, playback, activeVerseKey, onInteract]);

  /**
   * `"Al-Baqarah · 255"` — the surah as `quran-data` names it, plus the ayah when one is known.
   *
   * ⚠️ THE NAME IS DATA AND THE SEPARATOR IS THE COPY, which is why this goes through `t()` at
   * all: a locale that wants the ayah first, or a different separator, changes the string rather
   * than this code. A surah the table cannot name falls back to its number, never to an empty
   * label. Defined in the body rather than at module scope so it can hold the typed `t` — the
   * generated key union does not survive being passed as a plain function.
   */
  const verseLabel = (surah: number, verse: number | null): string => {
    const name =
      SURAH_METADATA[surah - 1]?.nameTransliteration ??
      t('common:bookmarks.surahFallback', { number: surah });
    return verse === null ? name : t('player:nowPlayingVerse', { name, verse });
  };

  const face = chromeRowFace(selected, playback.playbackState, playback.surah);

  // ── the selected ayah ──────────────────────────────────────────────────────────────────────
  if (face === 'verse' && selected) {
    const label = verseLabel(selected.surah, selected.verse);
    return (
      /* ⚠️ NO `accessibilityLabel` ON THIS CONTAINER. A labelled plain `View` with no
         `accessible` and no role is a DEAD STRING on iOS — never announced — and marking it
         accessible would swallow the two buttons inside it, which are the things worth reaching.
         Each control names the ayah it acts on instead. */
      <View style={[styles.row, !interactive && styles.inert]} testID="chrome-verse-row">
        <HeaderActionButton
          name="play"
          onPress={playFromSelection}
          color={colors.accent.primary}
          accessibilityLabel={t('player:a11y.playFromVerse', { verse: selected.verse })}
          focusable={interactive}
          testID="chrome-verse-play"
        />
        <Text style={styles.label} numberOfLines={1} testID="chrome-verse-label">
          {label}
        </Text>
        {/* The same glyph pair and the same colours as `VerseRow`'s control — one action, one
            look. The indicator flips on the SAME interaction because `addBookmark` applies the
            local cache synchronously. */}
        <Pressable
          onPress={toggleBookmark}
          disabled={!bookmarksKnown}
          hitSlop={CONTROL_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={bookmarkId ? t('common:bookmarks.remove') : t('common:bookmarks.add')}
          accessibilityState={{ selected: bookmarkId !== null, disabled: !bookmarksKnown }}
          focusable={interactive}
          /* ⚠️ `tabIndex` AS WELL AS `focusable`, AND THE PAIR IS NOT BELT-AND-BRACES.
             react-native-web derives the DOM tab order from `tabIndex ?? (disabled ? -1 : 0)` and
             never reads `focusable`, so a raw `Pressable` carrying only `focusable` stayed in the
             tab order of a bar at opacity 0 — one Tab away from writing a bookmark nobody could
             see. Every other chrome control ships both (`AppHeader`, `AppTabBar`,
             `HeaderActionButton`); these two were the exception. */
          tabIndex={interactive ? 0 : -1}
          style={styles.control}
          testID="chrome-verse-bookmark"
        >
          <Icon
            name={bookmarkId ? 'bookmark' : 'bookmark-outline'}
            size={BOOKMARK_ICON_SIZE}
            color={bookmarkId ? colors.accent.primary : colors.text.secondary}
            accessibilityElementsHidden
            testID="chrome-verse-bookmark-icon"
          />
        </Pressable>
      </View>
    );
  }

  // ── the mini player ────────────────────────────────────────────────────────────────────────
  if (face !== 'player' || playback.surah === null) return null;

  // ⚠️ THE LOADED TRACK'S VOICE, FROM THE STORE — never `preferences.reciterId`, which is what
  // the NEXT track will use. See `usePlaybackStatus` for the wrong-source class this closes.
  const reciterId = resolveReciterId(playback.reciterId);
  // The names are DATA — a reciter is called what he is called in every locale.
  const reciterName = RECITERS.find((r) => r.id === reciterId)?.nameEnglish ?? reciterId;
  const playing = playback.playbackState === 'playing';
  // The recited ayah when the manifest can name one; an untimed surah names only its track, and
  // `isSurahTimed` leaving `activeVerseKey` null is exactly that case.
  const activeVerse = activeVerseKey ? Number.parseInt(activeVerseKey.split(':')[1], 10) : null;
  const nowPlaying = verseLabel(
    playback.surah,
    activeVerse !== null && Number.isInteger(activeVerse) ? activeVerse : null
  );

  return (
    /* No container label here either — see the verse face above. */
    <View style={[styles.row, !interactive && styles.inert]} testID="chrome-mini-player">
      <Pressable
        onPress={openReciters}
        hitSlop={CONTROL_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('player:a11y.chooseReciter')}
        focusable={interactive}
        // See the bookmark control: `focusable` alone is inert in the DOM tab order.
        tabIndex={interactive ? 0 : -1}
        style={styles.reciter}
        testID="chrome-reciter"
      >
        <Icon
          name="headset"
          size={RECITER_ICON_SIZE}
          color={colors.text.secondary}
          accessibilityElementsHidden
        />
        <Text style={styles.reciterName} numberOfLines={1}>
          {reciterName}
        </Text>
      </Pressable>
      <Text style={styles.label} numberOfLines={1} testID="chrome-now-playing">
        {nowPlaying}
      </Text>
      {/**
       * ⚠️ ONE CONTROL, WHICH IS ALSO THE SLEEP INDICATOR (story 7-4). The row's whole doctrine is
       * "the thing you are acting on right now" — a separate moon badge beside an ellipsis would
       * be two glyphs for one subject in a bar that already carries four things, and the badge
       * would be an indicator nobody can press while the control beside it is the only place the
       * timer can be cancelled. Armed, the glyph BECOMES the moon and the countdown sits next to
       * it; unarmed, it is the plain overflow. Either way one press opens the sheet that owns it.
       */}
      <Pressable
        onPress={openPlaybackOptions}
        hitSlop={CONTROL_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={
          sleep.active
            ? t('player:a11y.sleepTimerActive', {
                label: formatSleepRemaining(sleep.remainingMs, sleep.endOfSurah),
              })
            : t('player:a11y.moreOptions')
        }
        focusable={interactive}
        // See the bookmark control: `focusable` alone is inert in the DOM tab order.
        tabIndex={interactive ? 0 : -1}
        style={styles.options}
        testID="chrome-playback-options"
      >
        <Icon
          name={sleep.active ? 'moon-outline' : 'ellipsis-horizontal'}
          size={RECITER_ICON_SIZE}
          color={sleep.active ? colors.accent.primary : colors.text.secondary}
          accessibilityElementsHidden
          testID="chrome-playback-options-icon"
        />
        {sleep.active ? (
          <Text style={styles.sleepLabel} numberOfLines={1} testID="chrome-sleep-countdown">
            {formatSleepRemaining(sleep.remainingMs, sleep.endOfSurah)}
          </Text>
        ) : null}
      </Pressable>
      <HeaderActionButton
        name={playing ? 'pause' : 'play'}
        onPress={toggleTransport}
        color={colors.accent.primary}
        accessibilityLabel={t(
          playing ? 'player:a11y.pauseRecitation' : 'player:a11y.playRecitation'
        )}
        focusable={interactive}
        testID="chrome-mini-transport"
      />
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    /**
     * ⚠️ THE SAME SURFACE AS THE TAB BAR BELOW IT, and no edge of its own. The two are one bar
     * as far as the reader is concerned — `AppTabBar` draws the delimiter against the page, and
     * a second hairline between the row and the tabs would divide a thing that is not divided.
     */
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      backgroundColor: theme.colors.background.secondary,
    },
    /** See `HeaderActionButton`'s `inert`: the row itself hit-tests on web too. */
    inert: {
      pointerEvents: 'none',
    },
    /**
     * ⚠️ `text.primary` ON `background.secondary` — the pair the contrast gate holds at AAA for
     * the header title, which is the same surface. `text.tertiary` would be gated at 3:1 only.
     */
    label: {
      flex: 1,
      textAlign: 'center',
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.primary,
    },
    control: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    reciter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      maxWidth: '38%',
    },
    reciterName: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.secondary,
      flexShrink: 1,
    },
    options: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    /** The countdown rides the accent, like the moon beside it — one armed thing, one colour. */
    sleepLabel: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.accent.primary,
    },
  }));
