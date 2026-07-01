/**
 * GET /api/open?d=yyyy-mm-dd
 *
 * OUR OWN open-tracking pixel — embedded directly in the newsletter HTML
 * (src/email/template.ts) so we do NOT depend on Resend injecting its pixel into
 * our custom broadcast HTML. (It wasn't: the domain had open_tracking enabled and
 * the tracking CNAME verified, yet real opens recorded were 0/day across the whole
 * list for weeks. We control this pixel, so it can't silently fail to be injected.)
 *
 * Returns a 1x1 transparent GIF and increments `nl:stats:<date>` `opens` in the
 * same Upstash Redis store /api/stats reads and the admin dashboard shows. Opens
 * bucket to the SEND date passed in `d` (so they attribute to the issue that was
 * opened); if `d` is missing/malformed we fall back to today (ET).
 *
 * Self-contained ON PURPOSE: only node built-ins + global fetch — no npm and no
 * cross-directory imports (Vercel functions don't reliably bundle them; mirrors
 * /api/resend-webhook, /api/confirm).
 *
 * Caveat: like every open pixel, it only fires when the client loads remote
 * images, and shared-URL pixels can be under-counted by Gmail's image proxy
 * (which may serve one cached fetch for many Gmail opens of the same URL). It is
 * still a true open signal and, unlike the Resend pixel, is guaranteed present in
 * every delivered email.
 */
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

// A 1x1 fully-transparent GIF (43 bytes). The canonical tracking-pixel payload.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/** yyyy-mm-dd in US Eastern — same bucketing the rest of the newsletter uses. */
function todayInET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

/** Increment one day's `opens` counter. Never throws — the pixel must always render. */
async function recordOpen(date: string): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['HINCRBY', `nl:stats:${date}`, 'opens', 1]]),
    });
  } catch {
    /* a Redis hiccup must never break the returned image */
  }
}

export default async function handler(req: any, res: any) {
  const raw = String(req.query?.d || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayInET();

  await recordOpen(date);

  // Never let a client/proxy cache the pixel — we want every open to re-fetch.
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Length', String(PIXEL.length));
  return res.status(200).send(PIXEL);
}
