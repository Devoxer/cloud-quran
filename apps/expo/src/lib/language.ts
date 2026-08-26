/**
 * THE language preference (Story 20.6) — device-local, MMKV-persisted, ONE key.
 *
 * Stories 20.3/20.4 shipped TWO independent preferences (app chrome vs. content) behind two
 * pickers under a hub. Story 20.6 collapses them into ONE: the language you pick drives the
 * app's own chrome (i18next `t()` output), which `contentObjects`/`excerpts` rows are read, which
 * voice narrates them, and which language a new download is fetched in. The owner's call —
 * two axes were a power-user affordance nobody asked for, and every pair of them that could
 * disagree was a defect surface (English chrome over French audio, a download whose language the
 * row didn't record).
 *
 * ⚠️ UNSET SEEDS FROM THE DEVICE LOCALE (Story 24.13 § D1) — this REVERSES 20.6's "unset means
 * `en`, the picker is the sole writer". 20.6's objection was real but is now void: it rejected a
 * seed because gating one on the async released-set produces a post-paint language flash
 * (STACK-CHEAT-SHEET § State boundary), and "a static released-set constant defeats the flip-a-
 * language-on-with-a-DB-write model". That model never existed — `AVAILABLE_UI_LANGUAGES` is
 * already compile-time and 20.4's just-in-time rule ships a language's chrome alongside its
 * content, so **adding a language already requires an app release**. So 24.13 makes exposure an
 * explicitly compile-time constant (`EXPOSED_LANGUAGES`), which the SYNCHRONOUS getter can consult
 * — the exact thing 20.3 Step I could not do with a live DB query. A French-locale phone gets
 * French only when the app itself was BUILT with French exposed. No flash, no async coupling, and
 * the ungated-device-derived-code hole stays closed.
 *
 * ⚠️ TWO STORES, ONE ANSWER (Story 24.18) — and the division of labour is exact:
 *
 *  • **MMKV = the boot seed and the persistence target, nothing else.** One reader OUTSIDE this
 *    file ({@link getStoredLanguage}), one writer ({@link setLanguage}). `initI18n()` reads it once
 *    at launch to decide what to start i18next on. (`setLanguage` also reads the key directly for
 *    its pre-burst snapshot — deliberately RAW, because that read asks "was anything ever stored?"
 *    and a normalized read cannot answer it: `resolveLanguage` maps unset and unexposed to the same
 *    string. It is the only exception, and it never feeds a render.)
 *  • **i18next = every runtime read.** {@link getLanguage} and {@link useLanguage} both resolve
 *    `i18n.language`, so "what language is the app in" always means the switch that COMMITTED —
 *    never the one a write merely intended.
 *
 * Why the split is that way round: `setLanguage` persists BEFORE it commits, and it must (the
 * restart is what applies a committed move, so the preference has to be on disk first). A reader
 * on MMKV therefore runs AHEAD of the app — that is how a screen ends up painting new chrome over
 * rows fetched in the old language, and how a rolled-back switch re-renders ~40 consumers for a
 * change that never happened. Reading the commit makes both impossible by construction instead of
 * by a rule every future feature has to remember (`stack/simplicity.md` § check 6 — delete the
 * condition rather than police it at N call sites, the same reasoning 24.27 used).
 *
 * The seed is a PARAMETER, never a device read inside `resolveLanguage` — that function's purity
 * is load-bearing (see its own doc). All THREE readers pass `deviceSeedLanguage()`, so they floor
 * identically and can never disagree.
 *
 * ⚠️ The stored value is NORMALIZED at read time against `EXPOSED_LANGUAGES` — a compile-time
 * constant, never a DB read. That is what makes the synchronous getter possible and what closes
 * 20.3's two carve-ins structurally rather than with new machinery:
 *  • A preference whose language a later release UN-EXPOSES keeps rendering chrome the app
 *    genuinely ships, while its content reads degrade through the existing whole-section `en`
 *    fallback. And because `en` is ALWAYS in the picker's option set, tapping it is a real commit
 *    (not the no-op already-selected row) — the repair 20.3 called unreachable is one tap away.
 *  • The option set has a static floor (`en` + the current selection), so there is no empty group,
 *    no permanently-inert one-row list, and no window in which a tap is silently discarded. Since
 *    Story 24.16 the set is computed from compile-time constants with NO database read at all, so
 *    it is settled on the first paint — there is no longer even a loading window to floor against.
 *
 * ⚠️ Import discipline (the cycle this module is designed around): take the i18next singleton from
 * `'i18next'` DIRECTLY, never from `@/i18n` — `changeLanguage` needs the instance, not the app's
 * init module, and importing `@/i18n` would cycle back through `initI18n`. The bundle set comes
 * from the `@/i18n/resources` LEAF. See that file's edge map.
 */

