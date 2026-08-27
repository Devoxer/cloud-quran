/**
 * lint:mushaf-glyphs — RASTERISE the glyphs the mushaf layout references and refuse the ones a
 * reader would see as a hole or a box.
 *
 * ⚠️ THIS EXISTS BECAUSE A CHECK THAT READS FONT STRUCTURE CANNOT SEE WHAT A READER SEES. Story
 * 6-2 established the scope of the mushaf's glyph coverage with a check that asked "is this
 * codepoint in the cmap": 88,246 checks, one miss. Every defect found on 2026-08-27 is IN the
 * cmap, with real contours and sane bounding boxes — one draws a literal box, the others draw
 * nothing at all — so the cmap check answered "present" for all of them. What a reader sees is
 * the RASTER, so the raster is what this gate produces.
 *
 * No dependencies, on purpose — this file carries its own woff2 decoder (Brotli via `node:zlib`
 * plus the WOFF2 `glyf` transform), its own TrueType outline reader and its own scanline
 * rasteriser. All three were validated against fontTools' decoding of the shipped corpus
 * (2026-08-27): outline-for-outline identical, glyph id and advance included.
 *
 * ── The three defect classes, and why only one of them is visible to a rasteriser ────────────
 *
 * 1. **BLANK** — the outline encloses no ink. Only rasterisation answers this; contour and point
 *    counts can look entirely healthy. No glyph in the shipped corpus is blank today; the class
 *    is checked because nothing else would notice one arriving.
 * 2. **PLACEHOLDER BOX** — the font ships a literal box-shaped glyph past the end of its page's
 *    word run (nested axis-aligned rectangles). It rasterises to plenty of ink, so ink alone
 *    cannot see it; the SHAPE is the signal, and it is checked structurally because a rectangle
 *    is exactly describable. ⚠️ A box means THE LAYOUT IS WRONG, NOT THE FONT: the map has run
 *    off the end of the page's glyph ladder. The one real instance — page 254 `13:42:18`, the
 *    tofu the owner reported — was fixed in `generate-mushaf-layout.ts`, not in a font.
 * 3. **DROPPED BY THE RENDERER** — the outline is fine and rasterises fine, and the shaping engine
 *    still refuses to draw it. Measured, exactly, over the whole corpus: **a contour of exactly
 *    two points whose FIRST point is off-curve makes Chromium/Skia and CoreText discard the ENTIRE
 *    glyph**, advance intact, so the reader gets a word-shaped hole. Over all 604 upstream fonts
 *    this predicate selects exactly six referenced slots — 154/U+FBD4, 161/U+FB70, 166/U+FBA4,
 *    302/U+FBAD, 472/U+FBF2, 566/U+FB7D — in 88,246 samples. Four of the six are the glyphs story
 *    6-2's patched fonts already repair, described from Safari at the time; the predicate finding
 *    them independently is what makes it credible on the other two.
 *
 *    ⚠️ NO RASTERISER CAN SEE CLASS 3, INCLUDING THIS ONE. The outline is valid and this module
 *    draws it correctly; the defect lives in the renderer's refusal, not in the shape. That is why
 *    `classifyGlyph` reports it from structure and says so, rather than pretending the raster
 *    found it. A one-point contour is NOT the same thing — 566 of the referenced glyphs contain
 *    one and every one of them renders.
 *
 * ── What this gate scans, and the half it CANNOT ─────────────────────────────────────────────
 *
 * ⚠️ ONLY SIX OF THE 604 PAGE FONTS ARE IN THIS REPO. The rest are fetched from the app's CDN at
 * runtime (`lib/mushafFonts.ts`), so `pnpm lint` — which must stay offline, and runs in CI where
 * there is no font corpus — can only scan what is bundled: the patched overlay in
 * `apps/expo/assets/fonts/qpc-patched/`. That is not a token scan. It proves each shipped patch
 * actually repairs the glyph it claims, against the live layout data, and it pins the THREE
 * registries that have to agree — the files on disk, `PATCHED_FONT_PAGES` in
 * `apps/expo/src/lib/mushafFonts.ts`, and `PATCHED_PAGES` in `scripts/prepare-fonts.ts`. A
 * patched font that no `require()` names is a repair the app never loads, which is exactly the
 * state this file was written in.
 *
 * The other 598 pages are swept with `--corpus <dir>`, pointed at a clone of the pinned upstream
 * `nuqayah/qpc-fonts` (`scripts/prepare-fonts.ts` makes one at `/tmp/qpc-fonts`):
 *
 *     node scripts/lint-mushaf-glyphs.mjs --corpus /tmp/qpc-fonts/mushaf-woff2
 *
 * That mode reads every referenced codepoint on all 604 pages (~90s), and additionally reports
 * any patched page whose UPSTREAM copy is already sound — a patch with no remaining reason.
 * Run it at an epic boundary or after changing the layout generator, not on every push.
 *
 * ── The repair, for anyone patching a font ────────────────────────────────────────────────────
 *
 * Prepend an ON-CURVE point at the floor-midpoint of the two existing points, so the contour has
 * three points and starts on-curve. Advance width, bounding box and the drawn shape are all
 * unchanged (the added point sits on the curve the two points already implied). ⚠️ Repair EVERY
 * such contour in the glyph, not the first: story 6-2's page-566 patch fixed one of glyph
 * `U+FB7D`'s two and left `68:47:5` still invisible, and the prose then attributed the second to
 * an unrelated word (`69:5:3`, which is `U+FBE1` and has always been sound).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

import { isMainModule } from './gate-lib.mjs';

// ── WOFF2 container ───────────────────────────────────────────────────────────────────────────

/** The WOFF2 "known table tags" table, indexed by the low 6 bits of a directory entry's flags. */
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'ltag',
  'meta',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

