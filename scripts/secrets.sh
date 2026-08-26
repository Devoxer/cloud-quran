#!/usr/bin/env sh
# Cloud Quran secrets — single SOPS+age store (inherited from wisdom-fruits' Story 22.15).
#
# SECURITY: no path ever echoes a decrypted value. Decryption output goes only to a
# 600-mode temp (shredded on exit) or straight to the gitignored consumer files, then
# is fed to the consumer (wrangler / eas) or copied into place. Only key NAMES +
# filenames are ever printed.
#
# ROBUSTNESS: POSIX sh has NO `pipefail`, so a failed `sops -d` inside a pipe would be
# masked by the downstream command's exit status — silently pushing an empty payload,
# or (worse) truncating a live consumer file before the decrypt even fails. So every
# path decrypts on its OWN line (set -e sees sops's status) into a temp, and push:local
# copies temp→dest only AFTER a clean decrypt, so a failure can never clobber a live
# `.dev.vars` / `.env.local`.
#
# macOS gotcha: sops's default age-key lookup is os.UserConfigDir() =
# ~/Library/Application Support/sops/age/keys.txt, NOT the XDG ~/.config path.
# So we set SOPS_AGE_KEY_FILE explicitly to the conventional path the key lives at.
set -eu

command -v sops >/dev/null 2>&1 || { echo "✗ sops not installed — 'brew install sops age'" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# sops opens $EDITOR, and with it unset falls back to **vim** — which strands anyone who has
# not used vim inside a modal editor with no visible way out (`Esc` then `:q!`). Respect an
# explicit choice, otherwise prefer something with obvious exit affordances.
#   ⚠️ `code` MUST have --wait: without it the command returns instantly and sops re-encrypts
#   the file before you have typed anything.
if [ -z "${EDITOR:-}" ] && [ -z "${VISUAL:-}" ]; then
  if command -v code >/dev/null 2>&1; then EDITOR="code --wait"
  elif command -v nano >/dev/null 2>&1; then EDITOR="nano"
  fi
  export EDITOR
fi
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
# Fail early + clearly if the private key is missing (every command here decrypts).
# Honoring an inherited SOPS_AGE_KEY_FILE that points nowhere otherwise surfaces as a
# cryptic `Failed to get the data key` deep inside sops.
[ -f "$SOPS_AGE_KEY_FILE" ] || { echo "✗ age key not found at $SOPS_AGE_KEY_FILE — restore it from Apple Passwords/offline copy, or set SOPS_AGE_KEY_FILE" >&2; exit 1; }

# The worker store EXISTS as of story 5-5 and HOLDS LIVE CREDENTIALS (this line said "every value
# in it is empty on purpose" until the code review — it was true for about a day). Before 5-5 the worker read only wrangler BINDINGS (D1, later R2 — bindings are not
# secrets) plus a dev-only `DEV_AUTH_SECRET` that had to stay out of production, so there was
# nothing here worth pushing. Better Auth changed that: `BETTER_AUTH_SECRET` signs every real
# session, and it is the one key on this repo's whole surface that a leak would actually hurt.
# It is still declared in NO env block of `wrangler.toml` (`apps/worker/src/lib/identity.test.ts`
# asserts that absence) — this store and `wrangler secret` are how it reaches the live worker.
WORKER_FILE="$ROOT/apps/worker/secrets.sops.yaml"
EXPO_FILE="$ROOT/apps/expo/secrets.sops.yaml"
# NOTE: `tools/content-pipeline` does not exist in Cloud Quran — wisdom-fruits' pipeline was
# not inherited (this repo's build-time data pipeline lives in scripts/ and needs no secrets).
# The path is kept so `secrets:edit content-pipeline` fails with a clear missing-file error
# rather than an unknown-app one, should anyone reach for it.
PIPELINE_FILE="$ROOT/tools/content-pipeline/secrets.sops.yaml"

# Decrypt $1 → clean dotenv into the 600-mode temp $2: `KEY=value` lines with a
# NON-empty value only (plaintext `#` comments, blanks, AND any half-filled `KEY=`
# stripped — so we never push/write an empty string over a live secret). sops runs as
# its OWN command so `set -e` aborts on its failure (no pipefail in sh) BEFORE any
# consumer sees a partial payload. The plaintext lives only transiently in the `_plain`
# shell var (in memory, never printed) and in $2. The `|| true` keeps a zero-match grep
# from tripping `set -e` ahead of the explicit emptiness check.
decrypt_to() {
  _plain="$(sops -d --output-type dotenv "$1")" \
    || { echo "✗ decrypt failed: $1 (is the age key at $SOPS_AGE_KEY_FILE?)" >&2; exit 1; }
  printf '%s\n' "$_plain" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=.' > "$2" || true
  [ -s "$2" ] || { echo "✗ no non-empty KEY=value lines decrypted from $1" >&2; exit 1; }
}

# Same as decrypt_to, but distinguishes "decrypted fine, nothing populated YET" (return 2)
# from "decrypt FAILED" (still a hard exit). Cloud Quran ships stores that are deliberately
# empty until the story that owns them runs, and an empty store must not abort its siblings'
# push — while a genuine decrypt failure still must. Conflating the two is what made
# `push:local` unusable: one empty store took the whole command down, and the error
# ("no non-empty KEY=value lines") reads like a broken age key.
decrypt_to_soft() {
  _plain="$(sops -d --output-type dotenv "$1")" \
    || { echo "✗ decrypt failed: $1 (is the age key at $SOPS_AGE_KEY_FILE?)" >&2; exit 1; }
  printf '%s\n' "$_plain" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=.' > "$2" || true
  [ -s "$2" ] || return 2
  return 0
}

app_file() {
  case "$1" in
    worker) echo "$WORKER_FILE" ;;
    expo) echo "$EXPO_FILE" ;;
    content-pipeline | pipeline) echo "$PIPELINE_FILE" ;;
    *) echo "unknown app: '$1' (expected: worker | expo | content-pipeline)" >&2; exit 1 ;;
  esac
}

