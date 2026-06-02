import dotenv from 'dotenv';

// Load .env and let it WIN over any ambient vars. Some environments pre-set
// ANTHROPIC_API_KEY="" (empty), which dotenv would otherwise refuse to override.
dotenv.config({ override: true });

/** Read a required env var, throwing a friendly error if it's missing. */
function required(name: string): string {
  const v = process.env[name];
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
  from: process.env.NEWSLETTER_FROM ?? 'Survey Club Daily <daily@daily.getsurvey.club>',
  to: process.env.NEWSLETTER_TO ?? 'jason@abstrakt.group',
  adminEmail: process.env.ADMIN_EMAIL ?? process.env.NEWSLETTER_TO ?? 'jason@abstrakt.group',
  polygonApiKey: process.env.POLYGON_API_KEY,
  fmpApiKey: process.env.FMP_API_KEY,
};
