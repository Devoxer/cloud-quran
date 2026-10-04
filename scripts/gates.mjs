#!/usr/bin/env node
/**
 * `pnpm gates` — every check the project ships behind, run LOCALLY (2026-10-04, owner's call: no
 * gates online). Same runner as `pnpm lint`: each check runs whatever the others did, and the run
 * fails at the end naming every check that failed. `pnpm mirror:publish` runs this before it
 * publishes anything.
 */
import { pathToFileURL } from 'node:url';

import { runAll } from './lint-all.mjs';

export const CHECKS = [
  ['lockfile', 'pnpm install --frozen-lockfile --offline --silent'],
  ['lint', 'pnpm lint'],
  ['typecheck', 'pnpm typecheck'],
  ['verify', 'pnpm verify'],
  ['test', 'pnpm test'],
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failed = runAll(CHECKS);
  if (failed.length > 0) {
    console.error(`\n✗ ${failed.length} of ${CHECKS.length} gates failed: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n✓ all ${CHECKS.length} gates passed`);
}