/** A cursor over a byte range, with just the primitives the two formats need. */
class Reader {
  constructor(buf, offset = 0, end = buf.length) {
    this.buf = buf;
    this.pos = offset;
    this.end = end;
  }
  get remaining() {
    return this.end - this.pos;
  }
  need(n) {
    if (this.pos + n > this.end) throw new Error(`truncated: wanted ${n} byte(s) at ${this.pos}`);
  }
  u8() {
    this.need(1);
    return this.buf[this.pos++];
  }
  u16() {
    this.need(2);
    const v = (this.buf[this.pos] << 8) | this.buf[this.pos + 1];
    this.pos += 2;
    return v;
  }
  i16() {
    const v = this.u16();
    return v >= 0x8000 ? v - 0x10000 : v;
  }
  u32() {
    this.need(4);
    const b = this.buf;
    const v =
      b[this.pos] * 0x1000000 +
      ((b[this.pos + 1] << 16) | (b[this.pos + 2] << 8) | b[this.pos + 3]);
    this.pos += 4;
    return v;
  }
  skip(n) {
    this.need(n);
    this.pos += n;
  }
  /** UIntBase128 — the WOFF2 directory's length encoding. */
  base128() {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      if (i === 0 && b === 0x80) throw new Error('UIntBase128 with a leading zero');
      if (v > 0x01ffffff) throw new Error('UIntBase128 overflow');
      v = (v << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return v >>> 0;
    }
    throw new Error('UIntBase128 longer than 5 bytes');
  }
  /** 255UInt16 — the WOFF2 glyph streams' short-integer encoding. */
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 253 * 2;
    return code;
  }
}

/**
 * Split a font file into its tables. Accepts a bare sfnt (`\0\1\0\0` / `true` / `OTTO`) and a
 * WOFF2, and for a WOFF2 it returns the `glyf`/`loca` bytes STILL TRANSFORMED — `readGlyphs`
 * below reconstructs outlines straight from the transform, which is both simpler and faster than
 * rebuilding an sfnt that nothing would read.
 */
export function readTables(buf) {
  const tag = buf.toString('latin1', 0, 4);
  if (tag !== 'wOF2') {
    const r = new Reader(buf);
    r.skip(4);
    const numTables = r.u16();
    r.skip(6);
    const tables = new Map();
    for (let i = 0; i < numTables; i++) {
      const name = buf.toString('latin1', r.pos, r.pos + 4);
      r.skip(8);
      const offset = r.u32();
      const length = r.u32();
      tables.set(name, { bytes: buf.subarray(offset, offset + length), transformed: false });
    }
    return tables;
  }

  const r = new Reader(buf);
  r.skip(12); // signature, flavor, length
  const numTables = r.u16();
  r.skip(2 + 4 + 4 + 2 + 2 + 4 + 4 + 4 + 4 + 4); // reserved … privLength
  const entries = [];
  let compressedStart = 0;
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const index = flags & 0x3f;
    let name;
    if (index === 0x3f) {
      name = buf.toString('latin1', r.pos, r.pos + 4);
      r.skip(4);
    } else {
      name = KNOWN_TAGS[index];
      if (name === undefined) throw new Error(`unknown table tag index ${index}`);
    }
    const transformVersion = (flags >> 6) & 0x03;
    const origLength = r.base128();
    // For glyf/loca a transformVersion of 3 means "null transform"; for every other table it is 0.
    const nullTransform =
      name === 'glyf' || name === 'loca' ? transformVersion === 3 : transformVersion === 0;
    const transformLength = nullTransform ? origLength : r.base128();
    entries.push({ name, length: transformLength, transformed: !nullTransform });
  }
  compressedStart = r.pos;
  const decompressed = brotliDecompressSync(buf.subarray(compressedStart));
  const tables = new Map();
  let offset = 0;
  for (const e of entries) {
    tables.set(e.name, {
      bytes: decompressed.subarray(offset, offset + e.length),
      transformed: e.transformed,
    });
    offset += e.length;
  }
  return tables;
}

// ── Outlines ──────────────────────────────────────────────────────────────────────────────────

/** `(flag & 1) ? value : -value` — the WOFF2 triplet encoding's sign convention. */
const withSign = (flag, value) => (flag & 1 ? value : -value);

/**
 * Decode the WOFF2-transformed `glyf` table into outlines.
 *
 * Returns one entry per glyph id: `{ contours }`, where a contour is an array of
 * `{ x, y, onCurve }` in font units. A composite glyph resolves its components (translation only,
 * which is all these fonts use); an empty glyph gets zero contours.
 */