cmd="${1:-}"
[ "$#" -gt 0 ] && shift || true

case "$cmd" in
  edit)
    f="$(app_file "${1:?usage: secrets.sh edit <worker|expo|content-pipeline>}")"
    exec sops "$f"
    ;;
  push:worker)
    # Decrypt → wrangler secret bulk (reads dotenv from stdin). Run in apps/worker
    # for wrangler config context. pnpm exec (NOT pnpx — PATH/oclif gotcha).
    #
    # ⚠️ `--env production` IS LOAD-BEARING, and its absence is the SAME BUG the 5-4 review found
    # in `deploy`. wrangler.toml defines two environments; with no `--env`, `secret bulk` targets
    # the TOP-LEVEL name — `cloud-quran-api-dev` — which is a config block that must never be
    # deployed. Observed on 2026-08-25: it did not fail, it CREATED an empty Worker by that name
    # and put four real production secrets on it, while the deployed `cloud-quran-api` was left
    # with none and 500'd on every identity-resolving request. Silent in both directions.
    tmp="$(mktemp)"; chmod 600 "$tmp"; trap 'rm -f "$tmp"' EXIT INT TERM HUP
    decrypt_to "$WORKER_FILE" "$tmp"
    ( cd "$ROOT/apps/worker" && pnpm exec wrangler secret bulk --env production < "$tmp" )
    echo "✓ pushed worker secrets to Cloudflare"
    ;;
  push:expo)
    # ONLY EXPO_PUBLIC_* go to EAS (the app's client config). Non-public keys in the
    # expo file are local-dev-only — never pushed to a build env. (As of story 5-2 the expo
    # store holds ONLY EXPO_PUBLIC_* keys: the one non-public key it ever had was InstantDB's
    # admin token, and InstantDB is gone.)
    # prod + preview get the SAME file; `eas env:push --force` is an idempotent upsert
    # (it does NOT delete EAS vars absent from the file), so if `preview` ever fails
    # after `production`, re-running secrets:push:expo re-syncs both.
    command -v eas >/dev/null 2>&1 || { echo "✗ eas not installed — 'npm i -g eas-cli'" >&2; exit 1; }
    full="$(mktemp)"; pub="$(mktemp)"; chmod 600 "$full" "$pub"
    trap 'rm -f "$full" "$pub"' EXIT INT TERM HUP
    decrypt_to "$EXPO_FILE" "$full"
    grep -E '^EXPO_PUBLIC_' "$full" > "$pub" || true
    [ -s "$pub" ] || { echo "✗ no EXPO_PUBLIC_* keys in $EXPO_FILE — nothing to push to EAS" >&2; exit 1; }
    ( cd "$ROOT/apps/expo" \
        && eas env:push production --path "$pub" --force \
        && eas env:push preview --path "$pub" --force )
    echo "✓ pushed expo EXPO_PUBLIC_* env to EAS (production + preview)"
    ;;
  push:local)
    # Write the gitignored local consumer files (values go straight to disk, never stdout).
    # EVERY store decrypts to its own 600 temp FIRST; only once every decrypt is clean do we
    # `cp` into place — so a failure leaves ALL live consumer files untouched (no split-brain
    # of fresh+stale, no truncation). That ordering is the point; keep it.
    #
    # A store that decrypts cleanly but holds no populated values is SKIPPED, not fatal — see
    # decrypt_to_soft. ⚠️ BOTH STORES ARE POPULATED NOW, so neither is skipped and BOTH consumer
    # files are overwritten: anything kept only locally (a dev BETTER_AUTH_SECRET, a localhost
    # ALLOWED_ORIGINS) has to be re-appended after every push. The skip exists for a store that
    # has never been filled in, which is no longer either of these.
    #
    # tools/content-pipeline is NOT handled here: it does not exist in this repo (wisdom-fruits'
    # pipeline was not inherited), and decrypting a missing file is a hard error, not a skip.
    tw="$(mktemp)"; te="$(mktemp)"; chmod 600 "$tw" "$te"
    trap 'rm -f "$tw" "$te"' EXIT INT TERM HUP
    if [ -f "$WORKER_FILE" ]; then _w=0; decrypt_to_soft "$WORKER_FILE" "$tw" || _w=$?; else _w=3; fi
    _e=0; decrypt_to_soft "$EXPO_FILE" "$te" || _e=$?
    _wrote=""
    [ "$_w" -eq 0 ] && { cp "$tw" "$ROOT/apps/worker/.dev.vars"; _wrote="$_wrote apps/worker/.dev.vars"; }
    [ "$_e" -eq 0 ] && { cp "$te" "$ROOT/apps/expo/.env.local"; _wrote="$_wrote apps/expo/.env.local"; }
    [ "$_w" -eq 2 ] && echo "• skipped apps/worker/.dev.vars — the worker store has no values yet"
    [ "$_w" -eq 3 ] && echo "• skipped apps/worker/.dev.vars — the worker secrets store is missing (restore apps/worker/secrets.sops.yaml)"
    [ "$_e" -eq 2 ] && echo "• skipped apps/expo/.env.local — the expo store has no values yet"
    [ -n "$_wrote" ] && echo "✓ wrote$_wrote (gitignored)" || echo "• nothing to write — both stores are empty; fill one with 'pnpm secrets:edit <app>'"
    ;;
  *)
    echo "usage: secrets.sh <edit <app> | push:worker | push:expo | push:local>" >&2
    exit 1
    ;;
esac
