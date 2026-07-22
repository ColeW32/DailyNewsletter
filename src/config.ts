import dotenv from 'dotenv';

// Load .env and let it WIN over any ambient vars. Some environments pre-set
// ANTHROPIC_API_KEY="" (empty), which dotenv would otherwise refuse to override.
dotenv.config({ override: true });

/** Read a required env var, throwing a friendly error if it's missing. */
function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `Missing required env var: ${name}. Add it to your .env file (see .env.example).`,
    );
  }
  return v;
}

/**
 * Central config. Required keys are lazy getters so that commands which don't
 * need them (e.g. `--collect-only`) can run without every key being set.
 */
export const config = {
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  resendApiKey: () => required('RESEND_API_KEY'),
  // .trim() everything: GitHub Variables/Secrets and .env values can carry a stray
  // trailing newline — and Resend 500s on e.g. an audience_id with a "\n" in it.
  from: (process.env.NEWSLETTER_FROM ?? "Earner's Club Daily <daily@daily.getsurvey.club>").trim(),
  to: (process.env.NEWSLETTER_TO ?? 'jason@abstrakt.group').trim(),
  adminEmail: (process.env.ADMIN_EMAIL ?? process.env.NEWSLETTER_TO ?? 'jason@abstrakt.group').trim(),
  audienceId: process.env.RESEND_AUDIENCE_ID?.trim(),
  mailingAddress: (process.env.MAILING_ADDRESS ?? '3423 Piedmont Rd NE, Atlanta, GA 30305').trim(),
  // 'self' = email NEWSLETTER_TO (test mode); 'broadcast' = Resend Broadcast to the Audience.
  sendMode: (process.env.SEND_MODE ?? 'self').trim(),
  polygonApiKey: process.env.POLYGON_API_KEY?.trim(),
  fmpApiKey: process.env.FMP_API_KEY?.trim(),
};