import { reloadAppAsync } from 'expo';
import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { BASE_LANGUAGE, EXPOSED_LANGUAGES } from '@/constants/language';
import { AVAILABLE_UI_LANGUAGES } from '@/i18n/resources';
import { getCachedLocale } from './localization';
import { createAppMMKV } from './mmkv';

export { AVAILABLE_UI_LANGUAGES };

/** Device-local language-preferences store. */
const storage = createAppMMKV('language-prefs');

/** The ONE MMKV key. (The retired `ui_language` / `content_language` keys are gone — clean
 * cutover, zero users; nothing reads them.) */
export const LANGUAGE_KEY = 'language';

/**
 * True when the app SHIPS a chrome bundle for this code.
 *
 * ⚠️ Since Story 24.13 this is a strictly WEAKER claim than {@link isExposedLanguage} — `fr`
 * bundles ship while `fr` is not offered. This predicate answers "can i18next render it", which is
 * what the `EXPOSED_LANGUAGES ⊆ AVAILABLE_UI_LANGUAGES` invariant test checks; it is NOT the
 * eligibility rule. Do not use it to gate the picker.
 */
export function isAvailableLanguage(code: string | undefined | null): boolean {
  return code != null && (AVAILABLE_UI_LANGUAGES as readonly string[]).includes(code);
}

/** True when THIS BUILD offers the code to users (Story 24.13 § D1 — the exposure gate). */
export function isExposedLanguage(code: string | undefined | null): boolean {
  return code != null && EXPOSED_LANGUAGES.includes(code);
}

/**
 * Resolve a stored preference to a language this build actually offers. **Pure** — no device read,
 * no DB read — and exported so `initI18n`, the picker, and every content resolver agree by
 * construction.
 *
 * ⚠️ PURITY IS LOAD-BEARING, which is why the device seed is a PARAMETER (Story 24.13 § D1). This
 * function has callers beyond `getLanguage()` — notably `setLanguage`'s rollback branch, which asks
 * the counterfactual "would an UNSET preference already resolve to what is rendering?" and must be
 * able to ask it without a device read of its own.
 *
 * Normalizes against `EXPOSED_LANGUAGES`, not `AVAILABLE_UI_LANGUAGES`: a stored preference naming
 * a language a later release UN-exposes then self-repairs to the fallback at the next launch,
 * synchronously, with no new machinery. An empty string floors like `undefined` does — a corrupted
 * MMKV entry must not send `language: ''` into every `contentObjects` query (0 rows, then a
 * permanent extra full-namespace fallback query per book open / page turn / quiz).
 */
export function resolveLanguage(
  stored: string | undefined,
  fallback: string = BASE_LANGUAGE
): string {
  return isExposedLanguage(stored) ? (stored as string) : fallback;
}

/**
 * The language an UNSET preference falls back to — the device's own language when this build
 * exposes it, otherwise `BASE_LANGUAGE` (Story 24.13 § D1).
 *
 * Reads the ALREADY-CACHED boot locale (`lib/localization.ts`, initialized at module scope in
 * `app/_layout.tsx` before `initI18n()`), so this is synchronous and costs nothing. Deliberately
 * NOT a second `getLocales()` call — one locale reader in the app, and the cached one is the
 * web/jsdom-guarded one. A `null` cache (localization not yet initialized, or SSR) floors to
 * `BASE_LANGUAGE`, which is what makes the web server render deterministically.
 */
export function deviceSeedLanguage(): string {
  const code = getCachedLocale()?.languageCode;
  return isExposedLanguage(code) ? (code as string) : BASE_LANGUAGE;
}

