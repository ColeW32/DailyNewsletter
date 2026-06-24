/**
 * GET /api/stats?token=...
 *
 * Token-gated stats for the Survey Club admin dashboard (proxied through the
 * SurveyClub backend, never called from a browser). Returns the CONFIRMED
 * subscriber count (Resend Audience — membership == confirmed, since contacts
 * only join after double opt-in; see confirm.ts) plus a 14-day open/click
 * series read from our Upstash Redis store (written by /api/resend-webhook).
 *
 * Self-contained ON PURPOSE: only global fetch + node built-ins — no npm or
 * cross-directory imports (Vercel functions don't reliably bundle them; see
 * /api/resend-webhook).
 */
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const AUDIENCE_ID = (process.env.RESEND_AUDIENCE_ID || '').trim();
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

// Shared with SurveyClub-Backend (newsletters.service.ts DAILY_STATS_TOKEN).
const STATS_TOKEN = 'ad0e35507ae7bb925c715ebdb1cd87d4d4749081';
const STATS_WINDOW_DAYS = 30;

type DayStat = { date: string; opens: number; clicks: number; ctaClicks: number };

/** The last `n` dates as yyyy-mm-dd (ET), most recent first. */
function recentDatesET(n: number): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(fmt.format(new Date(Date.now() - i * 86_400_000)));
  }
  return out;
}

const zeros = (dates: string[]): DayStat[] =>
  dates.map((date) => ({ date, opens: 0, clicks: 0, ctaClicks: 0 }));

/** Read each day's counters from Upstash via the REST pipeline endpoint. */
async function readDailyStats(dates: string[]): Promise<DayStat[]> {
  if (!KV_URL || !KV_TOKEN || dates.length === 0) return zeros(dates);
  const r = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dates.map((d) => ['HGETALL', `nl:stats:${d}`])),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  // Each pipeline result is { result: [field, val, field, val, ...] } (HGETALL).
  const rows = (await r.json()) as Array<{ result?: string[] }>;
  return dates.map((date, i) => {
    const flat = Array.isArray(rows[i]?.result) ? (rows[i].result as string[]) : [];
    const h: Record<string, string> = {};
    for (let j = 0; j < flat.length; j += 2) h[flat[j]] = flat[j + 1];
    return {
      date,
      opens: Number(h.opens) || 0,
      clicks: Number(h.clicks) || 0,
      ctaClicks: Number(h.ctaClicks) || 0,
    };
  });
}

export default async function handler(req: any, res: any) {
  if (String(req.query?.token || '') !== STATS_TOKEN) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!RESEND_API_KEY || !AUDIENCE_ID) {
    return res.status(500).json({ error: 'Stats endpoint is not configured.' });
  }

  try {
    const r = await fetch(
      `https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`,
      { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } },
    );
    if (!r.ok) {
      return res.status(502).json({ error: `Resend responded ${r.status}` });
    }
    const payload = (await r.json()) as {
      data?: Array<{ unsubscribed?: boolean }>;
    };
    const contacts = Array.isArray(payload?.data) ? payload.data : [];
    const confirmedSubscribers = contacts.filter(
      (c) => c?.unsubscribed !== true,
    ).length;
    const unsubscribed = contacts.length - confirmedSubscribers;

    // Daily open/click series from our own store; degrade to zeros if Redis is
    // down so the subscriber count always returns.
    const dates = recentDatesET(STATS_WINDOW_DAYS);
    let days: DayStat[];
    try {
      days = await readDailyStats(dates);
    } catch {
      days = zeros(dates);
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res
      .status(200)
      .json({ confirmedSubscribers, unsubscribed, days });
  } catch (err) {
    return res
      .status(502)
      .json({ error: `Stats lookup failed: ${String(err)}` });
  }
}
