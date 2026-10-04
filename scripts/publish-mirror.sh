#!/usr/bin/env bash
# Publish the public GPL mirror (github.com/Devoxer/cloud-quran) from THIS machine.
#
#   pnpm mirror:publish            # gates, then publish HEAD
#   pnpm mirror:publish --dry-run  # gates, then show what would change; push nothing
#
# ⚠️ IT REPLACES `.github/workflows/sync-public.yml` (2026-10-04, owner's call: no gates online). The
# rules that workflow enforced are kept, now local:
#   • Only a VERIFIED commit: `pnpm gates` runs first, on a clean tree, at a HEAD already on
#     origin/main — the mirror never shows a commit the private repo does not have.
#   • Only TRACKED files: the tree is `git archive HEAD`, so ignored local files (.env.local,
#     node_modules, android/, ios/, dist/) cannot leak however this checkout is configured.
#   • Never BACKWARDS: every mirror commit carries `Source: <sha>`; a HEAD that does not descend from
#     the last published source is refused, or `rsync --delete` would roll the mirror back.
#   • The same EXCLUDES: agent instructions, private planning and secret inventories (`*.sops.yaml`
#     keeps key names in plaintext) never publish; `.env.example` files do.
set -euo pipefail

dry=false
[[ "${1:-}" == "--dry-run" ]] && dry=true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR_REPO="Devoxer/cloud-quran"
MIRROR_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/cloud-quran-mirror"
cd "$ROOT"

[[ "$(git rev-parse --abbrev-ref HEAD)" == main ]] || { echo "✗ publish from main" >&2; exit 1; }
git diff --quiet HEAD -- || { echo "✗ uncommitted changes — the mirror publishes a commit, not a tree" >&2; exit 1; }
git fetch --quiet origin main
sha="$(git rev-parse HEAD)"
[[ "$sha" == "$(git rev-parse origin/main)" ]] || { echo "✗ HEAD is not origin/main — push first" >&2; exit 1; }

echo "== gates (local) for ${sha:0:7}"
pnpm gates

if [[ -d "$MIRROR_DIR/.git" ]]; then
  git -C "$MIRROR_DIR" fetch --quiet origin && git -C "$MIRROR_DIR" reset --quiet --hard origin/HEAD
else
  gh repo clone "$MIRROR_REPO" "$MIRROR_DIR" -- --quiet
fi

source_sha="$(git -C "$MIRROR_DIR" log -50 --format=%B | sed -n 's/^Source: \([0-9a-f]\{40\}\)$/\1/p' | head -1)"
if [[ -n "$source_sha" ]]; then
  if [[ "$source_sha" == "$sha" ]]; then echo "✓ ${sha:0:7} is already published"; exit 0; fi
  if ! git merge-base --is-ancestor "$source_sha" "$sha" 2>/dev/null; then
    echo "✗ ${sha:0:7} does not descend from ${source_sha:0:7}, the last commit published — refusing to roll the mirror back" >&2
    exit 1
  fi
fi

tree="$(mktemp -d)"; trap 'rm -rf "$tree"' EXIT
git archive "$sha" | tar -x -C "$tree"
rsync -a --delete \
  --exclude='.git' --exclude='.github/workflows/' --exclude='.claude/' --exclude='.agents/' \
  --exclude='AGENTS.md' --exclude='_bmad/' --exclude='_bmad-output/' --exclude='_reference/' \
  --include='.env.example' --include='**/.env.example' --exclude='.env*' --exclude='*.local' \
  --exclude='.sops.yaml' --exclude='*.sops.yaml' \
  "$tree/" "$MIRROR_DIR/"
# A path an exclude protects is invisible to --delete on both sides, so anything that reached the
# mirror before its exclude existed is removed by name.
( cd "$MIRROR_DIR"
  rm -rf .claude/ .agents/ AGENTS.md _bmad/ _bmad-output/ _reference/ .github/workflows/
  find . -name .git -prune -o \( \( -name '.env*' ! -name '.env.example' \) -o -name '*.local' \
    -o -name '.sops.yaml' -o -name '*.sops.yaml' \) -print -exec rm -rf {} + )

git -C "$MIRROR_DIR" add -A
if git -C "$MIRROR_DIR" diff --cached --quiet; then echo "✓ nothing to publish"; exit 0; fi
git -C "$MIRROR_DIR" diff --cached --stat | tail -1
if $dry; then echo "(dry run — nothing pushed)"; git -C "$MIRROR_DIR" reset --quiet --hard; exit 0; fi
git -C "$MIRROR_DIR" commit --quiet -m "sync: $(git log -1 --format=%s "$sha")" -m "Source: $sha"
git -C "$MIRROR_DIR" push --quiet origin HEAD
echo "✓ published ${sha:0:7} to $MIRROR_REPO"
