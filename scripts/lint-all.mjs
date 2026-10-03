#!/usr/bin/env node
/**
 * `pnpm lint` — run EVERY lint gate, then fail if any failed.
 *
 * ⚠️ IT WAS AN `&&` CHAIN, AND THE FIRST FAILURE HID THE REST. A formatting error in `biome check`
 * stopped the run before the six project gates ever ran, so a red lint said nothing about layers,
 * style, i18n, native patches, header controls or mushaf glyphs (seen 2026-08-28: one format error
 * masked five clean gates; a real violation behind it would have been just as invisible).
 * `gates.yml` already gives every step `!cancelled()` for the same reason — this is that, locally.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const GATES = [
  ['biome', 'pnpm exec biome check .'],
  ['layers', 'pnpm lint:layers'],
  ['style', 'pnpm lint:style'],
  ['i18n', 'pnpm lint:i18n'],
  ['native-patches', 'pnpm lint:native-patches'],
  ['header-controls', 'pnpm lint:header-controls'],
  ['mushaf-glyphs', 'pnpm lint:mushaf-glyphs'],
];

/** Run each gate in order regardless of the others; answer the names of the ones that failed. */
export function runAll(
  gates,
  run = (command) => spawnSync(command, { shell: true, stdio: 'inherit' }).status
) {
  const failed = [];
  for (const [name, command] of gates) {
    if (run(command) !== 0) failed.push(name);
  }
  return failed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failed = runAll(GATES);
  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length} of ${GATES.length} lint gates failed: ${failed.join(', ')}`
    );
    process.exit(1);
  }
  console.log(`\n✓ all ${GATES.length} lint gates passed`);
}
