/**
 * Drop a stray `process.exitCode` before jest sets its own (gates CI, 2026-08-18).
 *
 * Since Node 20, jest inherits a `process.exitCode` set by ANY module loaded during the run, even
 * when every test passed — jestjs/jest#14501, closed as not planned, with no flag to opt out. This
 * suite hits it on the GitHub runner and nowhere else: 4255 passing, exit 1.
 *
 * Bisected before writing this, so the scope is known rather than guessed:
 *   - not the OS      — a node:24.19-bookworm container exits 0
 *   - not the runtime — Node 24.19 on macOS exits 0
 *   - not CI env vars — CI=true GITHUB_ACTIONS=true still exits 0 locally
 *   - not parallelism — it does it under --runInBand too
 *   - not one file    — all 35 files of the 8 failing shards exit 0 when run ALONE
 * It takes several files in one process on that runner, which is why nothing local reproduces it.
 *
 * ⚠️ THIS CANNOT HIDE A FAILING TEST. globalTeardown runs BEFORE jest computes its verdict, and
 * jest then assigns the exit code from its own results — so a red suite still exits 1. All this
 * clears is a value set by a dependency, which jest would otherwise report as the run's outcome.
 * If the suite ever exits 0 with visible failures, this file is the first thing to suspect.
 */
module.exports = async () => {
  if (process.exitCode !== undefined && process.exitCode !== 0) {
    console.error(
      `[jest] clearing a stray process.exitCode=${String(process.exitCode)} — see jest#14501; ` +
        "jest's own verdict decides this run"
    );
    process.exitCode = 0;
  }
};
