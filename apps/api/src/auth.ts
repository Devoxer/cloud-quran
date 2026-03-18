import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins/anonymous';
import { magicLink } from 'better-auth/plugins/magic-link';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import type { Bindings } from './index';

function escapeHtmlAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendMagicLinkEmail(resendApiKey: string, email: string, url: string) {
  // DO NOT log email or url — PII exposure in Workers logs
  const safeUrl = escapeHtmlAttr(url);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Cloud Quran <noreply@cloudquran.com>',
      to: email,
      subject: 'Sign in to Cloud Quran',
      html: `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#1a1a1a">
<h2 style="margin:0 0 16px">Cloud Quran</h2>
<p>Tap the button below to sign in:</p>
<a href="${safeUrl}" style="display:inline-block;background:#2E7D5A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Sign In</a>
<p style="color:#6b6b6b;font-size:13px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
</body></html>`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status}`);
  }
}

export function createAuth(env: Bindings) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    basePath: '/api/auth',
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      apple: {
        clientId: env.APPLE_CLIENT_ID,
        clientSecret: env.APPLE_CLIENT_SECRET,
      },
    },
    plugins: [
      anonymous(),
      magicLink({
        sendMagicLink: async (magicLinkData) => {
          await sendMagicLinkEmail(env.RESEND_API_KEY, magicLinkData.email, magicLinkData.url);
        },
      }),
    ],
  });
}
