/**
 * ReadingChrome — the reading surfaces' chrome: `AppHeader` + `AppTabBar`, overlaid and animated
 * as ONE thing (story 6-1; re-composed onto the app-wide chrome components in story 6-6).
 *
 * ⚠️ IT OVERLAYS. BOTH BARS ARE `position: 'absolute'`, AND THAT IS AN ACCEPTANCE CRITERION, NOT
 * A STYLING CHOICE. "Revealing chrome must not shift content" — a bar that occupies layout pushes
 * the verse the reader is mid-sentence on. So the surface fills the whole screen, the bars float
 * over it, and the lists reserve `CHROME_BAR_HEIGHT + insets` permanently (see `(tabs)/read.tsx`)
 * rather than reserving it only while the bars are shown.
 *
 * ⚠️ BOTH BARS RIDE THE ONE DRIVER. The pre-fork build faded its header over 250ms while the tab
 * bar flipped `display: 'none'` with no animation at all — two mechanisms, two speeds, one
 * visibly broken transition (`chrome-render-storm`). Story 6-6 put the tab bar INTO the revealed
 * chrome, which makes the one-driver rule structural: this component wraps both bars in the same
 * `useChromeReveal` progress, and `AppHeader` / `AppTabBar` themselves contain no animation at
 * all (`ReadingChrome.test.tsx` counts drivers across the feature AND those two components).
 *
 * ⚠️ THE TAB BAR IS THE WAY OUT. These surfaces are tab routes (6-6): a tap reveals the chrome,
 * and the tab bar switches away — there is no close button and no `fullScreenModal` to escape
 * any more. The header's back control is history-conditional inside `AppHeader` (absent on a
 * cold tab home, never inert). The MODE TOGGLE is the third control: it navigates between the
 * two renderers and carries NO position of its own — one position, two renderers, and the
 * screens re-resolve the saved pair on focus, so the toggle cannot desynchronise them.
 *
 * ⚠️ THE BARS ARE ALWAYS MOUNTED. Unmounting the hidden chrome would make the reveal a mount
 * rather than an animation (nothing to fade FROM), and it is what let the pre-fork build reach
 * for `display: 'none'`. Hidden means `opacity: 0` plus `pointerEvents: 'none'`.
 *
 * ⚠️ AND HIDDEN MEANS HIDDEN FROM VOICEOVER AND TALKBACK TOO. `pointerEvents` reasons about the
 * TOUCH tree only; a bar at `opacity: 0` is still a first-class citizen of the ACCESSIBILITY
 * tree, so a screen-reader user swiping the reading surface would land on controls nobody can
 * see. `accessibilityElementsHidden` (iOS) + `importantForAccessibility="no-hide-descendants"`
 * (Android) is the pair.
 *
 * ⚠️ AND THERE IS A THIRD TREE THE FIRST CUT MISSED: WEB KEYBOARD FOCUS. Neither `pointerEvents`
 * nor the two native props above touches the DOM tab order, so on web a reader on the immersive
 * reading surface could press Tab and land on an INVISIBLE tab control — no focus ring to see,
 * because the bar it lives in is at `opacity: 0`, and Enter would navigate them away. Observed in
 * Chromium at `localhost:8081`: one Tab from a cold reading surface focused `chrome-tab-(profile)`.
 * `focusable` (react-native-web renders `tabIndex={-1}`; inert on native) rides `interactive` with
 * everything else, so all three trees hide together.
 *
 * ⚠️ REVEALED MEANS `box-none`, NOT `auto` — the bars are 56pt bands over a scrolling surface,
 * and `auto` would swallow any drag that starts inside them. The prop follows
 * `reveal.interactive`, NOT `reveal.visible`: flipping on `visible` makes the controls live
 * while still transparent, so a second tap 100ms after the first would land on an invisible
 * control. `useChromeReveal` turns `interactive` on from the animation's own completion.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppHeader, AppTabBar, HeaderActionButton, InlineError } from '@/components/ui';
import { HOME_HREF, READ_HREF } from '@/constants/navigation';
import { SPACING } from '@/constants/spacing';
import { PlaybackOptionsSheet, ReciterSheet } from '@/features/audio';
import { useTheme } from '@/lib/theme';
import { usePlaybackStatus } from '@/stores/audioPlayerStore';
import type { ChromeReveal } from '../hooks/useChromeReveal';
import { ChromeVerseRow, chromeRowFace } from './ChromeVerseRow';

export interface ReadingChromeProps {
  reveal: ChromeReveal;
  /** Shown in the header. `null` while the metadata read is in flight. */
  title: string | null;
  /** Which renderer mounts this chrome — decides where the mode toggle goes. */
  mode: 'reading' | 'mushaf';
  /** Whether the recitation is currently playing — decides the transport glyph (story 7-1). */
  playing?: boolean;
  /**
   * Start, pause or resume the recitation (story 7-1). Omitted → no transport control at all, so
   * a surface without a player renders the header exactly as before.
   */
  onTogglePlay?: () => void;
  /**
   * A playback failure, already translated — an unreachable manifest offline is the expected
   * instance. `null` when playback is healthy (story 7-1's review: the store carried an error key
   * that no surface rendered, so a failed play was indistinguishable from a dead button).
   */
  errorMessage?: string | null;
}