/**
 * The STORED PREFERENCE (synchronous, normalized, device-seeded) — MMKV's ONE reader.
 *
 * ⚠️ THIS IS THE BOOT PATH AND NOTHING ELSE (Story 24.18). `initI18n()` hands it to i18next as
 * `lng` (`i18n/index.ts`); every runtime read wants {@link getLanguage} instead — the language
 * that actually committed. The two are only ever equal AFTER boot has applied the preference.
 *
 * ⚠️ Pointing `initI18n` at `getLanguage()` by mistake compiles, type-checks and passes every
 * consumer test — and silently discards every user's saved language at launch, because
 * `i18n.language` is undefined until init runs, so the committed reader would floor to the device
 * seed on every cold start. There is a test for exactly that (`language.test.ts` § boot).
 */
export function getStoredLanguage(): string {
  return resolveLanguage(storage.getString(LANGUAGE_KEY), deviceSeedLanguage());
}

/**
 * The COMMITTED language (synchronous, normalized, device-seeded). Safe in non-hook contexts —
 * this is what the playback / read / download / quiz / voice resolvers read at resolution time, so
 * a language change applies to the next resolution with no invalidation dance.
 *
 * ⚠️ Reads `i18n.language`, NOT MMKV (Story 24.18 — see the file header for why). Before
 * `initI18n()` and under web SSR there is no committed language yet, so this floors to
 * `deviceSeedLanguage()`.
 *
 * ⚠️ **THAT FLOOR IS NOT THE SAME ANSWER BOOT IS ABOUT TO GIVE, AND THE DIFFERENCE IS THE STORED
 * PREFERENCE.** With nothing stored the two agree (both land on the device seed). With a stored
 * `fr` on an `en` device they do NOT: this returns `en` while `initI18n` is about to start i18next
 * on `fr`. So **nothing may call this at MODULE SCOPE** — every caller must resolve per access,
 * which is the convention the resolvers already state for their own reasons
 * (`features/quotes/data/index.ts`, `quotesStorage.ts`). This is the second boot-ordering rule in
 * the file, after `initLocalization()` before `initI18n()` (`app/_layout.tsx`); neither is
 * enforceable by tsc or lint, and `language.test.ts` § AC-4 pins the divergence itself so the
 * asymmetry is at least visible.
 */
export function getLanguage(): string {
  return resolveLanguage(i18n.language, deviceSeedLanguage());
}