function readTransformedGlyf(bytes) {
  const r = new Reader(bytes);
  r.skip(4); // version
  const numGlyphs = r.u16();
  r.skip(2); // indexFormat
  const sizes = [];
  for (let i = 0; i < 7; i++) sizes.push(r.u32());
  const [nContourSize, nPointsSize, flagSize, glyphSize, compositeSize, bboxSize, instrSize] =
    sizes;
  let p = r.pos;
  const cut = (n) => {
    const s = new Reader(bytes, p, p + n);
    p += n;
    return s;
  };
  const nContourStream = cut(nContourSize);
  const nPointsStream = cut(nPointsSize);
  const flagStream = cut(flagSize);
  const glyphStream = cut(glyphSize);
  const compositeStream = cut(compositeSize);
  cut(bboxSize);
  const instructionStream = cut(instrSize);

  const glyphs = [];
  const composites = [];
  for (let gid = 0; gid < numGlyphs; gid++) {
    const nContours = nContourStream.i16();
    if (nContours === 0) {
      glyphs.push({ contours: [] });
      continue;
    }
    if (nContours < 0) {
      // Composite: component records live in their own stream and are resolved after this pass.
      const parts = [];
      let more = true;
      let haveInstructions = false;
      while (more) {
        const flags = compositeStream.u16();
        const glyphIndex = compositeStream.u16();
        more = (flags & 0x0020) !== 0;
        if (flags & 0x0100) haveInstructions = true;
        let dx = 0;
        let dy = 0;
        if (flags & 0x0001) {
          dx = compositeStream.i16();
          dy = compositeStream.i16();
        } else {
          const a = compositeStream.u8();
          const b = compositeStream.u8();
          dx = a >= 0x80 ? a - 0x100 : a;
          dy = b >= 0x80 ? b - 0x100 : b;
        }
        if (flags & 0x0008) compositeStream.skip(2);
        else if (flags & 0x0040) compositeStream.skip(4);
        else if (flags & 0x0080) compositeStream.skip(8);
        parts.push({ glyphIndex, dx: flags & 0x0002 ? dx : 0, dy: flags & 0x0002 ? dy : 0 });
      }
      if (haveInstructions) instructionStream.skip(glyphStream.u255());
      glyphs.push({ contours: [] });
      composites.push({ gid, parts });
      continue;
    }
    const perContour = [];
    let total = 0;
    for (let i = 0; i < nContours; i++) {
      const n = nPointsStream.u255();
      perContour.push(n);
      total += n;
    }
    const flags = new Uint8Array(total);
    for (let i = 0; i < total; i++) flags[i] = flagStream.u8();
    const xs = new Int32Array(total);
    const ys = new Int32Array(total);
    let x = 0;
    let y = 0;
    for (let i = 0; i < total; i++) {
      const raw = flags[i];
      const f = raw & 0x7f;
      let dx = 0;
      let dy = 0;
      if (f < 10) {
        dy = withSign(f, ((f & 14) << 7) + glyphStream.u8());
      } else if (f < 20) {
        dx = withSign(f, (((f - 10) & 14) << 7) + glyphStream.u8());
      } else if (f < 84) {
        const b0 = f - 20;
        const b1 = glyphStream.u8();
        dx = withSign(f, 1 + (b0 & 0x30) + (b1 >> 4));
        dy = withSign(f >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
      } else if (f < 120) {
        const b0 = f - 84;
        const b1 = glyphStream.u8();
        const b2 = glyphStream.u8();
        dx = withSign(f, 1 + (((b0 / 12) | 0) << 8) + b1);
        dy = withSign(f >> 1, 1 + (((b0 % 12) >> 2) << 8) + b2);
      } else if (f < 124) {
        const b1 = glyphStream.u8();
        const b2 = glyphStream.u8();
        const b3 = glyphStream.u8();
        dx = withSign(f, (b1 << 4) + (b2 >> 4));
        dy = withSign(f >> 1, ((b2 & 0x0f) << 8) + b3);
      } else {
        const b1 = glyphStream.u8();
        const b2 = glyphStream.u8();
        const b3 = glyphStream.u8();
        const b4 = glyphStream.u8();
        dx = withSign(f, (b1 << 8) + b2);
        dy = withSign(f >> 1, (b3 << 8) + b4);
      }
      x += dx;
      y += dy;
      xs[i] = x;
      ys[i] = y;
    }
    instructionStream.skip(glyphStream.u255());
    const contours = [];
    let at = 0;
    for (const n of perContour) {
      const pts = [];
      for (let i = 0; i < n; i++, at++) {
        pts.push({ x: xs[at], y: ys[at], onCurve: (flags[at] & 0x80) === 0 });
      }
      contours.push(pts);
    }
    glyphs.push({ contours });
  }
  for (const { gid, parts } of composites) {
    const contours = [];
    for (const part of parts) {
      const src = glyphs[part.glyphIndex];
      if (!src) continue;
      for (const c of src.contours) {
        contours.push(
          c.map((pt) => ({ x: pt.x + part.dx, y: pt.y + part.dy, onCurve: pt.onCurve }))
        );
      }
    }
    glyphs[gid].contours = contours;
  }
  return glyphs;
}

/** Decode an UNtransformed `glyf` + `loca` pair (a plain sfnt, or a woff2 with a null transform). */
function readPlainGlyf(glyf, loca, numGlyphs, longLoca) {
  const offsets = [];
  const lr = new Reader(loca);
  for (let i = 0; i <= numGlyphs; i++) offsets.push(longLoca ? lr.u32() : lr.u16() * 2);
  const glyphs = [];
  const simple = [];
  for (let gid = 0; gid < numGlyphs; gid++) {
    const start = offsets[gid];
    const end = offsets[gid + 1];
    if (end <= start) {
      glyphs.push({ contours: [] });
      simple.push(null);
      continue;
    }
    const r = new Reader(glyf, start, end);
    const nContours = r.i16();
    r.skip(8); // bbox
    if (nContours < 0) {
      glyphs.push({ contours: [] });
      simple.push({ composite: true, r });
      continue;
    }
    const endPts = [];
    for (let i = 0; i < nContours; i++) endPts.push(r.u16());
    const total = nContours === 0 ? 0 : endPts[nContours - 1] + 1;
    r.skip(r.u16()); // instructions
    const flags = new Uint8Array(total);
    for (let i = 0; i < total; ) {
      const f = r.u8();
      flags[i++] = f;
      if (f & 0x08) {
        let repeat = r.u8();
        while (repeat-- > 0 && i < total) flags[i++] = f;
      }
    }
    const xs = new Int32Array(total);
    const ys = new Int32Array(total);
    let v = 0;
    for (let i = 0; i < total; i++) {
      const f = flags[i];
      if (f & 0x02) v += (f & 0x10 ? 1 : -1) * r.u8();
      else if (!(f & 0x10)) v += r.i16();
      xs[i] = v;
    }
    v = 0;
    for (let i = 0; i < total; i++) {
      const f = flags[i];
      if (f & 0x04) v += (f & 0x20 ? 1 : -1) * r.u8();
      else if (!(f & 0x20)) v += r.i16();
      ys[i] = v;
    }
    const contours = [];
    let at = 0;
    for (const end2 of endPts) {
      const pts = [];
      for (; at <= end2; at++)
        pts.push({ x: xs[at], y: ys[at], onCurve: (flags[at] & 0x01) !== 0 });
      contours.push(pts);
    }
    glyphs.push({ contours });
    simple.push(null);
  }
  for (let gid = 0; gid < numGlyphs; gid++) {
    const c = simple[gid];
    if (!c?.composite) continue;
    const r = c.r;
    const contours = [];
    let more = true;
    while (more) {
      const flags = r.u16();
      const glyphIndex = r.u16();
      more = (flags & 0x0020) !== 0;
      let dx = 0;
      let dy = 0;
      if (flags & 0x0001) {
        dx = r.i16();
        dy = r.i16();
      } else {
        const a = r.u8();
        const b = r.u8();
        dx = a >= 0x80 ? a - 0x100 : a;
        dy = b >= 0x80 ? b - 0x100 : b;
      }
      if (flags & 0x0008) r.skip(2);
      else if (flags & 0x0040) r.skip(4);
      else if (flags & 0x0080) r.skip(8);
      const src = glyphs[glyphIndex];
      if (src && flags & 0x0002) {
        for (const cc of src.contours) {
          contours.push(cc.map((pt) => ({ x: pt.x + dx, y: pt.y + dy, onCurve: pt.onCurve })));
        }
      }
    }
    glyphs[gid].contours = contours;
  }
  return glyphs;
}

// ── cmap ──────────────────────────────────────────────────────────────────────────────────────

function parseCmapSubtable(bytes, offset) {
  const r = new Reader(bytes, offset);
  const format = r.u16();
  const map = new Map();
  if (format === 4) {
    r.skip(4); // length, language
    const segX2 = r.u16();
    const seg = segX2 / 2;
    r.skip(6); // searchRange, entrySelector, rangeShift
    const endCodes = [];
    for (let i = 0; i < seg; i++) endCodes.push(r.u16());
    r.skip(2); // reservedPad
    const startCodes = [];
    for (let i = 0; i < seg; i++) startCodes.push(r.u16());
    const idDeltaAt = r.pos;
    const idDeltas = [];
    for (let i = 0; i < seg; i++) idDeltas.push(r.i16());
    const idRangeAt = r.pos;
    const idRangeOffsets = [];
    for (let i = 0; i < seg; i++) idRangeOffsets.push(r.u16());
    for (let i = 0; i < seg; i++) {
      for (let cp = startCodes[i]; cp <= endCodes[i] && cp !== 0xffff; cp++) {
        let gid;
        if (idRangeOffsets[i] === 0) {
          gid = (cp + idDeltas[i]) & 0xffff;
        } else {
          const at = idRangeAt + i * 2 + idRangeOffsets[i] + (cp - startCodes[i]) * 2;
          if (at + 1 >= bytes.length) continue;
          gid = (bytes[at] << 8) | bytes[at + 1];
          if (gid !== 0) gid = (gid + idDeltas[i]) & 0xffff;
        }
        if (gid !== 0) map.set(cp, gid);
      }
    }
    void idDeltaAt;
  } else if (format === 12) {
    r.skip(10); // reserved, length, language
    const nGroups = r.u32();
    for (let i = 0; i < nGroups; i++) {
      const start = r.u32();
      const end = r.u32();
      const startGid = r.u32();
      for (let cp = start; cp <= end; cp++) map.set(cp, startGid + (cp - start));
    }
  } else if (format === 6) {
    r.skip(4);
    const first = r.u16();
    const count = r.u16();
    for (let i = 0; i < count; i++) {
      const gid = r.u16();
      if (gid !== 0) map.set(first + i, gid);
    }
  }
  return map;
}

/** The best Unicode cmap, chosen the way a shaping engine chooses: (3,10) > (3,1) > (0,*). */
function parseCmap(bytes) {
  const r = new Reader(bytes);
  r.skip(2);
  const numTables = r.u16();
  let best = null;
  let bestRank = -1;
  for (let i = 0; i < numTables; i++) {
    const platformId = r.u16();
    const encodingId = r.u16();
    const offset = r.u32();
    const rank =
      platformId === 3 && encodingId === 10
        ? 4
        : platformId === 3 && encodingId === 1
          ? 3
          : platformId === 0
            ? 2
            : 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = offset;
    }
  }
  if (best === null) return new Map();
  return parseCmapSubtable(bytes, best);
}

