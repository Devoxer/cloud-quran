/**
 * Dialog — barrel + TS-resolved entry for the platform-split confirm/alert
 * primitive (Story 17.4 §A, AC 3).
 *
 * Metro resolves `@/components/ui/Dialog` to the per-platform file
 * (`index.ios.tsx` / `index.android.tsx` / `index.web.tsx`). TypeScript and any
 * platform without a specific file resolve to THIS file, which re-exports the
 * web implementation as the safe default. The shared `DialogProps` contract
 * lives in `./types`.
 */

export { Dialog } from './index.web';
export type { DialogAction, DialogActionRole, DialogProps } from './types';
