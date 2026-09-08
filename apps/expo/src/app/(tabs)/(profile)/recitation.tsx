/**
 * Recitation — the reciter picker's route (story 7-2).
 *
 * Thin by design: the screen is `features/audio`'s `ReciterPicker`, and the header comes from
 * the `(profile)` layout's `TITLE_KEYS` (`titles.recitation`). A leaf with no entry there
 * silently renders the Account title, which is why the key is added in the same change.
 */

import { ReciterPicker } from '@/features/audio';

export default function RecitationScreen() {
  return <ReciterPicker />;
}