// ── The font ──────────────────────────────────────────────────────────────────────────────────

/**
 * Parse a page font into everything the checks need.
 *
 * @param {Buffer} buf raw `.woff2` (or `.ttf`) bytes
 * @returns {{unitsPerEm:number, numGlyphs:number, cmap:Map<number,number>,
 *            glyphs:Array<{contours:Array<Array<{x:number,y:number,onCurve:boolean}>>}>,
 *            advanceOf:(gid:number)=>number}}
 */
export function parseFont(buf) {
  const tables = readTables(buf);
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const cmapTable = tables.get('cmap');
  const glyfTable = tables.get('glyf');
  if (!head || !maxp || !cmapTable || !glyfTable) {
    throw new Error(`font is missing a required table (have: ${[...tables.keys()].join(',')})`);
  }
  const unitsPerEm = (head.bytes[18] << 8) | head.bytes[19];
  const indexToLocFormat = ((head.bytes[50] << 8) | head.bytes[51]) !== 0;
  const numGlyphs = (maxp.bytes[4] << 8) | maxp.bytes[5];
  const glyphs = glyfTable.transformed
    ? readTransformedGlyf(glyfTable.bytes)
    : readPlainGlyf(glyfTable.bytes, tables.get('loca').bytes, numGlyphs, indexToLocFormat);

  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const numberOfHMetrics = hhea ? (hhea.bytes[34] << 8) | hhea.bytes[35] : 0;
  const advanceOf = (gid) => {
    if (!hmtx || numberOfHMetrics === 0) return 0;
    const i = Math.min(gid, numberOfHMetrics - 1);
    const at = i * 4;
    if (at + 1 >= hmtx.bytes.length) return 0;
    return (hmtx.bytes[at] << 8) | hmtx.bytes[at + 1];
  };

  return { unitsPerEm, numGlyphs, cmap: parseCmap(cmapTable.bytes), glyphs, advanceOf };
}

