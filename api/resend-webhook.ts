/**
 * POST /api/resend-webhook
 *
 * Resend webhook receiver for OUR newsletter (Survey Club Daily). Verifies the
 * Resend/Svix signature (RESEND_WEBHOOK_SIGNING_SECRET) and records open/click
 * aggregates in Upstash Redis, keyed by the ET date the event arrives — the same
 * day buckets /api/stats reads back for the admin dashboard.
 *
 * Fully self-contained: this never calls api.getsurvey.club. Configure the
 * webhook in Resend to point here (e.g. https://daily.getsurvey.club/api/resend-webhook)
 * subscribed to email.opened + email.clicked.
 */
import { Webhook } from 'svix';
import { incrementDailyStats } from '../src/stats/store';
import { todayInET } from '../src/utils/date';

const SIGNING_SECRET = (process.env.RESEND_WEBHOOK_SIGNING_SECRET || '').trim();

// The newsletter's "Open App" CTA carries this marker (see src/email/template.ts)
// so app-button clicks are distinguishable from footer/content links.
const CTA_MARKER = 'utm_campaign=open_app';

/**
 * Svix verifies the EXACT bytes Resend signed, so we need the raw body — never a
 * re-serialized object. Prefer the untouched request stream; fall back to the
 * platform-parsed body only if the stream was already drained.
 */
async function getRawBody(req: any): Promise<string> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  } catch {
    /* stream unavailable — fall through to the parsed body */
  }
  if (typeof req.body === 'string') return req.body;
  if (req.body != null) return JSON.stringify(req.body);
  return '';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SIGNING_SECRET) {
    return res
      .status(500)
      .json({ error: 'Webhook signing secret is not configured.' });
  }

  const raw = await getRawBody(req);

  let event: any;
  try {
    event = new Webhook(SIGNING_SECRET).verify(raw, {
      'svix-id': String(req.headers['svix-id'] || ''),
      'svix-timestamp': String(req.headers['svix-timestamp'] || ''),
      'svix-signature': String(req.headers['svix-signature'] || ''),
    });
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const type = String(event?.type || '');
  const data = (event?.data || {}) as Record<string, any>;
  // Bucket by the day the event arrives (matches the prior backend behavior).
  const date = todayInET();

  try {
    if (type === 'email.opened') {
      await incrementDailyStats(date, { opens: 1 });
      return res.status(200).json({ ok: true, recorded: 'open' });
    }
    if (type === 'email.clicked') {
      const link = String(data?.click?.link || data?.link || '');
      const isCta = link.includes(CTA_MARKER);
      await incrementDailyStats(
        date,
        isCta ? { clicks: 1, ctaClicks: 1 } : { clicks: 1 },
      );
      return res
        .status(200)
        .json({ ok: true, recorded: isCta ? 'cta-click' : 'click' });
    }
  } catch (err) {
    // A Redis hiccup must not make Resend retry-storm us — ack and move on.
    return res.status(200).json({ ok: true, stored: false, error: String(err) });
  }

  // delivered / bounced / complained / contact.* — acknowledge and ignore.
  return res.status(200).json({ ok: true, ignored: type || 'unknown' });
}