export function ReadingChrome({
  reveal,
  title,
  mode,
  playing = false,
  onTogglePlay,
  errorMessage = null,
}: ReadingChromeProps) {
  const { t } = useTranslation('navigation');
  // A second, DEFAULT-namespace `t` for the transport's labels — the keys live in `player`, and
  // the namespaced `t` above cannot take a prefixed key.
  const { t: tAny } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  /**
   * ⚠️ THE SHEET'S STATE LIVES HERE, NOT IN THE ROW THAT OPENS IT, BECAUSE THE SHEET IS RENDERED
   * OUTSIDE BOTH BARS. Inside the footer it would inherit the reveal's opacity and its
   * `pointerEvents`, so the 5-second dwell would fade the reader's open sheet away mid-scroll and
   * make it untouchable — a bar's animation deciding the fate of a modal that is not part of it.
   */
  const [recitersOpen, setRecitersOpen] = useState(false);
  /**
   * ⚠️ THE SHEET ALSO SUSPENDS THE DWELL. A reader picking a voice is USING the chrome; without
   * the hold they came back from a 39-row list to no bars and no selection, five seconds after
   * they opened it. Releasing it arms a full fresh dwell rather than resuming a spent one.
   */
  const { holdDwell, keepAlive, selectedVerse, interactive } = reveal;
  const openReciters = useCallback(() => {
    setRecitersOpen(true);
    holdDwell(true);
  }, [holdDwell]);
  const closeReciters = useCallback(() => {
    setRecitersOpen(false);
    holdDwell(false);
  }, [holdDwell]);

  /**
   * ⚠️ THE SECOND SHEET, WITH THE SAME TWO RULES AND FOR THE SAME TWO REASONS (story 7-4):
   * mounted outside both bars, and holding the dwell while it is open. A reader dragging a speed
   * slider is USING the chrome, and a slider that faded away mid-drag would be the reciter list's
   * defect with a worse ending — the rate they were left at is the one they stopped on.
   *
   * The two sheets are separate booleans rather than one "which sheet" value: both are opened
   * from the same row, only ever one at a time, and a union would buy a state machine to say so.
   */
  const [playbackOptionsOpen, setPlaybackOptionsOpen] = useState(false);
  const openPlaybackOptions = useCallback(() => {
    setPlaybackOptionsOpen(true);
    holdDwell(true);
  }, [holdDwell]);
  const closePlaybackOptions = useCallback(() => {
    setPlaybackOptionsOpen(false);
    holdDwell(false);
  }, [holdDwell]);

  /**
   * ⚠️ THE HEADER TRANSPORT YIELDS TO THE ROW'S (story 7-8's review). With a track loaded and
   * nothing selected BOTH drew, both announced `player:a11y.playRecitation`, and they were two
   * implementations of one thing. Their scopes differ and that is what decides which survives:
   * the header's play is "resume where I left off listening" (7-7's resolver), which is only
   * meaningful when nothing is playing; the row's is "control what is playing". So the row wins
   * whenever it is drawing a transport, and `chromeRowFace` is the ONE place that question is
   * answered — asking it twice is how the two would drift apart again.
   */
  const playback = usePlaybackStatus();
  const rowFace = chromeRowFace(selectedVerse, playback.playbackState, playback.surah);
  const headerTransport = rowFace === 'player' ? undefined : onTogglePlay;

  // See the header for all three: `box-none` rather than `auto`, keyed on `interactive` rather
  // than `visible`, and the accessibility tree hidden alongside the touch tree.
  /**
   * ⚠️ THE TITLE IS THE INDEX ENTRY, AND `AppHeader` DRAWS A CHEVRON BESIDE IT TO SAY SO.
   * Story 6-3 shipped this behind a press on plain text and the app's own author could not find
   * it — a control nobody can see does not exist. Two answers were tried and rejected before the
   * chevron: a SEARCH MAGNIFIER in the trailing slot (the universal signal for text search, which
   * this is not and which the Quran will eventually want — spending that icon here would mislead
   * now and collide later), and a FIFTH TAB (which would not have helped at all: both bars ride
   * the same `useChromeReveal`, so a tab is exactly as hidden as the header until the reader taps
   * the page — and every other tab is somewhere you STAY, while the index bounces you straight
   * back out).
   */
  const openIndex = useCallback(
    () => router.push({ pathname: '/surahs', params: { mode } }),
    [router, mode]
  );

  const touches = reveal.interactive ? ('box-none' as const) : ('none' as const);
  const hidden = !reveal.interactive;
  const offscreen = {
    accessibilityElementsHidden: hidden,
    importantForAccessibility: hidden ? ('no-hide-descendants' as const) : ('auto' as const),
  };

  return (
    <>
      <Animated.View
        style={[styles.slot, styles.top, reveal.headerStyle]}
        pointerEvents={touches}
        {...offscreen}
        testID="reading-chrome-header"
      >
        {/* story 6-3: the title IS the index entry. The pushed route carries the opener's mode so
            a selection writes — and, on a deep link, exits — toward the surface it came from. */}
        <AppHeader
          title={title ?? ''}
          interactive={reveal.interactive}
          onTitlePress={openIndex}
          titleHint={t('index.titleHint')}
          /**
           * ⚠️ `trailing`, AND NEVER `headerRight` — the reserved-word gate. Under custom chrome
           * there is no native header slot to reach for, which is the point: the defect that gate
           * exists for is unwritable here rather than merely forbidden.
           *
           * ⚠️ IT RIDES THE REVEAL LIKE EVERYTHING ELSE IN THIS BAR. A transport pinned outside
           * the chrome would be a second mechanism at a second speed — the `chrome-render-storm`
           * shape. A listener who has hidden the chrome pauses from the lock screen, or taps once
           * to bring it back.
           */
          trailing={
            <View style={[styles.trailing, !reveal.interactive && styles.inert]}>
              {headerTransport ? (
                <HeaderActionButton
                  name={playing ? 'pause' : 'play'}
                  onPress={headerTransport}
                  color={colors.accent.primary}
                  accessibilityLabel={tAny(
                    playing ? 'player:a11y.pauseRecitation' : 'player:a11y.playRecitation'
                  )}
                  focusable={reveal.interactive}
                  testID="chrome-play-toggle"
                />
              ) : null}
              {/* ⚠️ THE ONLY VISIBLE WAY OUT, AND THAT IS WHY IT EXISTS (owner call 2026-09-10).
                  Revealed chrome COVERS whatever revealed it — the mushaf's header band sits
                  under this very bar, and the footer band under the tab bar's pills — so the only
                  thing still showing is Quran text, which seeks. Dismissal therefore rested on
                  two invisible affordances: the dwell, and a tap falling through `box-none` onto
                  a band the reader cannot see. A chevron is the affordance those two lacked.
                  `toggle` rather than a new `hide`: this control is reachable only while
                  `interactive`, which is only true while the chrome is up. */}
              <HeaderActionButton
                name="chevron-up"
                onPress={reveal.toggle}
                color={colors.accent.primary}
                accessibilityLabel={t('actions.hideChrome')}
                focusable={reveal.interactive}
                testID="chrome-dismiss"
              />
            </View>
          }
          leading={
            <HeaderActionButton
              name={mode === 'reading' ? 'view-agenda' : 'view-list'}
              onPress={() => router.navigate(mode === 'reading' ? HOME_HREF : READ_HREF)}
              color={colors.accent.primary}
              accessibilityLabel={t(
                mode === 'reading' ? 'actions.openMushaf' : 'actions.openReading'
              )}
              focusable={reveal.interactive}
              testID="chrome-mode-toggle"
            />
          }
        />
        {/* ⚠️ UNDER THE BAR, INSIDE THE REVEALED CHROME. A playback failure is silent otherwise —
            the reader presses play and the glyph flips back with no message, which reads as a
            broken button rather than as "this reciter is not reachable right now". The retry is
            the same handler as the transport: pressing it re-attempts the surah. */}
        {errorMessage ? (
          <InlineError
            message={errorMessage}
            onRetry={onTogglePlay}
            style={styles.error}
            testID="chrome-playback-error"
          />
        ) : null}
      </Animated.View>

      <Animated.View
        style={[styles.slot, styles.bottom, reveal.footerStyle]}
        pointerEvents={touches}
        {...offscreen}
        testID="reading-chrome-footer"
      >
        {/* ⚠️ INSIDE THE FOOTER, ABOVE THE TAB BAR — one bar, one driver, no second animation
            (story 7-8). The row draws verse actions when an ayah is selected, the mini player
            when audio is loaded and nothing is, and nothing at all otherwise; a footer with no
            row is byte-identical to the pre-7-8 one. */}
        <ChromeVerseRow
          selected={selectedVerse}
          interactive={interactive}
          onOpenReciters={openReciters}
          onOpenPlaybackOptions={openPlaybackOptions}
          onInteract={keepAlive}
        />
        <AppTabBar interactive={reveal.interactive} />
      </Animated.View>

      {/* Outside both bars, deliberately — see `recitersOpen` above. */}
      <ReciterSheet open={recitersOpen} onClose={closeReciters} />
      <PlaybackOptionsSheet open={playbackOptionsOpen} onClose={closePlaybackOptions} />
    </>
  );
}

const styles = StyleSheet.create({
  /** See `HeaderActionButton`'s `inert` — the row itself hit-tests on web too. */
  inert: {
    pointerEvents: 'none',
  },
  /** The transport and the dismiss chevron share the one `trailing` slot. */
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  top: {
    top: 0,
  },
  error: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  bottom: {
    bottom: 0,
  },
});
