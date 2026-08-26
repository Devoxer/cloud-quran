/**
 * contentUrl — build the public edge URL for a born-correct content object (Story 32.10).
 *
 * The `contentObjects` row holds only the opaque random `r2Key`; the client assembles
 * `${config.content.baseUrl}/${r2Key}` and fetches it DIRECT from the public `wisdom-fruits-content`
 * bucket — no worker hop. Sized for reuse by Story 32.5 (free audio/text/blocks), not just quiz
 * pools, so both paths share ONE URL builder + content-base env (no fork).
 *
 * The base (`EXPO_PUBLIC_CONTENT_URL`) comes alive at the 32.3 public flip; until then it may be
 * empty/non-resolving, so a fetch simply fails and surfaces as the caller's normal error/empty
 * state (the quiz is dark by design pre-32.3 — accepted, no live quiz / no users).
 */
import { config } from './config';

export function contentUrl(r2Key: string): string {
  const base = config.content.baseUrl.replace(/\/$/, '');
  return `${base}/${r2Key}`;
}
