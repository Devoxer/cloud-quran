/**
 * playerRoute — the launch marker's builder + predicate.
 *
 * This module exists so the launchers and the player cannot disagree about what a launch
 * is; these tests pin the round trip (build → read back) and, most importantly, WHICH
 * launchers mark. The bug this fix addresses came from a discriminator that was inferred
 * rather than stated, so "the feed launcher must not mark" is the load-bearing case.
 */

import { isPlayerLaunch, playerRoute } from './playerRoute';

describe('playerRoute', () => {
  it('round-trips a marked launch: what the launcher builds, the player reads back', () => {
    const href = playerRoute({ bookId: 'book-7', sectionType: 'keyTakeaways', launch: true });
    expect(href).toContain('bookId=book-7');
    expect(href).toContain('section=keyTakeaways');
    // Parse it the way expo-router hands params to the screen.
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(isPlayerLaunch(params)).toBe(true);
  });

  it('an UNMARKED open is not a launch — the feed launcher and the Play button build these', () => {
    const href = playerRoute({ bookId: 'book-7', sectionType: 'summaryBrief' });
    expect(href).not.toContain('launch');
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(isPlayerLaunch(params)).toBe(false);
  });

  it('a read-mode open carries initialMode and is not a launch (read starts no audio)', () => {
    const href = playerRoute({
      bookId: 'book-7',
      sectionType: 'summaryBrief',
      initialMode: 'read',
    });
    expect(href).toContain('initialMode=read');
    expect(isPlayerLaunch(Object.fromEntries(new URLSearchParams(href.split('?')[1])))).toBe(false);
  });

  it('a marker with no book is not a launch — a launch must name its target', () => {
    expect(isPlayerLaunch({ launch: '1' })).toBe(false);
    expect(isPlayerLaunch({ launch: '1', bookId: 'book-7' })).toBe(true);
  });

  it('percent-encodes ids and section types so a stray character cannot split the query', () => {
    const href = playerRoute({ bookId: 'a&b=c', sectionType: 'x y', launch: true });
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(params.bookId).toBe('a&b=c');
    expect(params.section).toBe('x y');
  });
});
