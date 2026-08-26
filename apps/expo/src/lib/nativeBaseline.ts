/**
 * Baseline native-module wrappers that ship in every clone but have no UI
 * consumer yet (Story 17.9). Re-exported here so that:
 *   (a) there is a single import site when a feature finally needs them, and
 *   (b) the wrappers (and their expo-* imports) stay in the JS bundle graph —
 *       a present-but-unwired wrapper would otherwise simply never be imported.
 * The native side autolinks regardless via `package.json`.
 *
 * Imported once for its side effect in the root `_layout.tsx`. When a feature
 * lands, import the namespace instead, e.g.:
 *   import { clipboard } from '@/lib/nativeBaseline';
 *   await clipboard.setString('…');
 */

export * as clipboard from './clipboard';
export * as secureStore from './secureStore';
export * as sharing from './sharing';