// ── Rasteriser ────────────────────────────────────────────────────────────────────────────────

/**
 * Flatten one TrueType contour into a closed polygon.
 *
 * The two rules that make this TrueType rather than "a list of points": a run of consecutive
 * off-curve points implies an on-curve point at each midpoint, and a contour whose FIRST point is
 * off-curve starts at the last on-curve point (or, if there is none, at the midpoint of the last
 * and first points). Getting either wrong turns real ink into no ink, which is the answer this
 * whole module exists to give.
 */
function flattenContour(points, steps = 8) {
  if (points.length === 0) return [];
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, onCurve: true });
  let pts = points;
  if (!pts[0].onCurve) {
    const last = pts[pts.length - 1];
    pts = last.onCurve ? [last, ...pts.slice(0, -1)] : [mid(last, pts[0]), ...pts];
  }
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let i = 1;
  let current = pts[0];
  while (i <= pts.length) {
    const pt = pts[i % pts.length];
    if (pt.onCurve) {
      out.push({ x: pt.x, y: pt.y });
      current = pt;
      i++;
      continue;
    }
    const next = pts[(i + 1) % pts.length];
    const end = next.onCurve ? next : mid(pt, next);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push({
        x: u * u * current.x + 2 * u * t * pt.x + t * t * end.x,
        y: u * u * current.y + 2 * u * t * pt.y + t * t * end.y,
      });
    }
    current = end;
    i += next.onCurve ? 2 : 1;
  }
  return out;
}

/**
 * Rasterise a glyph and report how much ink it puts down.
 *
 * A scanline fill with the NON-ZERO winding rule — the rule TrueType uses, and the reason a
 * counter-drawn bowl stays white instead of cancelling the letter. `size` is the em size in
 * pixels; the sample grid is one row per pixel and `samples` sub-rows within it, which is ample
 * for a question whose answer is "any ink at all" and cheap enough to run over 88,244 glyphs.
 *
 * @returns {{ink:number, width:number, height:number, minX:number, minY:number, maxX:number, maxY:number}}
 *          `ink` is the number of covered pixels; the bounds are pixel coordinates, or `-1` when
 *          there is no ink.
 */
