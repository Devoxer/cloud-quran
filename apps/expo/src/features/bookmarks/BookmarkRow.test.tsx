/**
 * `BookmarkRow` — one kept verse (story 6-4).
 *
 * What this file pins is the row's own contract: the preview is a styled DISPLAY of
 * `uthmani_text` (Uthmani face, local RTL, sliced, stripped), a missing preview degrades the
 * DECORATION and not the row, the delete is the owned `RowDeleteButton` with a label that names
 * the verse, and no timestamp is rendered (`createdAt` sorts — it is not content).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { memo } from 'react';
import { ARABIC_LINE_HEIGHT, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { FONT_SIZE } from '@/constants/typography';
import { BookmarkRow, type BookmarkRowProps } from './BookmarkRow';

/** ARABIC SMALL HIGH ROUNDED ZERO — the mark `stripDisplayMarks` removes for display. */
const ROUNDED_ZERO = '\u06DF';

function renderRow(props: Partial<BookmarkRowProps> = {}) {
  return render(
    <BookmarkRow
      id="bk-1"
      surah={2}
      verse={255}
      preview="ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ"
      onPress={() => {}}
      onDelete={() => {}}
      testID="row"
      {...props}
    />
  );
}

/** Flattened style of one rendered node. */
function flatten(style: unknown): Record<string, unknown> {
  const parts = (Array.isArray(style) ? style.flat(2) : [style]).filter(Boolean);
  return Object.assign({}, ...parts.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

describe('the title line', () => {
  it('names the surah by transliteration with the verse ref', () => {
    renderRow();
    expect(screen.getByText('Al-Baqarah · 2:255')).toBeTruthy();
  });

  it('falls back for a surah number that is not in the book — the row still renders', () => {
    // The frozen matrix's corrupt-cache row: name falls back, no crash, delete still present.
    renderRow({ surah: 200, verse: 1, preview: null });
    expect(screen.getByText('Surah 200 · 200:1')).toBeTruthy();
    expect(screen.getByTestId('row-delete')).toBeTruthy();
  });

  it('renders no timestamp — createdAt sorts, it is not content', () => {
    renderRow();
    // Nothing in the row says "ago", a date, or a time (the pre-fork precedent).
    expect(screen.queryByText(/ago|\d{4}-\d{2}-\d{2}|\d+:\d+ (AM|PM)/)).toBeNull();
  });
});

describe('the Arabic preview', () => {
  it('renders in the Uthmani face, RTL and right-aligned locally, at a FIXED size', () => {
    renderRow();
    const style = flatten(screen.getByTestId('row-preview').props.style);
    expect(style.fontFamily).toBe(UTHMANI_FONT_FAMILY);
    expect(style.writingDirection).toBe('rtl');
    expect(style.textAlign).toBe('right');
    // NOT the reader's 20–44pt reading preference — a list row, one fixed size.
    expect(style.fontSize).toBe(FONT_SIZE.h3);
    expect(style.lineHeight).toBe(FONT_SIZE.h3 * ARABIC_LINE_HEIGHT);
  });

  it('slices a long verse to ~80 characters BEFORE render — 2:282 is multi-KB', () => {
    const long = 'ب'.repeat(500);
    renderRow({ preview: long });
    const rendered = screen.getByTestId('row-preview').props.children as string;
    expect(rendered).toHaveLength(81); // 80 + the ellipsis
    expect(rendered.endsWith('…')).toBe(true);
  });

  it('leaves a short verse unsliced, with no ellipsis', () => {
    renderRow({ preview: 'بِسْمِ' });
    expect(screen.getByTestId('row-preview').props.children).toBe('بِسْمِ');
  });

  it('strips U+06DF for display — the same measured KFGQPC defect VerseRow documents', () => {
    const raw = `أُو${ROUNDED_ZERO}لَٰٓئِكَ`;
    renderRow({ preview: raw });
    const rendered = screen.getByTestId('row-preview').props.children as string;
    expect(rendered).not.toContain(ROUNDED_ZERO);
    expect(rendered).toBe(raw.replaceAll(ROUNDED_ZERO, ''));
  });

  it('degrades to NO preview line when the join could not answer — the row survives', () => {
    renderRow({ preview: null });
    expect(screen.queryByTestId('row-preview')).toBeNull();
    // Everything else is intact: title, navigation press, delete.
    expect(screen.getByText('Al-Baqarah · 2:255')).toBeTruthy();
    expect(screen.getByTestId('row-open')).toBeTruthy();
    expect(screen.getByTestId('row-delete')).toBeTruthy();
  });
});

describe('the two presses', () => {
  it('the row press reports its PAIR, and carries the a11y label naming the verse', () => {
    const onPress = jest.fn();
    renderRow({ onPress });
    const open = screen.getByTestId('row-open');
    expect(open.props.accessibilityLabel).toBe('Al-Baqarah, verse 255');
    fireEvent.press(open);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(2, 255);
  });

  it('the delete is the owned RowDeleteButton, reports the ID, and names the verse', () => {
    // ⚠️ The pre-fork shipped Swipeable + a red Delete; the repo standardized on the neutral
    // in-row `×` (story 23.13) and this row must not re-grow the swipe machinery.
    const onDelete = jest.fn();
    renderRow({ onDelete });
    const del = screen.getByTestId('row-delete');
    expect(del.props.accessibilityLabel).toBe('Remove bookmark for Al-Baqarah 2:255');
    fireEvent.press(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('bk-1');
  });
});

describe('memoization', () => {
  it('is a memo component — the list re-renders on every cache change; unchanged rows must not', () => {
    const marker = (memo(() => null) as unknown as { $$typeof: symbol }).$$typeof;
    expect((BookmarkRow as unknown as { $$typeof: symbol }).$$typeof).toBe(marker);
    // Anti-vacuity: the memoized inner is the real row.
    renderRow();
    expect(screen.getByText('Al-Baqarah · 2:255')).toBeTruthy();
  });
});
