/**
 * Library home constants
 * Story 23.15: Library + Notes browse visual polish
 *
 * Shared low cap for the Library home's vertical content/management previews.
 * Lives in `constants/` (not a feature barrel) so BOTH `features/notes`
 * (MyNotesSection) and `features/library` (OfflineSection) can import it
 * without a feature→feature dependency.
 */

/**
 * Max rows shown inline by each vertical content/management preview on the
 * Library home (My Notes, Offline). Above this, the section shows a "See All"
 * link to its dedicated full page. Kept low so the vertical sections read as a
 * cohesive stack rather than long lists.
 */
export const LIBRARY_PREVIEW_CAP = 3;
