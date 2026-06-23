/**
 * GET /api/stats?token=...
 *
 * Token-gated stats for the Survey Club admin dashboard (proxied through the
 * SurveyClub backend, never called from a browser). Returns the number of
 * CONFIRMED subscribers — contacts in the Resend Audience that aren't
 * unsubscribed. Contacts only enter the audience after double opt-in
 * (see confirm.ts), so audience membership == confirmed.
 */
import { getDailyStats } from '../src/stats/store';
import { recentDatesET } from '../src/utils/date';

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const AUDIENCE_ID = (process.env.RESEND_AUDIENCE_ID || '').trim();

// Shared with SurveyClub-Backend (newsletters.service.ts DAILY_STATS_TOKEN).
const STATS_TOKEN = 'ad0e35507ae7bb925c715ebdb1cd87d4d4749081';
// Days of open/click history returned for the dashboard's daily series.
const STATS_WINDOW_DAYS = 14;

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

    // Daily open/click counts come from our own Upstash store (written by the
    // Resend webhook). Degrade to an empty series if Redis is unavailable — the
    // subscriber count must still return.
    let days: Array<{
      date: string;
      opens: number;
      clicks: number;
      ctaClicks: number;
    }> = [];
    try {
      const dates = recentDatesET(STATS_WINDOW_DAYS);
      const byDate = await getDailyStats(dates);
      days = dates.map((date) => ({
        date,
        ...(byDate[date] ?? { opens: 0, clicks: 0, ctaClicks: 0 }),
      }));
    } catch {
      days = [];
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
