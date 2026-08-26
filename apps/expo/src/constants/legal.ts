/**
 * Legal page URLs - shared across Profile and Subscription screens
 */
// ⚠️ Story 5-1 review: these pointed at wisdomfruits.com and nothing imports this file — the
// trap being the next screen that wires up a module which looks already-configured. The domain
// below is Cloud Quran's own and is NOT live yet; the marketing site (apps/marketing) publishes
// these pages. `refund` is retained only for shape — Cloud Quran is free and waqf-funded, so
// there is nothing to refund; delete it when a settings screen actually renders this list.
export const LEGAL_URLS = {
  privacy: 'https://cloudquran.app/privacy',
  terms: 'https://cloudquran.app/terms',
  refund: 'https://cloudquran.app/refund',
  contact: 'https://cloudquran.app/contact',
} as const;
