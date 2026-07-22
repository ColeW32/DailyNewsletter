/**
 * POST /api/resend-webhook
 *
 * Resend webhook receiver for OUR newsletter (Earner's Club Daily). Verifies the
 * Resend/Svix signature (RESEND_WEBHOOK_SIGNING_SECRET) and records open/click
 * aggregates in Upstash Redis (via its REST API), keyed by the ET date the
 * event arrives.
 *
 * Self-contained ON PURPOSE: only node built-ins + global fetch — no npm
 * imports and no cross-directory imports, because Vercel's serverless functions
 * don't reliably bundle either (importing ../src here returned 500s in prod).
 * This mirrors the dependency surface of the working confirm.ts / subscribe.ts.
 *
 * Point the Resend webhook at https://daily-newsletter-one.vercel.app/api/resend-webhook
 * subscribed to email.opened + email.clicked.
 */
import crypto from 'node:crypto';

const SIGNING_SECRET = (process.env.RESEND_WEBHOOK_SIGNING_SECRET || '').trim();
const KV_URL = (
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  ''
)
  .trim()
  .replace(/\/$/, '');
const KV_TOKEN = (
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  ''
).trim();

// The "Open App" CTA carries this marker (src/email/template.ts) so app-button
// clicks are distinguishable from footer/content links.
const CTA_MARKER = 'utm_campaign=open_app';

/** yyyy-mm-dd in US Eastern — same bucketing the rest of the newsletter uses. */
function todayInET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

/** Read the untouched request bytes — Svix signs exact bytes, never re-serialize. */
async function getRawBody(req: any): Promise<string> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  } catch {
    /* stream already drained — fall through to the parsed body */
  }
  if (typeof req.body === 'string') return req.body;
  if (req.body != null) return JSON.stringify(req.body);
  return '';
}

/**
 * Verify a Svix/Resend signature with node:crypto (no svix package).
 * Scheme: base64( HMAC-SHA256( base64decode(secret without whsec_),
 * `${id}.${timestamp}.${body}` ) ), matched against any "v1,<sig>" entry in the
 * space-separated svix-signature header.
 */
function verifySignature(headers: any, rawBody: string): boolean {
  const id = String(headers['svix-id'] || '');
  const ts = String(headers['svix-timestamp'] || '');
  const sigHeader = String(headers['svix-signature'] || '');
  if (!id || !ts || !sigHeader || !SIGNING_SECRET) return false;

  const key = Buffer.from(SIGNING_SECRET.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${ts}.${rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  return sigHeader.split(' ').some((entry) => {
    const sig = entry.split(',')[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

/** Run Redis commands through Upstash's REST pipeline endpoint. */
async function upstash(commands: Array<Array<string | number>>): Promise<void> {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash REST env not configured.');
  const r = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
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
  if (!verifySignature(req.headers, raw)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const type = String(event?.type || '');
  const data = (event?.data || {}) as Record<string, any>;
  const key = `nl:stats:${todayInET()}`;

  try {
    if (type === 'email.opened') {
      await upstash([['HINCRBY', key, 'opens', 1]]);
      return res.status(200).json({ ok: true, recorded: 'open' });
    }
    if (type === 'email.clicked') {
      const link = String(data?.click?.link || data?.link || '');
      const isCta = link.includes(CTA_MARKER);
      await upstash(
        isCta
          ? [
              ['HINCRBY', key, 'clicks', 1],
              ['HINCRBY', key, 'ctaClicks', 1],
            ]
          : [['HINCRBY', key, 'clicks', 1]],
      );
      return res
        .status(200)
        .json({ ok: true, recorded: isCta ? 'cta-click' : 'click' });
    }
  } catch (err) {
    // Don't make Resend retry-storm us on a Redis hiccup — ack and move on.
    return res
      .status(200)
      .json({ ok: true, stored: false, error: String(err) });
  }

  // delivered / bounced / complained / contact.* — acknowledge and ignore.
  return res.status(200).json({ ok: true, ignored: type || 'unknown' });
}
