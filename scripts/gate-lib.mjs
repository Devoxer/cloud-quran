/**
 * gate-lib.mjs — the primitives the `lint-*.mjs` gates share.
 *
 * Every export here existed as two to six copies that had already drifted apart. The point of the
 * module is not reuse for its own sake: it is that each of these answers a question where the
 * copies disagreed, and a disagreement between copies of a fail-closed check is a hole.
 *
 *   - The LINE INDEX. Three derived views of one source (a `\n` count, a full-terminator split, a
 *     blanker that turned a `\r` inside a string into a space) could desync, silently, and did:
 *     one lone `\r` or U+2028 above a violation made an UNRELATED carve-out comment suppress it.
 *     Here there is one terminator definition and every view is built from it, so a desync is
 *     unrepresentable rather than fixed.
 *   - The ESCAPE-HATCH MARKER. Two copies differing only in their token, each admitting a
 *     different set of residuals in its docblock.
 *   - The ENTRYPOINT CHECK. Six copies, and one of them answered the same question two opposite
 *     ways inside one function. The direction is a per-script judgement, so it is a REQUIRED
 *     argument here — never a default (see `isMainModule`).
 *
 * ⚠️ Never type a literal U+2028/U+2029 in this file (or in anything that edits it). They are JS
 * line terminators: a literal one ends the statement or comment it lands in. Written as `\u`
 * escapes throughout; build any character class from `String.fromCharCode(0x2028)` in a scratch
 * script rather than pasting one.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── The line-terminator set, defined ONCE ─────────────────────────────────────────────────────

/**
 * The body of the JS line-terminator character class. Everything below derives from this string,
 * so the split, the blank-run replacement and the line-comment pattern cannot disagree about
 * where a line ends. ECMAScript's LineTerminator production is exactly LF, CR, U+2028, U+2029.
 */
const TERMINATORS = '\\n\\r\\u2028\\u2029';

/** Splits on the full terminator set, with CRLF as ONE terminator. Not global — `split` ignores
 * the `g` flag anyway, and a shared global regex is a `lastIndex` hazard. */
export const LINE_TERMINATOR_RE = new RegExp(`\\r\\n|[${TERMINATORS}]`);

/** Every character that is NOT a line terminator — the blank-run replacement target. */
const NON_TERMINATOR_G = new RegExp(`[^${TERMINATORS}]`, 'g');

/** Split `text` into its lines on the full terminator set. The array index of a line is one less
 * than the line number `lineOfIndex` reports for any offset inside it — that pairing is the whole
 * reason both live here. */
export function splitLines(text) {
  return text.split(LINE_TERMINATOR_RE);
}

/** 1-based line number of `index` within `text`, counting the full terminator set.
 *
 * Safe to call with an index into a BLANKED copy of `text`: the blankers below are length- AND
 * terminator-preserving, so offsets and line numbers are interchangeable between a source and its
 * blanked forms. `gate-lib.test.mjs` asserts that invariant directly rather than assuming it.
 *
 * ⚠️ ONE OFFSET IS NOT INSIDE ANY LINE: the `\n` of a CRLF pair. Slicing there ends the prefix on a
 * bare `\r`, which `splitLines` counts as a whole terminator, so `lineOfIndex('a\r\nb', 2)` reports
 * 2 while the full text puts index 2 in line 1's terminator. Not reachable from this repo — every
 * caller passes a regex MATCH index and no pattern here can start on a terminator — but the pairing
 * is stated as holding for *any* offset, and at that one offset it does not. */
export function lineOfIndex(text, index) {
  return splitLines(text.slice(0, index)).length;
}

// ── The blanker family ────────────────────────────────────────────────────────────────────────

/** Replace every non-terminator character of `m` with a space. Length-preserving by construction,
 * and it leaves CR / LF / U+2028 / U+2029 exactly where they were. */
const blankRun = (m) => m.replace(NON_TERMINATOR_G, ' ');

/**
 * String and template literals. `'`/`"` are terminator-bounded (an unescaped line terminator
 * cannot appear in one); backticks span lines, so their pattern excludes nothing but the escape
 * and the closing delimiter.
 */
const STRING_G = new RegExp(
  [
    '`(?:\\\\.|[^\\\\`])*`',
    `'(?:\\\\.|[^\\\\'${TERMINATORS}])*'`,
    `"(?:\\\\.|[^\\\\"${TERMINATORS}])*"`,
  ].join('|'),
  'g'
);

const BLOCK_COMMENT_G = /\/\*[\s\S]*?\*\//g;