export function rasteriseGlyph(glyph, unitsPerEm, size = 64, samples = 4) {
  const scale = size / unitsPerEm;
  const polys = glyph.contours.map((c) => flattenContour(c)).filter((p) => p.length >= 3);
  if (polys.length === 0)
    return { ink: 0, width: 0, height: 0, minX: -1, minY: -1, maxX: -1, maxY: -1 };

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  }
  const left = Math.floor(x0 * scale) - 1;
  const bottom = Math.floor(y0 * scale) - 1;
  const width = Math.ceil(x1 * scale) - left + 2;
  const height = Math.ceil(y1 * scale) - bottom + 2;
  if (width <= 0 || height <= 0 || width * height > 4_000_000) {
    return { ink: 0, width: 0, height: 0, minX: -1, minY: -1, maxX: -1, maxY: -1 };
  }

  const covered = new Uint8Array(width * height);
  const xs = [];
  const winds = [];
  for (let py = 0; py < height; py++) {
    for (let s = 0; s < samples; s++) {
      const sy = (bottom + py + (s + 0.5) / samples) / scale;
      xs.length = 0;
      winds.length = 0;
      for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i];
          const b = poly[(i + 1) % poly.length];
          if (a.y === b.y) continue;
          const lo = Math.min(a.y, b.y);
          const hi = Math.max(a.y, b.y);
          if (sy < lo || sy >= hi) continue;
          xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
          winds.push(b.y > a.y ? 1 : -1);
        }
      }
      if (xs.length === 0) continue;
      const order = xs.map((_, i) => i).sort((i, j) => xs[i] - xs[j]);
      let winding = 0;
      for (let k = 0; k < order.length - 1; k++) {
        winding += winds[order[k]];
        if (winding === 0) continue;
        const from = Math.max(0, Math.round(xs[order[k]] * scale) - left);
        const to = Math.min(width - 1, Math.round(xs[order[k + 1]] * scale) - left);
        for (let px = from; px <= to; px++) covered[py * width + px] = 1;
      }
    }
  }

  let ink = 0;
  let minX = -1;
  let minY = -1;
  let maxX = -1;
  let maxY = -1;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (!covered[py * width + px]) continue;
      ink++;
      if (minX < 0 || px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (minY < 0 || py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  return { ink, width, height, minX, minY, maxX, maxY };
}

// ── Classification ────────────────────────────────────────────────────────────────────────────

/** True when a contour is an axis-aligned rectangle drawn with four on-curve corners. */
export function isRectangleContour(points) {
  if (points.length !== 4 || points.some((p) => !p.onCurve)) return false;
  const xs = new Set(points.map((p) => p.x));
  const ys = new Set(points.map((p) => p.y));
  if (xs.size !== 2 || ys.size !== 2) return false;
  return [...xs].every((x) => points.filter((p) => p.x === x).length === 2);
}

/**
 * The contours that make a shaping engine discard the whole glyph: exactly two points, the first
 * off-curve. Measured, not inferred — see this file's header.
 */
export function findDroppingContours(glyph) {
  const out = [];
  glyph.contours.forEach((c, index) => {
    if (c.length === 2 && !c[0].onCurve) out.push({ index, points: c });
  });
  return out;
}

/**
 * Classify one glyph: `null` when it is sound, otherwise `{ kind, detail }`.
 *
 * `kind` is one of `blank` (rasterised to no ink), `placeholder-box` (the font's box-shaped
 * filler), or `dropped` (a valid outline the renderer refuses — see the header).
 */
export function classifyGlyph(glyph, unitsPerEm, { size = 64 } = {}) {
  const dropping = findDroppingContours(glyph);
  if (dropping.length > 0) {
    const where = dropping
      .map((d) => `contour ${d.index} ${d.points.map((p) => `(${p.x},${p.y})`).join('→')}`)
      .join('; ');
    return {
      kind: 'dropped',
      detail:
        `${dropping.length} two-point contour(s) starting off-curve — Chromium/Skia discards the ` +
        `whole glyph and draws a hole at its advance width: ${where}`,
    };
  }
  if (
    glyph.contours.length > 0 &&
    glyph.contours.length <= 2 &&
    glyph.contours.every((c) => isRectangleContour(c))
  ) {
    return {
      kind: 'placeholder-box',
      detail: `${glyph.contours.length} rectangular contour(s) — the font's box-shaped filler, not a word`,
    };
  }
  const { ink } = rasteriseGlyph(glyph, unitsPerEm, size);
  if (ink === 0) {
    return {
      kind: 'blank',
      detail: `rasterised at ${size}px and put down no ink (${glyph.contours.length} contour(s))`,
    };
  }
  return null;
}

// ── The gate ──────────────────────────────────────────────────────────────────────────────────

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything the gate reads, named once so `missingRoots` can report them by repo-relative path. */
const ROOTS = {
  patchedFonts: 'apps/expo/assets/fonts/qpc-patched',
  layouts: 'packages/quran-data/data/mushaf-layout',
  appRegistry: 'apps/expo/src/lib/mushafFonts.ts',
  pipelineRegistry: 'scripts/prepare-fonts.ts',
};

/** Pages in the book — the layout population, and the `--corpus` sweep's expected size. */
export const TOTAL_MUSHAF_PAGES = 604;

const pageFontName = (page) => `QCF_P${String(page).padStart(3, '0')}.woff2`;
const pageLayoutName = (page) => `page-${String(page).padStart(3, '0')}.json`;

/** Repo-relative names of the roots that are absent — the first fail-closed floor. */
export function missingRoots(root = repoRoot) {
  return Object.values(ROOTS).filter((rel) => !existsSync(join(root, rel)));
}

/**
 * The patched pages present ON DISK, from the filenames themselves.
 *
 * ⚠️ Derived, never hand-listed: a hand-kept census is exactly how two repaired fonts came to sit
 * in this directory wired to nothing at all.
 */
export function patchedPagesOnDisk(root = repoRoot) {
  const dir = join(root, ROOTS.patchedFonts);
  return readdirSync(dir)
    .filter((f) => /^QCF_P\d{3}\.woff2$/.test(f))
    .map((f) => Number(f.slice(5, 8)))
    .sort((a, b) => a - b);
}

/**
 * Read one declaration out of a source file, failing CLOSED when the shape moved.
 *
 * A registry check that silently matches nothing is worse than no check: it reports agreement
 * between a list it read and a list it invented. Every caller here throws on a miss.
 */
function declaredNumbers(source, re, what) {
  const m = re.exec(source);
  if (m === null)
    throw new Error(
      `could not find ${what} — the declaration moved, so this gate can no longer check it`
    );
  const nums = [...m[1].matchAll(/\d+/g)].map((n) => Number(n[0]));
  if (nums.length === 0)
    throw new Error(`${what} parsed as an EMPTY list — refusing to call that agreement`);
  return nums.sort((a, b) => a - b);
}

/**
 * The three registries that have to name the same pages, read from their own files.
 *
 * `PATCHED_FONTS` (the `require()` map the app actually loads from) is read separately from
 * `PATCHED_FONT_PAGES` (the list its test pins) on purpose — they are two declarations and only
 * one of them puts bytes on screen.
 */
export function readRegistries(root = repoRoot) {
  const app = readFileSync(join(root, ROOTS.appRegistry), 'utf8');
  const pipeline = readFileSync(join(root, ROOTS.pipelineRegistry), 'utf8');

  const requireMap = /const PATCHED_FONTS:\s*Record<number,\s*number>\s*=\s*\{([\s\S]*?)\n\};/.exec(
    app
  );
  if (requireMap === null)
    throw new Error('could not find PATCHED_FONTS in mushafFonts.ts — the declaration moved');
  const entries = [...requireMap[1].matchAll(/(\d+):\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)];
  if (entries.length === 0)
    throw new Error('PATCHED_FONTS parsed as an EMPTY map — refusing to call that agreement');
  const mismatched = entries
    .filter(([, page, path]) => basename(path) !== pageFontName(Number(page)))
    .map(([, page, path]) => `PATCHED_FONTS[${page}] requires ${basename(path)}`);

  return {
    requireMap: entries.map(([, page]) => Number(page)).sort((a, b) => a - b),
    requireMismatches: mismatched,
    exportedList: declaredNumbers(
      app,
      /export const PATCHED_FONT_PAGES\s*=\s*\[([^\]]*)\]/,
      'PATCHED_FONT_PAGES in mushafFonts.ts'
    ),
    pipelineSet: declaredNumbers(
      pipeline,
      /const PATCHED_PAGES\s*=\s*new Set\(\[([^\]]*)\]\)/,
      'PATCHED_PAGES in prepare-fonts.ts'
    ),
  };
}