/**
 * Persist the language and then take ONE of two paths:
 *
 *  • **The language MOVED** (a committed switch to something other than what is rendering) →
 *    **persist → RELOAD**. i18next is deliberately NOT switched live; the app restarts and
 *    `initI18n` reads the key back on a fresh context.
 *  • **The language did NOT move** (re-picking what is already rendering, or a code this build does
 *    not expose) → **persist → `changeLanguage` → rollback-on-reject**, exactly as before. A
 *    REJECTED `changeLanguage` ROLLS THE MMKV WRITE BACK (restoring the previous value, or clearing
 *    the key when there wasn't one) so the stored preference and `i18n.language` can never disagree.
 *    Rejects with the underlying error so the picker can surface it; the preference is unchanged.
 *    ⚠️ **"Can never disagree" is scoped to THIS branch** — the committed branch above deliberately
 *    leaves them disagreeing from the write until the restart lands, and every "the disagreement is
 *    what this function exists to prevent" line below is likewise about the ROLLBACK's reasoning,
 *    not a claim about the function as a whole. Since Story 24.18 that transient disagreement costs
 *    nothing, because no runtime reader reads MMKV (see the file header).
 *
 * ⚠️ The split is a CRASH FIX, not a tidy-up — reloading into the live-switch cascade dies with a
 * `SIGBUS` inside React's Scheduler. The call site documents the measurement in full. It is also why
 * a committed switch can no longer surface a `changeLanguage` failure: there is nothing left on that
 * path to fail, because the bundles are compile-time.
 *
 * Only the LATEST switch may roll back (20.3 Step I, hardened 20.4 Step G). Two switches can
 * overlap across mounts — the picker's one-shot commit guard is per-mount, so picking `fr`,
 * popping, and immediately re-entering to pick `de` starts a second call. If the FIRST then
 * rejects, a blind restore would write its own stale predecessor over the committed `de` while
 * `i18n.language` is already `de` — reintroducing exactly the MMKV-vs-i18next disagreement this
 * function exists to prevent. So a superseded switch's failure is a no-op.
 *
 * ⚠️ "Superseded" is decided by a monotonic TICKET, not by comparing the stored value to our own
 * `code`. A value compare cannot tell OUR write from an identical one: two overlapping switches to
 * the SAME language (tap `fr`, pop, re-enter, tap `fr` again) both store `'fr'`, so if the first
 * rejects while the second's `changeLanguage` is still pending, a value-CAS reads its own code
 * back, concludes nothing superseded it, and rolls MMKV back to what is rendering (`en`) — then
 * the second switch resolves, i18next renders French, and nothing ever re-writes the preference.
 * MMKV and i18next disagree, and the next cold start reverts to English. The ticket makes the
 * older call unambiguously not-latest whatever the values are.
 *
 * And what it restores is the LIVE `i18n.language`, never a captured predecessor (20.4, AC-9): a
 * predecessor is only ever a language some OTHER switch *intended*, not one i18next applied. When
 * BOTH of two overlapping switches reject — A picks `fr` (nothing stored), B picks `de`, A rejects
 * first (correctly a no-op), then B rejects — restoring B's predecessor would persist `'fr'`, a
 * language i18next never switched to, and the next cold start would adopt it. Reading what is
 * ACTUALLY rendering is true by construction however many switches overlapped.
 *
 * ⚠️ The clear-vs-pin decision reads the preference as it stood before the whole BURST of
 * overlapping switches, not before this one call — the same class of reasoning error as the two
 * above. B's own predecessor is `'fr'`, i.e. A's never-applied write, so keying on it would pin a
 * user who had NEVER chosen a language to whatever they happened to be seeing.
 * `preSequencePreference` is captured only when no switch is already in flight, so it is the
 * genuine "did the user ever choose one" answer.
 *
 * ⚠️ A COMMITTED SWITCH RELOADS THE APP (Story 24.27), and that reload IS the mechanism — not a
 * flourish on top of one. Any value cached in this process that was RESOLVED in a language (a
 * screen's last-good book row, the feed's BOOK accumulator, the engine's book-meta map) is wrong the
 * instant the language moves, and a row's very SHAPE is language-dependent because the queries only
 * project the localized columns under a non-base language. (A cache that keeps its candidates
 * UNRESOLVED and picks per render is outside the class — the feed's audioFiles accumulator does
 * that since Story 24.35 — but it is a shape a screen has to choose, not the default, and it holds
 * only while that screen's QUERY stays language-blind: filter the rows server-side and the same
 * cache is language-resolved again. The feed's test suite pins the absent clause for that reason.)
 * Enforcing
 * "key it by the language or clear it when the language changes" at each site was tried: seven
 * sites across two stories, a HIGH finding in four consecutive review rounds, and NOTHING can
 * catch the next violation — a new screen caching a translated value is invisible to tsc, Biome,
 * the jest/RNTL net and the locale-parity suite alike. Restarting invalidates every such value by
 * construction, the ones that exist and every one added later, so there is no invariant left to
 * violate and no rule to remember.
 *
 * ⚠️ The primitive is `reloadAppAsync()` from `expo`, NEVER `Updates.reloadAsync()` from
 * `expo-updates` — that one is documented to REJECT in development builds and Expo Go, i.e. in
 * every build this app is actually developed and smoke-tested in. `reloadAppAsync` reloads the
 * currently running bundle (fresh JS context, no update check, no network) and behaves identically
 * in dev builds, release builds and Expo Go, on iOS, Android and Web. A React `key` remount is NOT
 * an alternative: `useAudioPlayerStore` is a module-level Zustand store hosted as a SIBLING of the
 * nav tree, so it would survive the remount and desync from a torn-down native playlist.
 *
 * Nothing may follow the reload on the SUCCESS path — treat code after it as unreachable, which is
 * why every persist happens above it and why the committed branch returns immediately. Its
 * REJECTION path is the exception: on ANDROID the native call rejects when there is no current
 * activity to reload (iOS never rejects — see the call site), and the fallback there applies the
 * language live so the user's tap takes effect in-session instead of appearing to do nothing.
 *
 * ⚠️ That fallback is NOT holding a split-brain at bay — do not restore the older claim that it is.
 * Since Story 24.18 every runtime reader takes `i18n.language`, so a failed reload with no fallback
 * would leave the app COHERENTLY on the old language with the preference honoured at the next boot.
 * The call site states both accepted residuals in full (§ D5).
 *
 * ⚠️ In a DEV build the reload re-fetches the bundle from Metro, so it cannot come back with no
 * route to the packager. That makes the OFFLINE arm of this behaviour unverifiable in a dev client —
 * it needs a release build, where the bundle is embedded and the reload is purely local. The
 * shipped behaviour is the release one; do not read a dev-build airplane-mode failure as a defect.
 *
 * Three costs, accepted (owner decision, 24.27):
 * playback stops on a mid-listen switch; navigation state is lost (the user comes back on the
 * default tab, not on the picker); and a download in flight is INTERRUPTED rather than cancelled.
 * The first two are conventional for a language change. The third is worth naming because it moved:
 * the switch used to call `cancelAllDownloads()` (inside the deleted teardown) and then sweep the
 * partial away, whereas the restart simply ends the download loops with the JS context, leaving a
 * partly-downloaded book in the language it was being fetched in. Re-adding the cancel would be
 * dead weight — the generation registry is in-memory and does not outlive the reload — and the
 * resulting state is one the app already handles: it is exactly what force-quitting mid-download
 * produces, `isBookDownloaded` counts the book by the sections that did land, and re-tapping
 * download fills in the rest.
 *
 * ⚠️ THE SWITCH DESTROYS NOTHING (Story 24.27 AC-9). It used to delete every download and sweep the
 * content cache; it no longer touches either. Downloads made in another language simply stay on
 * disk, unreachable until you switch back, because every offline file carries its language in its
 * own NAME (`{sectionType}_{language}_{voiceId}`, `meta_{language}.json` — `lib/storage.ts`): the
 * read path builds the CURRENT language's name and does not find the other one. The sweep was
 * therefore deleting bytes that were already inert, and it never achieved the "one language on
 * disk" guarantee it existed for — a DEVICE-locale change reaches the same two-languages-on-disk
 * state with no teardown at all, and that state was already accepted. The user-visible upside is
 * the point: switch away and back and your downloads are simply there again.
 *
 * The one consequence worth stating here: the Offline screen's header and its delete-all dialog
 * count only the CURRENT language, so they can read "0 books · 0 B" while another language's bytes
 * are on disk. Accepted — the 30-book cap is language-bound by owner decision, and the trash
 * affordance is gated on a RAW language-blind disk scan
 * (`app/(tabs)/(library)/offline.tsx` § `hasOfflineFilesOnDisk`), so those bytes are always
 * reclaimable.
 */

