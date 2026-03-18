import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { audioPositions, bookmarks, preferences, readingPositions } from '../db/schema';
import type { Bindings } from '../index';
import type { AuthVariables } from '../middleware/auth';
import { trackWrite } from '../middleware/write-guard';

const pushPayloadSchema = z.object({
  position: z
    .object({
      currentSurah: z.number().int().min(1).max(114),
      currentVerse: z.number().int().min(1),
      currentMode: z.string(),
      lastReadTimestamp: z.number(),
    })
    .optional(),
  bookmarks: z
    .array(
      z.object({
        surahNumber: z.number().int().min(1).max(114),
        verseNumber: z.number().int().min(1),
        createdAt: z.number(),
      }),
    )
    .optional(),
  preferences: z
    .object({
      fontSize: z.number().min(20).max(44),
    })
    .optional(),
  audio: z
    .object({
      selectedReciterId: z.string(),
      playbackSpeed: z.number().min(0.5).max(2.0),
    })
    .optional(),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const syncRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
  .post('/push', async (c) => {
    const body = await c.req.json();
    const parsed = pushPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
    }

    const userId = c.get('user').id;
    const db = createDb(c.env.DB);
    const now = new Date();
    const payload = parsed.data;

    // LWW upsert for reading_positions
    if (payload.position) {
      trackWrite(c);
      const updatedAt = new Date(payload.position.lastReadTimestamp);
      // mode: 'timestamp' stores as Unix seconds — Drizzle auto-converts Date objects
      await db
        .insert(readingPositions)
        .values({
          userId,
          surah: payload.position.currentSurah,
          verse: payload.position.currentVerse,
          page: 1,
          readingMode: payload.position.currentMode,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: readingPositions.userId,
          set: {
            surah: payload.position.currentSurah,
            verse: payload.position.currentVerse,
            readingMode: payload.position.currentMode,
            updatedAt,
          },
          setWhere: sql`excluded.updated_at > ${readingPositions.updatedAt}`,
        });
    }

    // Union-merge for bookmarks — ON CONFLICT DO NOTHING
    if (payload.bookmarks && payload.bookmarks.length > 0) {
      for (const bm of payload.bookmarks) {
        trackWrite(c);
        await db
          .insert(bookmarks)
          .values({
            id: `${userId}:${bm.surahNumber}:${bm.verseNumber}`,
            userId,
            surah: bm.surahNumber,
            verse: bm.verseNumber,
            createdAt: new Date(bm.createdAt),
          })
          .onConflictDoNothing();
      }
    }

    // LWW upsert for preferences
    if (payload.preferences) {
      trackWrite(c);
      await db
        .insert(preferences)
        .values({
          userId,
          fontSize: payload.preferences.fontSize,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: preferences.userId,
          set: {
            fontSize: payload.preferences.fontSize,
            updatedAt: now,
          },
          setWhere: sql`excluded.updated_at > ${preferences.updatedAt}`,
        });
    }

    // LWW upsert for audio_positions
    if (payload.audio) {
      trackWrite(c);
      // surah/verse default to 1 — the push payload only syncs reciter + speed settings,
      // not audio playback position (which is transient per-session state)
      await db
        .insert(audioPositions)
        .values({
          userId,
          reciterId: payload.audio.selectedReciterId,
          surah: 1,
          verse: 1,
          speedRate: payload.audio.playbackSpeed,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: audioPositions.userId,
          set: {
            reciterId: payload.audio.selectedReciterId,
            speedRate: payload.audio.playbackSpeed,
            updatedAt: now,
          },
          setWhere: sql`excluded.updated_at > ${audioPositions.updatedAt}`,
        });
    }

    return c.json({ ok: true, serverTimestamp: now.getTime() });
  })
  .get('/pull', async (c) => {
    const userId = c.get('user').id;
    const db = createDb(c.env.DB);

    const [position] = await db
      .select()
      .from(readingPositions)
      .where(eq(readingPositions.userId, userId))
      .limit(1);

    const userBookmarks = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));

    const [userPrefs] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, userId))
      .limit(1);

    const [audioPos] = await db
      .select()
      .from(audioPositions)
      .where(eq(audioPositions.userId, userId))
      .limit(1);

    const responseData = {
      position: position
        ? {
            currentSurah: position.surah,
            currentVerse: position.verse,
            currentMode: position.readingMode,
            lastReadTimestamp: position.updatedAt.getTime(),
          }
        : null,
      bookmarks: userBookmarks.map((b) => ({
        surahNumber: b.surah,
        verseNumber: b.verse,
        createdAt: b.createdAt.getTime(),
      })),
      preferences: userPrefs
        ? {
            fontSize: userPrefs.fontSize,
            updatedAt: userPrefs.updatedAt.getTime(),
          }
        : null,
      audio: audioPos
        ? {
            selectedReciterId: audioPos.reciterId,
            playbackSpeed: audioPos.speedRate,
            updatedAt: audioPos.updatedAt.getTime(),
          }
        : null,
    };

    // ETag support for 304 Not Modified
    const bodyStr = JSON.stringify(responseData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyStr));
    const etag = `"${[...new Uint8Array(hashBuffer)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16)}"`;

    const ifNoneMatch = c.req.header('If-None-Match');
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    return c.json(responseData, 200, { ETag: etag });
  });
