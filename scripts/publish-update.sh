#!/usr/bin/env bash
# Publish a JavaScript update to installed apps through EAS Update — no store review.
#
#   pnpm update:publish preview "short message"      # internal preview builds first
#   pnpm update:publish production "short message"   # then the store builds
#
# WHICH BUILDS IT REACHES: `runtimeVersion.policy` is `appVersion`, so an update reaches only the
# installed builds whose app version equals `apps/expo/app.json`'s `version` AND whose build profile
# set this channel (`eas.json`). A native change — a new or upgraded native module, a config
# plugin, app.json native keys, a patched native package (`patches/`) — is a STORE BUILD, never an
# update: JS that expects native code the binary lacks crashes on launch. Bump `version` with it.
#
# WHEN IT APPLIES: expo-updates' defaults — the app checks on launch, keeps running the bundle it
# started with, downloads in the background, and runs the new one on the NEXT cold start.
#
# ROLL BACK: `eas update:republish --group <previous group id>` on the same channel, or
# `eas update:roll-back-to-embedded`. List groups with `eas update:list --branch <channel>`.
#
# Needs EXPO_TOKEN in apps/expo/.env.local (`pnpm secrets:push:local`; the encrypted inventory holds
# it). Sourcemaps go to Sentry when a DSN is configured — and then SENTRY_AUTH_TOKEN is required,
# or that update's crash reports would be unreadable minified frames.
set -euo pipefail

channel="${1:-}"
message="${2:-}"
if [[ "$channel" != preview && "$channel" != production ]] || [[ -z "$message" ]]; then
  echo "usage: pnpm update:publish <preview|production> \"message\"" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/expo"

[[ -f .env.local ]] || { echo "✗ apps/expo/.env.local is missing — run pnpm secrets:push:local" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a
if command -v eas >/dev/null 2>&1; then eas=(eas); else eas=(npx -y eas-cli@latest); fi
if ! "${eas[@]}" whoami >/dev/null 2>&1; then
  echo "✗ no EAS login here — EXPO_TOKEN missing from apps/expo/.env.local (pnpm secrets:push:local)" >&2
  exit 1
fi
sentry=false
if [[ -n "${EXPO_PUBLIC_SENTRY_DSN:-}" ]]; then
  [[ -n "${SENTRY_AUTH_TOKEN:-}" ]] || {
    echo "✗ a Sentry DSN is configured but SENTRY_AUTH_TOKEN is not — this update's crashes would stay minified" >&2
    exit 1
  }
  sentry=true
fi
# An update must be exactly a commit, so a crash report maps to code that exists in git.
if ! git -C "$ROOT" diff --quiet HEAD --; then
  echo "✗ uncommitted changes — commit first; an update must be exactly a commit" >&2
  exit 1
fi

version="$(node -p "require('./app.json').expo.version")"
echo "Publishing $(git -C "$ROOT" rev-parse --short HEAD) to '$channel': reaches installed $channel builds of version $version."
rm -rf dist
"${eas[@]}" update --channel "$channel" --environment "$channel" --message "$message" --non-interactive
if $sentry; then
  pnpm exec sentry-expo-upload-sourcemaps dist
  echo "✓ published to '$channel' and uploaded its sourcemaps."
else
  echo "✓ published to '$channel' (no Sentry DSN configured, so no sourcemaps to upload)."
fi
