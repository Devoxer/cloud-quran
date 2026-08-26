/**
 * The OTP mailer's THREE-WAY gate.
 *
 * Worth pinning because two of its three outcomes are silent by nature: a code printed into a
 * production log leaks a credential to anyone with log access, and a "sent" mail that was never
 * sent is a sign-in that hangs forever with nothing to look at. Only the send path is visible.
 *
 * The environment check is `=== 'development'` rather than `!== 'production'` for the reason
 * story 5-4's review recorded about the dev-token gate: a comparison against the UNSAFE value
 * falls open on an absent, empty or misspelled setting.
 */
import { describe, expect, it, vi } from 'vitest';
import { MailerNotConfiguredError, otpMessage, sendOtpEmail } from './mail';

const binding = () => ({ send: vi.fn().mockResolvedValue({ messageId: 'x' }) });

describe('sendOtpEmail', () => {
  it('sends through the binding when a From address is configured', async () => {
    const EMAIL = binding();
    await sendOtpEmail(
      { EMAIL: EMAIL as never, MAIL_FROM: 'noreply@example.org', ENVIRONMENT: 'production' },
      'reader@example.com',
      '123456'
    );
    expect(EMAIL.send).toHaveBeenCalledTimes(1);
    const sent = EMAIL.send.mock.calls[0][0];
    expect(sent).toMatchObject({ from: 'noreply@example.org', to: 'reader@example.com' });
    expect(sent.text).toContain('123456');
  });

  it('does NOT send when the binding is present but no From address is configured', async () => {
    // The live state of this project: Email Service can only send from an onboarded domain, and
    // there is none. Half-configured must refuse, not send from an address that would bounce.
    const EMAIL = binding();
    await expect(
      sendOtpEmail({ EMAIL: EMAIL as never, ENVIRONMENT: 'production' }, 'r@example.com', '123456')
    ).rejects.toBeInstanceOf(MailerNotConfiguredError);
    expect(EMAIL.send).not.toHaveBeenCalled();
  });

  it('logs the code in development so the local flow is walkable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendOtpEmail({ ENVIRONMENT: 'development' }, 'r@example.com', '424242');
    expect(log.mock.calls.flat().join(' ')).toContain('424242');
    log.mockRestore();
  });

  it('logs the code in development EVEN WHEN it can also send', async () => {
    // ⚠️ The regression this pins: the log used to be the `else` of "can we send", so local
    // behaviour depended on whether a `MAIL_FROM` happened to sit in the developer's gitignored
    // `.dev.vars`. The integration suite reads the code out of `wrangler dev`'s output, so the
    // day the sending domain went live two green tests turned red with no worker change at all.
    const EMAIL = binding();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendOtpEmail(
      { EMAIL: EMAIL as never, MAIL_FROM: 'no-reply@example.org', ENVIRONMENT: 'development' },
      'r@example.com',
      '313131'
    );
    expect(log.mock.calls.flat().join(' ')).toContain('313131');
    expect(EMAIL.send).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('refuses — never logs — on any environment that is not exactly `development`', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const ENVIRONMENT of [undefined, '', 'Development', 'prod', 'production']) {
      await expect(sendOtpEmail({ ENVIRONMENT }, 'r@example.com', '999999')).rejects.toBeInstanceOf(
        MailerNotConfiguredError
      );
    }
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('the refusal carries a machine code, not just prose', async () => {
    await expect(sendOtpEmail({}, 'r@example.com', '1').catch((e) => e.code)).resolves.toBe(
      'MAILER_NOT_CONFIGURED'
    );
  });
});

describe('otpMessage', () => {
  it('puts the code in the subject as well as the body — the phone shows the subject first', () => {
    const { subject, text } = otpMessage('654321');
    expect(subject).toContain('654321');
    expect(text).toContain('654321');
  });
});