/** Human-readable disagreements between the disk population and the two registries. */
export function registryProblems(root = repoRoot) {
  const disk = patchedPagesOnDisk(root);
  const { requireMap, requireMismatches, exportedList, pipelineSet } = readRegistries(root);
  const problems = [...requireMismatches];
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const show = (xs) => `[${xs.join(', ')}]`;
  if (!same(disk, requireMap)) {
    problems.push(
      `qpc-patched/ holds ${show(disk)} but mushafFonts.ts PATCHED_FONTS loads ${show(requireMap)} — ` +
        'a patched font the app never requires is a repair that does not ship'
    );
  }
  if (!same(disk, exportedList)) {
    problems.push(
      `qpc-patched/ holds ${show(disk)} but PATCHED_FONT_PAGES says ${show(exportedList)}`
    );
  }
  if (!same(disk, pipelineSet)) {
    problems.push(
      `qpc-patched/ holds ${show(disk)} but prepare-fonts.ts PATCHED_PAGES says ${show(pipelineSet)} — ` +
        'the CDN would be uploaded an unpatched copy of the difference'
    );
  }
  return problems;
}

/**
 * Every codepoint one page's layout asks the page font to draw, mapped to the word that asks.
 *
 * The space between the two groups of a merged verse-end word is skipped — it is a real space,
 * not a glyph. A page that yields NOTHING is a floor violation, not an empty result: it means the
 * layout file parsed but said nothing, and a scan over it would report clean having checked zero.
 */
export function referencedCodepoints(layout) {
  const refs = new Map();
  for (const line of layout.lines ?? []) {
    for (const word of line.words ?? []) {
      for (const ch of word.qpcV1 ?? '') {
        const cp = ch.codePointAt(0);
        if (cp !== 0x20 && !refs.has(cp)) refs.set(cp, word.location);
      }
    }
  }
  return refs;
}

const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * Scan a set of pages, resolving each page's font from the patched overlay first and the corpus
 * (when given) second — the same precedence `lib/mushafFonts.ts` and `prepare-fonts.ts` use, so
 * what is scanned is what a reader gets.
 *
 * @returns {{hits:Array<object>, slots:number, pages:number, unnecessaryPatches:number[]}}
 */
export function runGlyphScan({ root = repoRoot, pages = null, corpusDir = null } = {}) {
  const patchedDir = join(root, ROOTS.patchedFonts);
  const layoutDir = join(root, ROOTS.layouts);
  const scanned = pages ?? patchedPagesOnDisk(root);
  if (scanned.length === 0) throw new Error('scanned zero pages — the population is empty');

  const hits = [];
  const unnecessaryPatches = [];
  let slots = 0;

  for (const page of scanned) {
    const layoutPath = join(layoutDir, pageLayoutName(page));
    if (!existsSync(layoutPath))
      throw new Error(`layout for page ${page} is missing (${pageLayoutName(page)})`);
    const refs = referencedCodepoints(JSON.parse(readFileSync(layoutPath, 'utf8')));
    if (refs.size === 0)
      throw new Error(
        `page ${page}'s layout references zero glyphs — a scan over it would check nothing`
      );

    const patchedPath = join(patchedDir, pageFontName(page));
    const isPatched = existsSync(patchedPath);
    const fontPath = isPatched
      ? patchedPath
      : corpusDir === null
        ? null
        : join(corpusDir, pageFontName(page));
    if (fontPath === null || !existsSync(fontPath)) {
      throw new Error(
        `no font for page ${page} — pass --corpus <dir> to scan pages the repo does not bundle`
      );
    }
    const font = parseFont(readFileSync(fontPath));

    for (const [cp, location] of refs) {
      slots++;
      const gid = font.cmap.get(cp);
      if (gid === undefined) {
        hits.push({
          page,
          cp,
          location,
          kind: 'unmapped',
          detail: 'the page font has no glyph for this codepoint',
        });
        continue;
      }
      const verdict = classifyGlyph(font.glyphs[gid], font.unitsPerEm);
      if (verdict !== null) hits.push({ page, cp, location, ...verdict });
    }

    // A patch earns its place only while the upstream copy it overrides is still broken.
    if (isPatched && corpusDir !== null) {
      const upstreamPath = join(corpusDir, pageFontName(page));
      if (existsSync(upstreamPath)) {
        const upstream = parseFont(readFileSync(upstreamPath));
        const stillBroken = [...refs.keys()].some((cp) => {
          const gid = upstream.cmap.get(cp);
          return (
            gid === undefined || classifyGlyph(upstream.glyphs[gid], upstream.unitsPerEm) !== null
          );
        });
        if (!stillBroken) unnecessaryPatches.push(page);
      }
    }
  }

  return { hits, slots, pages: scanned.length, unnecessaryPatches };
}

