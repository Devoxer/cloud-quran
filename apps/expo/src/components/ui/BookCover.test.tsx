/**
 * Tests for BookCover — the single cover-rendering primitive (Story 31.1).
 *
 * Covers the URL-selection branches (webp-preferred, jpeg-fallback), the blurhash
 * placeholder (present → `{ blurhash }`, absent → undefined), the hard-error → icon
 * fallback (which also drops the blurhash), `recyclingKey`, `placeholderContentFit`
 * matching `contentFit`, and the priority/cachePolicy defaults.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { BookCover } from './BookCover';

// Mock expo-image to a plain host component so its props are inspectable via `.props`.
jest.mock('expo-image', () => ({
  Image: 'Image',
}));

const BOOK = {
  id: 'book-123',
  coverUrl: 'https://covers.wisdomfruits.com/atomic-habits-cover.jpg',
  coverWebpUrl: 'https://covers.wisdomfruits.com/atomic-habits-cover.webp',
  coverBlurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
};

const TID = 'cover';

describe('BookCover', () => {
  describe('URL selection (AC-4)', () => {
    it('renders the WebP variant when present', () => {
      const { getByTestId } = render(<BookCover book={BOOK} testID={TID} />);
      expect(getByTestId(TID).props.source).toEqual({ uri: BOOK.coverWebpUrl });
    });

    it('falls back to the JPEG when no WebP variant', () => {
      const { getByTestId } = render(
        <BookCover book={{ id: BOOK.id, coverUrl: BOOK.coverUrl }} testID={TID} />
      );
      expect(getByTestId(TID).props.source).toEqual({ uri: BOOK.coverUrl });
    });

    it('renders the icon placeholder when there is no cover URL at all', () => {
      const { getByTestId } = render(<BookCover book={{ id: BOOK.id }} testID={TID} />);
      // The placeholder is a local require (a number/module ref), never a `{ uri }` source.
      expect(getByTestId(TID).props.source?.uri).toBeUndefined();
    });
  });

  describe('blurhash placeholder (AC-11)', () => {
    it('passes the blurhash as a source-object placeholder when present', () => {
      const { getByTestId } = render(<BookCover book={BOOK} testID={TID} />);
      expect(getByTestId(TID).props.placeholder).toEqual({ blurhash: BOOK.coverBlurhash });
    });

    it('omits the placeholder when the book has no blurhash', () => {
      const { getByTestId } = render(
        <BookCover book={{ id: BOOK.id, coverUrl: BOOK.coverUrl }} testID={TID} />
      );
      expect(getByTestId(TID).props.placeholder).toBeUndefined();
    });

    it('sets placeholderContentFit to match contentFit (default fill)', () => {
      const { getByTestId } = render(<BookCover book={BOOK} testID={TID} />);
      const el = getByTestId(TID);
      expect(el.props.contentFit).toBe('fill');
      expect(el.props.placeholderContentFit).toBe('fill');
    });

    it('sets placeholderContentFit to match a passed contentFit (cover hero)', () => {
      const { getByTestId } = render(<BookCover book={BOOK} contentFit="cover" testID={TID} />);
      const el = getByTestId(TID);
      expect(el.props.contentFit).toBe('cover');
      expect(el.props.placeholderContentFit).toBe('cover');
    });
  });

  describe('hard-error fallback (AC-3)', () => {
    it('swaps source to the icon and drops the blurhash on a load error', () => {
      const { getByTestId } = render(<BookCover book={BOOK} testID={TID} />);
      const el = getByTestId(TID);
      // Sanity: starts on the webp with the blurhash placeholder.
      expect(el.props.source).toEqual({ uri: BOOK.coverWebpUrl });
      expect(el.props.placeholder).toEqual({ blurhash: BOOK.coverBlurhash });

      fireEvent(el, 'error');

      const after = getByTestId(TID);
      // Now the neutral icon (a require, not a `{ uri }`), and no blurhash-on-error.
      expect(after.props.source?.uri).toBeUndefined();
      expect(after.props.placeholder).toBeUndefined();
    });
  });

  describe('recycling + tuning (AC-3)', () => {
    it('sets recyclingKey from the book id', () => {
      const { getByTestId } = render(<BookCover book={BOOK} testID={TID} />);
      expect(getByTestId(TID).props.recyclingKey).toBe(BOOK.id);
    });

    it('falls back recyclingKey to the resolved uri for id-less callers (quote covers)', () => {
      const { getByTestId } = render(
        <BookCover book={{ coverUrl: 'https://example.com/quote-cover.jpg' }} testID={TID} />
      );
      expect(getByTestId(TID).props.recyclingKey).toBe('https://example.com/quote-cover.jpg');
    });

    it('honors an explicit recyclingKey override', () => {
      const { getByTestId } = render(<BookCover book={BOOK} recyclingKey="slot-7" testID={TID} />);
      expect(getByTestId(TID).props.recyclingKey).toBe('slot-7');
    });

    it('passes recyclingKey=null through (linger mode — quiz header)', () => {
      const { getByTestId } = render(<BookCover book={BOOK} recyclingKey={null} testID={TID} />);
      expect(getByTestId(TID).props.recyclingKey).toBeNull();
    });

    it('resets the error state when the book changes (recycled cell)', () => {
      const { getByTestId, rerender } = render(<BookCover book={BOOK} testID={TID} />);
      fireEvent(getByTestId(TID), 'error');
      expect(getByTestId(TID).props.source?.uri).toBeUndefined(); // errored → icon

      // Recycle the same instance for a different book → error must clear, new cover shows.
      const other = {
        id: 'book-999',
        coverUrl: 'https://covers.wisdomfruits.com/other-cover.jpg',
      };
      rerender(<BookCover book={other} testID={TID} />);
      expect(getByTestId(TID).props.source).toEqual({ uri: other.coverUrl });
    });

    it('resets the error state when the SAME book gets a live URL (jpeg→webp), not just on id change', () => {
      // A book with only a JPEG that errors, then `optimize-covers` stamps `coverWebpUrl` and
      // InstantDB live-pushes the row onto the SAME mounted cell (id unchanged). The error must
      // clear so the now-valid WebP shows — resetting on id alone would leave it pinned to the icon.
      const jpegOnly = { id: 'book-777', coverUrl: 'https://covers.wisdomfruits.com/x.jpg' };
      const { getByTestId, rerender } = render(<BookCover book={jpegOnly} testID={TID} />);
      fireEvent(getByTestId(TID), 'error');
      expect(getByTestId(TID).props.source?.uri).toBeUndefined(); // errored → icon

      const withWebp = { ...jpegOnly, coverWebpUrl: 'https://covers.wisdomfruits.com/x.webp' };
      rerender(<BookCover book={withWebp} testID={TID} />);
      expect(getByTestId(TID).props.source).toEqual({ uri: withWebp.coverWebpUrl });
    });

    it('applies memory-disk cachePolicy and the normal default priority', () => {
      const { getByTestId } = render(<BookCover book={BOOK} testID={TID} />);
      const el = getByTestId(TID);
      expect(el.props.cachePolicy).toBe('memory-disk');
      expect(el.props.priority).toBe('normal');
    });

    it('honors an explicit high priority (detail hero / above-the-fold)', () => {
      const { getByTestId } = render(<BookCover book={BOOK} priority="high" testID={TID} />);
      expect(getByTestId(TID).props.priority).toBe('high');
    });
  });
});