/** Monotonic switch id — only the newest switch may roll back (see {@link setLanguage}). */
let latestSwitchTicket = 0;
/** Overlapping switches currently awaiting `changeLanguage`. */
let switchesInFlight = 0;
/** The stored preference as it stood before the current burst of overlapping switches. */
let preSequencePreference: string | undefined;

export async function setLanguage(code: string): Promise<void> {
  const ticket = ++latestSwitchTicket;
  if (switchesInFlight === 0) {
    preSequencePreference = storage.getString(LANGUAGE_KEY);
  }
  switchesInFlight++;
  // What is ACTUALLY rendering right now — the only honest answer to "did the language change?".
  // Since Story 24.18 this is literally what `getLanguage()` returns; it stays spelled out because
  // the same `seed` is needed twice more below (the move test and the rollback counterfactual) and
  // resolving it once is what keeps all of them reasoning about the same `en` (Story 24.13 AC-4).
  const seed = deviceSeedLanguage();
  const rendering = resolveLanguage(i18n.language, seed);
  // ⚠️ Decided HERE, before the write and before any await, from two values that cannot change
  // under us. Normalized with the SAME `seed` on both sides: resolve one against the bare
  // `BASE_LANGUAGE` default instead and the two readers of one key disagree — for an unexposed
  // `code` on a device-seeded `fr` user, one side says `fr` and the other `en`, so the branch fires
  // (or doesn't) on a language nobody is in.
  const languageMoved = resolveLanguage(code, seed) !== rendering;
  storage.set(LANGUAGE_KEY, code);

  // ⚠️⚠️ A COMMITTED MOVE RESTARTS *INSTEAD OF* SWITCHING i18next LIVE, AND THE ORDER HERE IS A
  // CRASH FIX — measured on an iOS 26.5 simulator, 2026-07-30, not reasoned about. Reloading after
  // `changeLanguage` killed the app with `EXC_BAD_ACCESS` / `SIGBUS` on the
  // `com.facebook.react.runtime.JavaScript` thread, faulting inside
  // `Scheduler::uiManagerDidFinishTransaction` on a freed callback: the old Scheduler finishing a
  // mounting transaction after the reload had torn it down. Inline it died on every switch;
  // deferred a tick (`InteractionManager.runAfterInteractions`) the first switch survived and the
  // second died with a byte-identical trace, because the trigger is not one tick of work — it is
  // the whole CASCADE that `storage.set` + `changeLanguage` start (every `useMMKVString` subscriber
  // re-renders, every language-scoped query re-subscribes, the picker pops).
  //
  // So do not race the cascade: start as little of it as possible. Persist, restart, and let
  // `initI18n` read the key back on the fresh context — which is the mechanism 24.27 is built on
  // anyway, so skipping the live switch costs nothing. Verified over six consecutive switches in
  // both directions with the process surviving each time (and a 3s-delayed reload survived seven,
  // which is what identified the cascade as the cause rather than the reload primitive).
  //
  // ⚠️ STORY 24.18 TOOK THE REMAINING HALF. 24.27 left this write still notifying every
  // `useMMKVString(LANGUAGE_KEY)` subscriber — so ~40 `useLanguage()` consumers re-rendered and
  // re-subscribed their language-scoped queries in the milliseconds before the process died — and
  // its own prescription was "if a SIGBUS ever recurs, shrink what reacts to that write." 24.18
  // shrank it to nothing: the readers moved onto i18next's `languageChanged`, which this path
  // deliberately never fires. `storage.set` now has ZERO subscribers, so a committed move starts
  // no cascade at all before the reload.
  //
  // ⚠️ DO NOT re-key any reader on this write to "make the UI feel instant" — that re-opens both
  // the crash surface above and the paint-ahead-of-the-commit window 24.18 closed. The switch is
  // meant to be invisible until the restart lands.
  //
  // ⚠️ DO NOT "fix" a future recurrence by widening a delay — that narrows a race instead of
  // removing it, which is the exact anti-pattern this story exists to stop repeating.
  //
  // Consequence, deliberate: `changeLanguage` is NOT called on this path, so its rejection — and
  // the rollback below — are reachable only for a switch that does NOT move the language. That is
  // sound because the bundles are compile-time (`EXPOSED_LANGUAGES ⊆ AVAILABLE_UI_LANGUAGES`, pinned
  // by a test), so a committed switch to an exposed language cannot lack one.
  //
  // ⚠️ AND SINCE STORY 24.18 THE NON-MOVING BRANCH IS UNREACHABLE FROM THE PICKER — read the rest
  // of this function as DEFENSIVE, not as live machinery. The picker's `selectedCode` is now
  // `useLanguage().language`, i.e. literally the `rendering` value computed above, and it refuses
  // to commit the already-selected row; every code it offers is exposed. So `languageMoved` is true
  // for every switch the UI can produce. It was reachable before 24.18 only because `selectedCode`
  // came from MMKV and could disagree with `i18n.language`. The branch stays because `setLanguage`
  // is exported with no argument validation and the ticket/rollback reasoning below is expensive to
  // re-derive (five stories of HIGH findings) — but do not "improve" it on the belief that a user
  // reaches it.
  if (languageMoved) {
    // Keep the burst bookkeeping honest rather than assuming death: on a platform where
    // `reloadAppAsync` is a no-op (no `globalThis.expo` — jest, SSR) the JS context survives this
    // line. The preference is then ahead of i18next until the next launch, which self-heals because
    // `initI18n` reads this key at boot.
    switchesInFlight--;
    // ⚠️ THE RELOAD IS NOT GUARANTEED, SO IT NEEDS A FALLBACK. The native call REJECTS when there
    // is no current activity (Android — the user backgrounds the app exactly as the commit lands),
    // and this is what makes the switch take effect anyway instead of appearing to do nothing
    // until the next launch.
    //
    // ⚠️ WHAT IT IS FOR CHANGED AT STORY 24.18, and the old reason is no longer true — do not
    // restore it. It used to read "without this the session is left with MMKV on the new language
    // and i18next on the old one: every query, download, voice and lock-screen read follows MMKV
    // while every `t()` string follows i18next" — the English-chrome-over-French-audio split. That
    // was accurate while the resolvers read the PREFERENCE. They read `i18n.language` now
    // (`getLanguage`), so a failed reload with no fallback would leave the app COHERENTLY on the
    // old language, with the preference honoured at the next boot. The fallback survives because
    // honouring the user's tap in-session is worth having, not because a split-brain is one line
    // away.
    //
    // ⚠️ TWO RESIDUALS, BOTH ACCEPTED (Story 24.18 § D5) — stated here because this is the only
    // path that can reach them:
    //
    //  1. If this fallback ALSO rejects, MMKV is ahead of i18next until the next launch. That
    //     state is now COHERENT rather than split: the whole app renders the old language and the
    //     preference is applied at the next boot. Improved, not eliminated — and deliberately not
    //     "fixed" by rolling MMKV back, which would discard the choice the user actually made.
    //  2. If this fallback SUCCEEDS, every reader moves to the new language with NO RESTART behind
    //     it — so any value a mounted screen accumulated under the old language is stale for the
    //     rest of the session (the feed's BOOK accumulator, `book/[id]`'s `cachedBookRef`, the
    //     player's `cachedSectionRef`, and — Story 37.3 — the `language` super-property registered
    //     once in `initAnalytics()`, so this session's events keep reporting the OLD language).
    //     ⚠️ The feed's other accumulator — its audioFiles rows —
    //     is NOT in this set since Story 24.35: it holds unresolved candidates and picks one per
    //     render, so it follows a live switch by construction — for exactly as long as its query
    //     stays language-blind (see the ⚠️ at that query). Story 24.18 does not touch the
    //     rest: it is the same cached-language-resolved-value class 24.27 deleted by restarting,
    //     and re-adding a per-site reset at three screens to cover one Android-only failure path
    //     would trade a bounded, documented residual for a rule nothing can enforce
    //     (`stack/simplicity.md` § check 6). Stated, not guarded.
    //
    // Applying the language LIVE is safe *here* and nowhere else on this path: the reload already
    // failed, so there is no restart left to race and no Scheduler about to be freed — the crash
    // above is caused by reloading INTO the cascade, not by the cascade itself. If this fallback
    // also throws we are past what the picker can be told (it has already dismissed), so it is
    // captured and swallowed; the preference is ahead of i18next until the next launch, which
    // `initI18n` self-heals at boot.
    //
    // ⚠️ Story 24.27 Step I — WHICH PLATFORM CAN REACH THIS. Only Android: its native
    // `reloadAppAsync` resolves `appContext.throwingActivity`, which throws `MissingActivity` with
    // no current activity. iOS's is a non-throwing `Void` func that only dispatches
    // `RCTTriggerReloadCommandListeners`, so the promise there always resolves — there is no iOS
    // failure mode for this catch to catch, and none is missing. The other non-restart shape (no
    // `globalThis.expo` at all — jest, SSR) resolves rather than rejects and is handled by the
    // self-heal noted above, not here.
    void reloadAppAsync('Language changed').catch((reloadError) => {
      // ⚠️ `require`d on the FAILURE PATH, never imported at module scope. This module must stay a
      // LEAF at load time — `initI18n()` calls `getStoredLanguage()` on the boot path — and a static
      // `./errors` import drags Sentry + `config` + `deviceContext` onto that graph. To be exact
      // about what "leaf" forbids, since this file's own first import is `expo`: no APP module
      // (nothing under `@/lib`, `@/features`, `@/stores`) and no third-party SDK that initializes
      // on import. The `expo` core runtime is not that — it is already evaluated before this
      // module is reachable (the entry loads `expo-router`, which loads `expo`), so importing
      // `reloadAppAsync` from it adds nothing to the boot graph. Measured, not
      // assumed: it also made `errors.test.ts` and `telemetryScrub.test.ts` fail as a pair, because
      // a module `jest.setup.js` has already loaded can no longer be `jest.mock`ed by the suites
      // that own it. `require` (not `await import()`) for the same Metro/Jest reasons the rest of
      // this codebase uses it.
      // biome-ignore lint/style/noCommonJs: load-time leaf seam — see above.
      const { captureException } = require('./errors') as typeof import('./errors');
      captureException(reloadError, { context: 'setLanguage.reload', code });
      // Normalized like every other write in this module — i18next may never be left on a code
      // this build has no bundle for (the invariant in the file header). And the failure of the
      // LAST line of defence is the one outcome most worth an event: without it, the split-brain
      // this whole fallback exists to prevent would land with no signal at all.
      return i18n.changeLanguage(resolveLanguage(code, seed)).catch((fallbackError) => {
        captureException(fallbackError, { context: 'setLanguage.reloadFallback', code });
      });
    });
    return;
  }

  try {
    await i18n.changeLanguage(code);
  } catch (err) {
    // Only roll back if nothing else has since started (see above).
    if (ticket === latestSwitchTicket) {
      // Normalized so an unshipped code can never be written back — the invariant this module
      // exists to hold (see the file header).
      const live = resolveLanguage(i18n.language, seed);
      // Prefer CLEARING over pinning whenever an unset preference already resolves to what is
      // rendering: `remove` (the v3 API, not `delete`) restores "unset = the device seed", which is
      // a strictly weaker claim than pinning a language the user never chose. Under Story 24.13's
      // seed this counterfactual MUST use the same `seed` — asking it against the bare
      // `BASE_LANGUAGE` default would pin a French-locale user who never chose a language.
      if (preSequencePreference === undefined && resolveLanguage(undefined, seed) === live) {
        storage.remove(LANGUAGE_KEY);
      } else {
        storage.set(LANGUAGE_KEY, live);
      }
    }
    throw err;
  } finally {
    switchesInFlight--;
  }
}