/**
 * Line comments. ⚠️ The pattern must stop at ANY terminator, not just `\n`.
 *
 * This is the sink a grep for the `[^\n]` shape MISSES. It was written as a `' '.repeat(m.length)`
 * replacement over a `[^\n]`-bodied line-comment pattern, so widening the *replacement* character
 * class fixed nothing — the MATCH itself swallowed a `\r` or U+2028 sitting inside the comment,
 * and the blank run then erased it. Stopping at every terminator is also what JS does: a line
 * comment ends at U+2028, not only at `\n`.
 */
const LINE_COMMENT_G = new RegExp(`//[^${TERMINATORS}]*`, 'g');

/**
 * Blank the CONTENTS of string and template literals, keeping the delimiters. Comments are left
 * alone — this is the view the escape-hatch marker test reads, so that a marker written in a
 * comment still exists while one merely spelled inside a string literal does not.
 *
 * Length- and terminator-preserving, so line numbers computed over the original are valid here.
 *
 * ⚠️ ═══ THE RESIDUAL THAT GOVERNS THIS WHOLE FAMILY, STATED AS A CATEGORY ═══
 *
 * These are three independent regex passes over the whole file, so **the family cannot tell a
 * delimiter from a character that merely looks like one**. Anything whose delimiters this shape
 * does not track opens a run that blanks REAL CODE until it happens to close:
 *
 *   - a backtick in a doc comment (markdown code spans — the common one in this repo);
 *   - an apostrophe in a comment (`don't`) pairing with a quote in the code beside it;
 *   - a `//` inside a REGEX LITERAL (`/[//]/`) — telling a regex from a division needs a parser;
 *   - a nested template inside `${…}`, which the backtick alternative does not track;
 *   - an unterminated block comment, which is not blanked at all;
 *   - a line-continuation inside a string, which breaks quote pairing.
 *
 * Do NOT read that list as the closed set — an enumeration of what a scan misses ages exactly as
 * badly as one of what it catches (`gates-scanners.md`). The CATEGORY is the claim: an unbalanced
 * delimiter anywhere, in code or in prose, can blank arbitrary code below it.
 *
 * ⚠️ AND THE DIRECTION IS NOT ONE DIRECTION. An earlier draft of this note said the failure is "a
 * false POSITIVE, not a suppression". That is true for ONE of the two consumers and false for the
 * other, which is the more dangerous half:
 *
 *   - `blankStrings` feeds the MARKER view → a blanked line loses its comment opener, so a
 *     legitimate carve-out stops being recognised. False positive; the gate reds a correct tree.
 *   - `blankCommentsAndStrings` feeds the RULES → blanked code is code the rules never see.
 *     **Fail-open, and silent: the gate reports OK.**
 *
 * MEASURED on this tree at Story 35.4 Step G: **2,494 lines of real code across 49 of 386 scanned
 * files** are blanked before `findGatingAntiPattern`/`findRawDbQueryCalls` ever read them —
 * `useAudioPlayerEngine.tsx` loses 1,200 of its 1,312 code lines (91%), and a genuine
 * `db.queryOnce(` inserted into that dead region is reported ZERO times. This behaviour predates
 * the 35.4 consolidation (the same regexes shipped in `lint-layers.mjs`); what 35.4 added was this
 * docblock, which described it as a bounded false positive.
 *
 * ⚠️ DO NOT "FIX" THIS BY WIDENING A PATTERN. `gates-scanners.md` § *a gate that scans SOURCE TEXT
 * is re-openable by definition* — the same rule was defeated twice by nothing but the repo's own
 * formatter. The fix is a single left-to-right pass that tracks lexer state (string / template /
 * interpolation / block / line / regex), which is **Story 35.10** and carries this measurement as
 * its warm start. It also owns `lint-layers.mjs`'s `stripComments`, a fourth copy of this same
 * comment/string handling that blanks block comments from RAW source with no string pass at all.
 */
export function blankStrings(code) {
  return code.replace(STRING_G, (m) => m[0] + blankRun(m.slice(1, -1)) + m[m.length - 1]);
}

/**
 * Blank comments AND string/template contents, so a `//` or an identifier inside a literal cannot
 * create a false match and a commented-out call is not mistaken for a live one. This is the view
 * the RULES read.
 *
 * Strings are blanked first so a `//` inside a string is gone before the comment passes run (a
 * `://` in a URL is the routine case). Length- and terminator-preserving, like `blankStrings`.
 *
 * ⚠️ THIS FAMILY IS A LEXICAL APPROXIMATION, NOT A PARSER, AND ITS ERROR IS A SILENT FAIL-OPEN
 * — MEASURED, NOT HYPOTHETICAL. See the shared residual note above `blankStrings` and Story 35.10.
 */
