/**
 * The OTP mailer (story 5-5).
 *
 * ⚠️ THE TEMPLATE LIVES HERE, NOT IN THE AUTH CONFIG. `lib/auth.ts`'s `sendVerificationOTP` is one
 * line that delegates to this file. Keeping the copy out of the auth config is what lets the
 * mail body change — wording, a second language, an HTML part — without touching the module that
 * decides who is allowed in.
 *
 * ⚠️ THE SENDING DOMAIN IS LIVE (2026-08-25). `cloudquran.nobleachievements.com` is onboarded to
 * Cloudflare Email Service with all six DNS records in place, and `MAIL_FROM` is
 * `no-reply@cloudquran.nobleachievements.com`. This paragraph asserted the opposite for a while
 * after that landed — that the project owned no domain and the address could not exist — which
 * contradicted `env.ts`, `wrangler.toml`, the populated secrets store and CLAUDE.md all at once.
 *
 * ⚠️ `MAIL_FROM` LIVES IN `apps/worker/secrets.sops.yaml`, NOT IN A `[vars]` BLOCK. It is not a
 * secret — every recipient reads it — but it travels with the worker's other configuration so one
 * command populates them all. An earlier note here told an operator to add it to `wrangler.toml`,
 * which would have produced two sources of truth for one value.
 *
 * The contract, unchanged:
 *   • development → ALWAYS log the code first, whether or not it can also send.
 *   • `MAIL_FROM` + the `EMAIL` binding present → send for real.
 *   • anything else → throw `MailerNotConfiguredError`, which `lib/auth.ts` turns into a TYPED
 *     failure. Never a silent success: an OTP nobody receives is a sign-in that hangs forever.
 *
 * ⚠️ THE DEVELOPMENT LOG IS UNCONDITIONAL, AND IT USED TO BE AN `else`. That made local behaviour
 * depend on whether a `MAIL_FROM` happened to be in the developer's gitignored `.dev.vars` — so
 * the integration suite, which boots a real `wrangler dev` and reads the code out of its output,
 * passed or failed according to a file it does not control. The moment the sending domain went
 * live and `secrets:push:local` wrote that variable, two green tests turned red on a machine
 * where nothing about the worker had changed. `ENVIRONMENT === 'development'` already licenses
 * printing codes; making it unconditional is what makes the behaviour predictable.
 *
 * Picking the domain is an owner decision; when it is made, set `MAIL_FROM` as a `[vars]` entry
 * (it is not a secret) and delete nothing here.
 */
import type { Bindings } from '../env';

/** Thrown when there is no way to deliver a code. Carries a stable machine code, not prose. */
export class MailerNotConfiguredError extends Error {
  readonly code = 'MAILER_NOT_CONFIGURED';
  constructor() {
    super(
      'Email OTP is unavailable: no sending domain is configured. Set MAIL_FROM and bind EMAIL.'
    );
    this.name = 'MailerNotConfiguredError';
  }
}

/** How long a code is good for, in minutes. Mirrors `lib/auth.ts`'s `expiresIn`; shown to the user. */
export const OTP_TTL_MINUTES = 10;

/** The one place the sign-in code's wording lives. Plain text — no HTML part, nothing to render. */
export function otpMessage(otp: string): { subject: string; text: string } {
  return {
    subject: `${otp} is your Cloud Quran sign-in code`,
    text: [
      `Your Cloud Quran sign-in code is ${otp}.`,
      '',
      `It expires in ${OTP_TTL_MINUTES} minutes and can be used once.`,
      'If you did not ask to sign in, you can ignore this email — nothing has changed.',
    ].join('\n'),
  };
}

/**
 * Deliver a sign-in code, or refuse in a way the caller can type.
 *
 * `env.EMAIL` is Cloudflare Email Service's send binding. `wrangler dev` SIMULATES it (mail is
 * logged, not delivered), so this path is exercised locally and in the integration suite without
 * anything leaving the machine.
 */
export async function sendOtpEmail(
  env: Pick<Bindings, 'EMAIL' | 'MAIL_FROM' | 'ENVIRONMENT'>,
  to: string,
  otp: string
): Promise<void> {
  const { subject, text } = otpMessage(otp);
  const from = env.MAIL_FROM;

  // ⚠️ EXACTLY `development`, never "not production". The gate that shipped in story 5-4 read
  // `!== 'production'` and fell OPEN on an absent or misspelled value; the same mistake here
  // would print sign-in codes into production logs.
  const isDevelopment = env.ENVIRONMENT === 'development';
  if (isDevelopment) console.log(`[dev] email OTP for ${to}: ${otp}`);

  if (env.EMAIL && from) {
    await env.EMAIL.send({ from, to, subject, text });
    return;
  }

  // Development can walk the flow from the log alone; anything else must say it cannot deliver.
  if (isDevelopment) return;

  throw new MailerNotConfiguredError();
}

/** Readiness of the OTP mailer, for `/health`. Says nothing secret — not even the From address. */
export function mailerState(
  env: Pick<Bindings, 'EMAIL' | 'MAIL_FROM' | 'ENVIRONMENT'>
): 'ready' | 'development-log' | 'not-configured' {
  if (env.EMAIL && env.MAIL_FROM) return 'ready';
  if (env.ENVIRONMENT === 'development') return 'development-log';
  return 'not-configured';
}