function main(argv = process.argv.slice(2)) {
  const at = argv.indexOf('--corpus');
  const corpusDir = at === -1 ? null : argv[at + 1];
  if (
    at !== -1 &&
    (corpusDir === undefined || !existsSync(corpusDir) || !statSync(corpusDir).isDirectory())
  ) {
    console.error(
      `lint:mushaf-glyphs — FAIL: --corpus needs a directory of QCF_P{NNN}.woff2 files, got ${corpusDir ?? '(nothing)'}.`
    );
    // ⚠️ `process.exitCode` + `return`, NEVER `process.exit()` — Node's stderr is asynchronous for
    // a pipe on POSIX and `process.exit()` does not drain it, so under `turbo` the hit list is
    // truncated exactly on the run with the most output. And every one of these assignments is
    // load-bearing alone: with any single one deleted the gate prints its whole FAIL block and
    // exits 0, which no output assertion can see. The self-test spawns this script and asserts
    // `status`.
    process.exitCode = 1;
    return;
  }

  const missing = missingRoots();
  if (missing.length > 0) {
    console.error(
      `lint:mushaf-glyphs — FAIL: required scan root(s) missing: ${missing.join(', ')}.\n` +
        'The gate refuses to pass when the fonts, the layouts or the registries cannot be read (fail-closed).'
    );
    process.exitCode = 1;
    return;
  }

  let onDisk;
  try {
    onDisk = patchedPagesOnDisk();
  } catch (err) {
    console.error(`lint:mushaf-glyphs — FAIL: ${err?.message ?? err}`);
    process.exitCode = 1;
    return;
  }
  if (onDisk.length === 0) {
    console.error(
      'lint:mushaf-glyphs — FAIL: found zero patched page fonts in ' +
        `${ROOTS.patchedFonts}. The bundled overlay is the only font corpus in this repo; with it\n` +
        'empty the gate would report OK having rasterised nothing.'
    );
    process.exitCode = 1;
    return;
  }

  let problems;
  try {
    problems = registryProblems();
  } catch (err) {
    console.error(`lint:mushaf-glyphs — FAIL: ${err?.message ?? err}`);
    process.exitCode = 1;
    return;
  }
  if (problems.length > 0) {
    console.error('lint:mushaf-glyphs — FAIL: the patched-font registries disagree:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  const pages =
    corpusDir === null ? onDisk : Array.from({ length: TOTAL_MUSHAF_PAGES }, (_, i) => i + 1);
  let result;
  try {
    result = runGlyphScan({ pages, corpusDir });
  } catch (err) {
    console.error(`lint:mushaf-glyphs — FAIL: ${err?.message ?? err}`);
    process.exitCode = 1;
    return;
  }

  if (result.hits.length > 0) {
    console.error(
      'lint:mushaf-glyphs — FAIL: the layout asks these page fonts for glyphs a reader would not\n' +
        "see as words. A `placeholder-box` means the LAYOUT ran off the end of the page's glyph\n" +
        'ladder (fix `scripts/generate-mushaf-layout.ts`); `dropped` and `blank` mean the FONT is\n' +
        'defective (patch it into assets/fonts/qpc-patched/ and wire all three registries):\n'
    );
    for (const h of result.hits) {
      console.error(`  page ${h.page} ${hex(h.cp)} (${h.location}) — ${h.kind}: ${h.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.unnecessaryPatches.length > 0) {
    console.error(
      'lint:mushaf-glyphs — FAIL: these pages ship a patched font whose UPSTREAM copy is already\n' +
        'sound. A patch with no remaining reason is a private fork of a Quran font that nothing\n' +
        `justifies — delete it and its three registry entries: ${result.unnecessaryPatches.join(', ')}`
    );
    process.exitCode = 1;
    return;
  }

  const scope =
    corpusDir === null
      ? `${result.pages} bundled patched page(s); the other ${TOTAL_MUSHAF_PAGES - result.pages} come from the CDN — sweep them with --corpus`
      : `all ${result.pages} pages`;
  console.log(`lint:mushaf-glyphs — OK (${result.slots} referenced glyph slot(s) across ${scope})`);
}

// `onUnknown: 'run'` — an offline gate with no side effects: the unsafe outcome is skipping
// SILENTLY (a fail-closed gate reporting success having checked nothing), so warn loudly and run.
if (isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'lint:mushaf-glyphs' })) main();
