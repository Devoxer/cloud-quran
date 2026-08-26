import { describe, expect, it } from 'vitest';
import { ContentSidecarSchema, findBlockAtTime, parseContent, splitIntoBlocks } from './blocks.js';

describe('findBlockAtTime', () => {
  const blocks = [
    { startMs: 1000, endMs: 2000 }, // block 0 starts at 1000 → 0..1000 is the preamble
    { startMs: 2000, endMs: 3500 },
    { startMs: 3500, endMs: 5000 },
  ];

  it('returns -1 when there are no blocks', () => {
    expect(findBlockAtTime([], 1234)).toBe(-1);
  });

  it('returns -1 while the preamble plays (before blocks[0].startMs)', () => {
    expect(findBlockAtTime(blocks, 0)).toBe(-1);
    expect(findBlockAtTime(blocks, 999)).toBe(-1);
  });

  it('returns the last block whose startMs <= time', () => {
    expect(findBlockAtTime(blocks, 1000)).toBe(0);
    expect(findBlockAtTime(blocks, 1999)).toBe(0);
    expect(findBlockAtTime(blocks, 2000)).toBe(1);
    expect(findBlockAtTime(blocks, 4000)).toBe(2);
    expect(findBlockAtTime(blocks, 99999)).toBe(2);
  });
});

describe('parseContent', () => {
  it('returns null for null/undefined', () => {
    expect(parseContent(null)).toBeNull();
    expect(parseContent(undefined)).toBeNull();
  });

  it('treats a non-JSON string as text', () => {
    expect(parseContent('just words')).toEqual({ type: 'text', text: 'just words' });
  });

  it('parses a JSON-string sections payload, reading only the declared keys', () => {
    // The `intro` here is a key `ContentSchemas` does not declare (Story 24.40 removed the last
    // thing that asked for one). It must be READ PAST, not captured — the fixture carries it so
    // this case reds if a capture is ever reinstated.
    const json = JSON.stringify({
      intro: 'Undeclared key.',
      sections: [{ title: 'T1', paragraphs: ['p1', 'p2'] }],
    });
    expect(parseContent(json)).toEqual({
      type: 'sections',
      sections: [{ title: 'T1', paragraphs: ['p1', 'p2'] }],
    });
  });

  it('infers takeaways / quotes / faq from a direct array shape', () => {
    expect(parseContent([{ title: 'a', description: 'b' }])?.type).toBe('takeaways');
    expect(parseContent([{ quote: 'a', explanation: 'b' }])?.type).toBe('quotes');
    expect(parseContent([{ question: 'a', answer: 'b' }])?.type).toBe('faq');
  });

  it('maps the {questions} object shape to faq', () => {
    const parsed = parseContent({ questions: [{ question: 'q', answer: 'a' }] });
    expect(parsed).toEqual({ type: 'faq', faq: [{ question: 'q', answer: 'a' }] });
  });

  it('returns null for an unrecognized object', () => {
    expect(parseContent({ nope: true })).toBeNull();
  });
});

