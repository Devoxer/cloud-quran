import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db';
import {
  account,
  audioPositions,
  bookmarks,
  preferences,
  readingPositions,
  session,
  user,
} from '../db/schema';
import type { Bindings } from '../index';
import type { AuthVariables } from '../middleware/auth';
import { trackWrite } from '../middleware/write-guard';

export const userRoutes = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
  .delete('/data', async (c) => {
    const userId = c.get('user').id;
    const db = createDb(c.env.DB);

    // Delete app data
    trackWrite(c);
    await db.delete(readingPositions).where(eq(readingPositions.userId, userId));
    trackWrite(c);
    await db.delete(bookmarks).where(eq(bookmarks.userId, userId));
    trackWrite(c);
    await db.delete(preferences).where(eq(preferences.userId, userId));
    trackWrite(c);
    await db.delete(audioPositions).where(eq(audioPositions.userId, userId));

    // Delete auth data (sessions, accounts, then user)
    trackWrite(c);
    await db.delete(session).where(eq(session.userId, userId));
    trackWrite(c);
    await db.delete(account).where(eq(account.userId, userId));
    trackWrite(c);
    await db.delete(user).where(eq(user.id, userId));

    return c.json({ ok: true });
  })
  .get('/export', async (c) => {
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

    const [userData] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: userData
        ? { email: userData.email, name: userData.name, createdAt: userData.createdAt.getTime() }
        : null,
      data: {
        position: position ?? null,
        bookmarks: userBookmarks,
        preferences: userPrefs ?? null,
        audio: audioPos ?? null,
      },
    };

    return c.json(exportData, 200, {
      'Content-Disposition': 'attachment; filename="cloud-quran-export.json"',
    });
  });
