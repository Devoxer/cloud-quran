/**
 * Instrumentation for jest's MAIN process (Story: gates CI, 2026-08-18).
 *
 * The suite prints "277 suites passed, 4255 tests passed, 0 failed" and then exits 1 on Linux/CI,
 * with no failing test, no open handle and — as far as the workers can see — no unhandled
 * rejection. That last part was the misdiagnosis: `setupFiles` run INSIDE each test environment, so
 * a listener there watches a worker, never the parent that owns the exit code. `globalSetup` runs in
 * the main process, which is the only place a fatal-but-silent event can be observed.
 *
 * Everything here only reports. Nothing is swallowed and no exit code is changed — the goal is that
 * a red run says WHY instead of dying mute.
 */
module.exports = async () => {
  process.on('unhandledRejection', (reason) => {
    const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    console.error(`\n[jest/main] UNHANDLED REJECTION:\n${detail}\n`);
  });

  process.on('uncaughtException', (error) => {
    console.error(`\n[jest/main] UNCAUGHT EXCEPTION:\n${error.stack ?? error.message}\n`);
  });

  process.on('exit', (code) => {
    // `process.exitCode` set by anything in the run overrides jest's verdict silently; printing
    // both is what distinguishes "jest failed" from "something else decided the exit code".
    console.error(`[jest/main] exiting: code=${code} process.exitCode=${String(process.exitCode)}`);
  });
};
