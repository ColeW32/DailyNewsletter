/**
 * Upstash Redis counter store for OUR newsletter's open/click analytics.
 *
 * One hash per ET calendar day (`nl:stats:<yyyy-mm-dd>`) with `opens`, `clicks`
 * and `ctaClicks` fields, bumped atomically via HINCRBY. This is the
 * self-contained replacement for the open/click counters that used to live in
 * the SurveyClub backend's Firestore — the Resend webhook writes here, and
 * /api/stats reads it back for the admin dashboard.
 *
 * Reads from Vercel's Upstash integration env vars (KV_REST_API_* — the legacy
 * Vercel KV names the Upstash Marketplace integration injects) and falls back to
 * the UPSTASH_REDIS_REST_* names if the integration was wired up directly.
 */
import { Redis } from '@upstash/redis';

const url = (
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  ''
).trim();
const token = (
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  ''
).trim();

// Lazy singleton: importing this module must never throw at cold start (an
// unrelated function importing it shouldn't crash if Redis isn't wired yet).
let client: Redis | null = null;
function redis(): Redis {
  if (!url || !token) {
    throw new Error(
      'Upstash Redis is not configured (set KV_REST_API_URL + KV_REST_API_TOKEN).',
    );
  }
  if (!client) client = new Redis({ url, token });
  return client;
}

export type DailyCounts = { opens: number; clicks: number; ctaClicks: number };

const dayKey = (date: string): string => `nl:stats:${date}`;

/** Atomically bump one ET-day's counters. Zero/absent fields are skipped. */
export async function incrementDailyStats(
  date: string,
  fields: Partial<DailyCounts>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, by]) => Boolean(by));
  if (entries.length === 0) return;
  const pipe = redis().pipeline();
  for (const [field, by] of entries) {
    pipe.hincrby(dayKey(date), field, by as number);
  }
  await pipe.exec();
}

/** Read counters for the given ET dates (one HGETALL each, pipelined). */
export async function getDailyStats(
  dates: string[],
): Promise<Record<string, DailyCounts>> {
  const out: Record<string, DailyCounts> = {};
  if (dates.length === 0) return out;

  const pipe = redis().pipeline();
  for (const d of dates) pipe.hgetall(dayKey(d));
  const rows = (await pipe.exec()) as Array<Record<string, unknown> | null>;

  dates.forEach((d, i) => {
    const row = rows[i] ?? {};
    out[d] = {
      opens: Number(row.opens) || 0,
      clicks: Number(row.clicks) || 0,
      ctaClicks: Number(row.ctaClicks) || 0,
    };
  });
  return out;
}