/**
 * `useSyncExternalStore`'s subscribe half. MODULE SCOPE ON PURPOSE — an inline arrow is a fresh
 * function on every render, which makes React tear the listener down and re-register it on every
 * render of every one of the ~40 consumers, churning `on`/`off` on one singleton emitter.
 *
 * `i18n.on` is safe before `initI18n()`: the i18next singleton is an event emitter from
 * construction, so no `isInitialized` guard belongs here. The pre-init case is the SNAPSHOT's
 * problem, and {@link getLanguage} floors it.
 */
function subscribeToCommittedLanguage(onStoreChange: () => void): () => void {
  i18n.on('languageChanged', onStoreChange);
  return () => {
    i18n.off('languageChanged', onStoreChange);
  };
}

/**
 * Reactive COMMITTED language + the async setter. Re-renders on i18next's `languageChanged` and on
 * nothing else — in particular NOT on `setLanguage`'s MMKV write (Story 24.18; see the file
 * header). That is the whole point: the optimistic write used to fan out to every consumer before
 * the switch had happened, and to fan out a second time when a rejected switch rolled it back.
 *
 * ⚠️ The snapshot is the language STRING, never the returned object. `useSyncExternalStore`
 * compares snapshots by identity, so a fresh `{ language, setLanguage }` per call reads as
 * "changed every render" and loops. Build the object out here, from the string.
 *
 * {@link getLanguage} serves as `getServerSnapshot` too. ⚠️ Be precise about what that buys: React
 * calls `getServerSnapshot` on the CLIENT during hydration as well as on the server, and on the
 * client `initI18n()` has already run at module scope — so it returns the real language there while
 * the prerendered HTML carries the server's `BASE_LANGUAGE` floor. That is a hydration divergence,
 * not a floor that holds on both sides. It is behaviourally identical to the `useMMKVString` reader
 * this replaced (the web MMKV stub floored the same way), so nothing regressed — and the web
 * verification pass that would surface it is open and owned by Story 24.19, per § AC-6 in
 * `language.test.ts`.
 *
 * ⚠️ It takes the SAME device seed the other two readers do (Story 24.13 AC-35, now spanning three
 * readers): leave any of them on the bare default and a device-seeded launch renders French chrome
 * while the picker reports `en` — wrong checkmarked row, and `useLanguageOptions`'
 * current-selection floor pins the wrong language. The seed is a boot-cached synchronous read, so
 * calling it per render costs nothing.
 */
export function useLanguage(): {
  language: string;
  setLanguage: (code: string) => Promise<void>;
} {
  const language = useSyncExternalStore(subscribeToCommittedLanguage, getLanguage, getLanguage);
  return { language, setLanguage };
}
