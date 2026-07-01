/**
 * GET /api/click?u=<target>&d=yyyy-mm-dd&k=cta|link
 *
 * OUR OWN click-tracking redirector — links in the newsletter (src/email/template.ts)
 * point here; we count the click, then 302 to the real target. Same reason as the
 * open pixel (api/open.ts): Resend's native link rewriting never recorded a click
 * for our custom broadcasts. Increments the same Upstash counters /api/stats and
 * the admin dashboard read: `clicks` for every tracked click, plus `ctaClicks` for
 * the "Earn more cash" app button (k=cta), matching the old webhook's semantics.
 *
 * NOT an open redirect: we only redirect to an allowlisted host (ours + the
 * newsletter recommendation). Anything else falls back to the homepage, uncounted.
 *
 * Self-contained ON PURPOSE: only node built-ins + global fetch — no npm and no
 * cross-directory imports (Vercel functions don't reliably bundle them; mirrors
 * api/open.ts, api/resend-webhook.ts, api/confirm.ts).
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

const SAFE_FALLBACK = 'https://getsurvey.club';
// Hosts we actually link to. Matches the exact host or any subdomain of it.
const ALLOWED_HOSTS = ['getsurvey.club', 'recs.page'];

/** yyyy-mm-dd in US Eastern — same bucketing the rest of the newsletter uses. */
function todayInET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

function isAllowed(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return ALLOWED_HOSTS.some(
    (h) => u.hostname === h || u.hostname.endsWith(`.${h}`),
  );
}

/** Bump the day's click counters. Never throws — the redirect must always happen. */
async function recordClick(date: string, isCta: boolean): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  const key = `nl:stats:${date}`;
  const commands = isCta
    ? [
        ['HINCRBY', key, 'clicks', 1],
        ['HINCRBY', key, 'ctaClicks', 1],
      ]
    : [['HINCRBY', key, 'clicks', 1]];
  try {
    await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
  } catch {
    /* a Redis hiccup must never break the user's click-through */
  }
}

export default async function handler(req: any, res: any) {
  const rawD = String(req.query?.d || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawD) ? rawD : todayInET();
  const isCta = String(req.query?.k || '') === 'cta';

  let dest = SAFE_FALLBACK;
  let valid = false;
  try {
    const u = new URL(String(req.query?.u || ''));
    if (isAllowed(u)) {
      dest = u.toString();
      valid = true;
    }
  } catch {
    /* malformed target → safe fallback, uncounted */
  }

  if (valid) await recordClick(date, isCta);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.statusCode = 302;
  res.setHeader('Location', dest);
  return res.end();
}