export function blankCommentsAndStrings(code) {
  let out = blankStrings(code);
  out = out.replace(BLOCK_COMMENT_G, blankRun);
  out = out.replace(LINE_COMMENT_G, blankRun);
  return out;
}

// ── The escape-hatch marker ───────────────────────────────────────────────────────────────────

const MARKER_RES = new Map();
const markerRe = (token) => {
  let re = MARKER_RES.get(token);
  if (!re) {
    re = new RegExp(`^\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
    MARKER_RES.set(token, re);
  }
  return re;
};

/** The line's first comment opener: `//`, `/*`, a block-comment `*` continuation, or a JSX `{/*`.
 * The JSX form is listed because `{/* … *\/}` is the only way to write a comment between JSX
 * children — excluding it made the documented block form inert in exactly the files that need it. */
const COMMENT_OPENER_RE = /(?:\/\/|\/\*|^\s*\*(?!\/)|\{\s*\/\*)/;

/**
 * True if `line` CARRIES the escape-hatch marker `token`, as opposed to merely MENTIONING it.
 *
 * The marker must sit at the head of the line's FIRST comment opener and carry its `:` reason
 * separator. Two failures this shape closes, in opposite directions:
 *
 *   - **Fail-open.** A bare `/token/` over the line makes the off switch something a developer can
 *     type by accident, in prose: a docblock explaining the convention silently carves out
 *     whatever sits beneath it, and the codebase documenting its own gate most carefully is the
 *     one most likely to contain that sentence. Requiring the `:` also makes the reason mandatory,
 *     so the "per-site deliberate decision" the hatch is documented to be is enforced.
 *   - **Fail-closed-on-correct-code.** Taking the line's first `//` from the RAW text finds one
 *     inside a string literal, so a legitimate carve-out written beside a URL
 *     (`const D = 'https://x'; // token: reason`) was not recognised and the gate reddened a
 *     correct tree.
 *
 * ⚠️ **Pass a STRINGS-BLANKED line** (`splitLines(blankStrings(code))`), not the raw source line.
 * That is what closes both directions at once, and it is why the fix is a blanker rather than a
 * wider pattern: the marker question is answerable from a VALUE, and a rule that scans raw source
 * text is re-openable by definition. Passing raw text still works for the common case and
 * re-opens the string-literal fail-open, so every caller in this repo passes the blanked view.
 *
 * DELIBERATELY NOT MATCHED, and this is a rule rather than a residual: a marker that follows other
 * prose inside the same comment (`// see https://x — token: reason`). The head anchor is the whole
 * mechanism that stops prose from switching the gate off.
 *
 * RESIDUALS: see the category note on `blankStrings` above — an unbalanced delimiter anywhere
 * above this line (a backtick or an apostrophe in a comment, a `//` in a regex literal, a nested
 * `${` template) can blank the comment opener this test looks for. On THIS view the direction is a
 * false positive: a real carve-out is not recognised and the gate reds a correct tree. On the
 * sibling `blankCommentsAndStrings` view the same runs are a silent fail-open, which is why the
 * category is documented once, there.
 */
export function isMarkerLine(line, token) {
  if (typeof token !== 'string' || token === '') {
    throw new TypeError(
      `gate-lib isMarkerLine: token must be a non-empty string, got ${typeof token}`
    );
  }
  const text = line ?? '';
  const opener = COMMENT_OPENER_RE.exec(text);
  if (!opener) return false;
  return markerRe(token).test(text.slice(opener.index + opener[0].length));
}

// ── The entrypoint check ──────────────────────────────────────────────────────────────────────

/** The URL's pathname with runs of `/` collapsed, or `''` when it will not parse — used only by
 * `isMainModule`'s argument check below, so an unparseable value takes the same (throwing) branch as
 * a root-only one.
 *
 * ⚠️ THE COLLAPSE IS THE RULE, AND IT IS WHY THIS IS NOT A LIST OF BAD SPELLINGS. `file:` and
 * `file://` were closed first, by example; `file:////` then walked straight through, because its
 * pathname is `//` — length 2, so a bare `> 1` test passes — while `fileURLToPath` yields `//`,
 * which realpaths to `/` and compares false. That is the silent `false` reaching NEITHER door, i.e.
 * the exact defect the guard was added to prevent, re-entered one slash over. Collapsing first makes
 * every run of separators answer as the single separator it resolves to, so the whole family
 * (`file:///`, `file:////`, `file://///`, …) is closed by shape rather than one member at a time.
 *
 * Declared ABOVE `isMainModule`'s docblock on purpose: sitting between that docblock and the
 * function detached the `onUnknown` contract from the function it documents, so tooling (and anyone
 * hovering) attached the story's most safety-critical `@param` block to this two-line helper. */
const pathOf = (url) => {
  try {
    return new URL(url).pathname.replace(/\/{2,}/g, '/');
  } catch {
    return '';
  }
};

/**
 * "Am I the process entrypoint?" — comparing REALPATHS, because Node realpaths the ESM entry
 * before setting `import.meta.url` while `resolve()` is purely lexical. Reached through a
 * symlinked path (a CI checkout, a git worktree, a symlinked build dir) the lexical form is false,
 * `main()` never runs, and the process exits 0 with no output.
 *
 * ⚠️ **`onUnknown` is REQUIRED and it governs BOTH unknown-answer doors** — the absent
 * `process.argv[1]` (`node -e`, `--import`, a piped stdin) and the `realpathSync` failure. It has
 * no default, deliberately: the safe direction is a per-script judgement, not a house constant,
 * and a default is exactly what lets the next copy inherit the wrong one silently.
 *
 *   - `'run'` — for an offline lint gate. The unsafe outcome is skipping SILENTLY: a gate whose
 *     entire contract is failing closed instead reports success having checked nothing. Warn
 *     loudly and run.
 *   - `'skip'` — for a script whose run has a cost. The worked example was `perms-verify.mjs`: it
 *     decrypted a production admin token and made one authenticated request with it, so RUNNING was
 *     the unsafe outcome and merely importing the module for its exports must never fire that
 *     request. Warn and refuse. story 5-2 deleted that script with its vendor, so this direction
 *     currently has NO caller — it stays because the safe direction is a per-script judgement, and
 *     story 5-5's Better Auth secret work is the next plausible one.
 *
 * The two doors previously answered oppositely inside the same function in all five gates
 * (`if (!argv) return false` above a `catch { return true }` eight lines below), which is the
 * silent `exit 0` the realpath comparison exists to close, reached without a symlink.
 *
 * @param {object} o
 * @param {string} o.url    the caller's `import.meta.url`
 * @param {'run'|'skip'} o.onUnknown  what an unanswerable question means for THIS script
 * @param {string} o.label  operator-facing prefix (`lint:layers`, `lint:i18n`) — a shared helper
 *                          with one hardcoded wording would make a credential-bearing script
 *                          announce itself as a lint gate
 * @param {string} [o.hint] appended to the `'skip'` message: how to run it properly
 */
export function isMainModule({ url, onUnknown, label, hint }) {
  if (onUnknown !== 'run' && onUnknown !== 'skip') {
    throw new TypeError(
      `gate-lib isMainModule: onUnknown must be 'run' or 'skip', got ${JSON.stringify(onUnknown)}. ` +
        "It has no default because the safe direction differs per script — see this function's docblock."
    );
  }
  // ⚠️ `file://` + a REAL path, not a `file:` PREFIX test, and the path is measured AFTER
  // `pathOf` collapses runs of `/`. Every root-only spelling — `'file:'`, `'file://'`, `'file:///'`,
  // `'file:////'`, any longer run — resolves to `'/'`, which realpaths fine, compares false, and
  // returns a SILENT `false` without reaching either unknown-answer door: precisely the quiet skip
  // this function exists to make impossible, arriving through the argument validation itself. The
  // first three were closed by enumerating them and `file:////` walked through the next round; the
  // collapse is what makes it a rule instead of a list. A real `import.meta.url` always carries at
  // least one path segment.
  if (typeof url !== 'string' || !url.startsWith('file://') || pathOf(url).length <= 1) {
    throw new TypeError(
      `gate-lib isMainModule: url must be a file:// URL with a path (pass import.meta.url), got ${url}`
    );
  }
  if (typeof label !== 'string' || label === '') {
    throw new TypeError(
      `gate-lib isMainModule: label must be a non-empty string, got ${typeof label}`
    );
  }

  const unknown = (reason) => {
    const tail = onUnknown === 'run' ? 'running anyway.' : `NOT running.${hint ? ` ${hint}` : ''}`;
    console.error(`${label}: could not resolve the entrypoint (${reason}); ${tail}`);
    return onUnknown === 'run';
  };

  const argv = process.argv[1];
  if (!argv) {
    return unknown('process.argv[1] is not set — `node -e`, `node --import`, or a piped stdin');
  }
  try {
    return realpathSync(argv) === realpathSync(fileURLToPath(url));
  } catch (err) {
    return unknown(err?.message ?? String(err));
  }
}