describe('splitIntoBlocks', () => {
  it('returns [] for null parsed content', () => {
    expect(splitIntoBlocks(null)).toEqual([]);
  });

  it('emits title + paragraphs per section, one group per section', () => {
    const blocks = splitIntoBlocks({
      type: 'sections',
      sections: [{ title: 'Title A', paragraphs: ['Para A1', 'Para A2'] }],
    });
    expect(blocks.map((b) => ({ kind: b.kind, text: b.text, groupIndex: b.groupIndex }))).toEqual([
      { kind: 'title', text: 'Title A', groupIndex: 0 },
      { kind: 'paragraph', text: 'Para A1', groupIndex: 0 },
      { kind: 'paragraph', text: 'Para A2', groupIndex: 0 },
    ]);
    // The writer's ttsText decorates titles with quotes + a period for clean pacing.
    expect(blocks[0].ttsText).toBe('"Title A."');
  });

  it('emits one block per paragraph (paragraphs type)', () => {
    const blocks = splitIntoBlocks({ type: 'paragraphs', paragraphs: ['a', 'b', 'c'] });
    expect(blocks.map((b) => b.text)).toEqual(['a', 'b', 'c']);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
    expect(blocks.map((b) => b.groupIndex)).toEqual([0, 1, 2]);
  });

  it('emits question + answer per faq item', () => {
    const blocks = splitIntoBlocks({ type: 'faq', faq: [{ question: 'Q1?', answer: 'A1.' }] });
    expect(blocks.map((b) => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'title', text: 'Q1?' },
      { kind: 'paragraph', text: 'A1.' },
    ]);
  });

  it('quotes the quote text for display + tts (quotes type)', () => {
    const blocks = splitIntoBlocks({
      type: 'quotes',
      quotes: [{ quote: 'Be bold', explanation: 'why' }],
    });
    expect(blocks[0]).toMatchObject({ kind: 'title', text: '"Be bold"', ttsText: '"Be bold."' });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'why' });
  });

  it('skips blank/whitespace-only blocks so the writer never TTSes empty input', () => {
    // A stray empty paragraph must not become a block (an empty Kokoro call returns no
    // audio → the whole section fails). Both writer + app filter identically, so the 1:1
    // index contract is preserved.
    const blocks = splitIntoBlocks({ type: 'paragraphs', paragraphs: ['real', '', '   ', 'also'] });
    expect(blocks.map((b) => b.text)).toEqual(['real', 'also']);
  });

  it('skips an empty title/answer in faq + an empty quote/explanation', () => {
    expect(
      splitIntoBlocks({ type: 'faq', faq: [{ question: '', answer: 'A.' }] }).map((b) => b.text)
    ).toEqual(['A.']);
    expect(
      splitIntoBlocks({ type: 'quotes', quotes: [{ quote: 'Q', explanation: '  ' }] }).map(
        (b) => b.text
      )
    ).toEqual(['"Q"']);
  });

  it('round-trips parseContent → splitIntoBlocks for a JSON sections string', () => {
    // Carries an undeclared `intro` for the same reason as the parseContent case above: it must
    // produce NO block, so the end-to-end path reds if a block-0 emit is ever reinstated.
    const json = JSON.stringify({ intro: 'Lead', sections: [{ title: 'S', paragraphs: ['x'] }] });
    expect(splitIntoBlocks(parseContent(json)).map((b) => b.text)).toEqual(['S', 'x']);
  });
});

describe('ContentSidecarSchema', () => {
  it('accepts a blocks-only sidecar', () => {
    expect(ContentSidecarSchema.safeParse({ blocks: [{ startMs: 0, endMs: 100 }] }).success).toBe(
      true
    );
  });

  it('defaults blocks to [] for a content-only object (Story 22.4 co-location)', () => {
    const parsed = ContentSidecarSchema.safeParse({ content: 'plain text' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content).toBe('plain text');
      expect(parsed.data.blocks).toEqual([]);
    }
  });

  it('round-trips co-located { content, blocks }', () => {
    const obj = { content: { paragraphs: ['a', 'b'] }, blocks: [{ startMs: 0, endMs: 50 }] };
    const parsed = ContentSidecarSchema.safeParse(obj);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.content).toEqual({ paragraphs: ['a', 'b'] });
      expect(parsed.data.blocks).toEqual([{ startMs: 0, endMs: 50 }]);
    }
  });

  it('accepts content as a string, a native object, OR a native array (permissive)', () => {
    expect(ContentSidecarSchema.safeParse({ content: 'a string' }).success).toBe(true);
    expect(ContentSidecarSchema.safeParse({ content: { sections: [] } }).success).toBe(true);
    expect(
      ContentSidecarSchema.safeParse({ content: [{ question: 'q', answer: 'a' }] }).success
    ).toBe(true);
  });

  it('defaults to empty blocks for an empty object (read tolerance)', () => {
    const parsed = ContentSidecarSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.blocks).toEqual([]);
  });

  it('rejects a malformed block (missing endMs)', () => {
    expect(ContentSidecarSchema.safeParse({ blocks: [{ startMs: 0 }] }).success).toBe(false);
  });
});
