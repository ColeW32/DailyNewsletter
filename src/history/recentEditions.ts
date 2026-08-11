import { config } from '../config';

/**
 * "What did we already send?" — continuity memory for the writer.
 *
 * Resend keeps every sent Broadcast (subject + full HTML), so it doubles as our
 * zero-infra archive. Each outgoing email embeds a machine-readable summary of
 * itself (`<!-- ec-meta:BASE64(json) -->`, added in template.ts); here we pull
 * the last few sent broadcasts and decode that summary. Editions sent before
 * the meta comment existed fall back to subject + preheader only.
 *
 * Everything here fails SOFT: any error returns [] — a history hiccup must
 * never block the day's send.
 */

export interface RecentStory {
  section: string;
  headline: string;
  body?: string;
  url?: string;
}

export interface RecentEdition {
  /** yyyy-mm-dd (ET) the edition went out. */
  date: string;
  subject: string;
  preheader?: string;
  /** Individual stories covered (empty for pre-meta editions). */
  stories: RecentStory[];
}

const META_RE = /<!--\s*ec-meta:([A-Za-z0-9+/=]+)\s*-->/;
const PREHEADER_RE = /display:none[^>]*>([^<]{5,160})</;

/** GET a Resend endpoint with backoff on 429/5xx (their API rate-limits at ~2 rps). */
async function resendGet(url: string, apiKey: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (r.status === 429 || r.status >= 500) {
        lastErr = new Error(`Resend ${r.status} for ${url}`);
        await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
        continue;
      }
      if (!r.ok) throw new Error(`Resend ${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Resend request failed');
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Last `limit` SENT editions, newest first. Returns [] on any failure. */
export async function fetchRecentEditions(limit = 7): Promise<RecentEdition[]> {
  try {
    const apiKey = config.resendApiKey();
    const list = await resendGet('https://api.resend.com/broadcasts', apiKey);
    const sent = ((list?.data ?? []) as any[])
      .filter((b) => b.sent_at != null)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);

    const editions: RecentEdition[] = [];
    for (const b of sent) {
      // Stay under Resend's rate limit — these are sequential on purpose.
      await new Promise((res) => setTimeout(res, 600));
      try {
        const d = await resendGet(`https://api.resend.com/broadcasts/${b.id}`, apiKey);
        const html: string = d?.html ?? '';
        const meta = META_RE.exec(html);
        if (meta) {
          const parsed = JSON.parse(Buffer.from(meta[1], 'base64').toString('utf8'));
          editions.push({
            date: parsed.date ?? String(b.created_at).slice(0, 10),
            subject: parsed.subject ?? d?.subject ?? '',
            preheader: parsed.preheader,
            stories: Array.isArray(parsed.stories) ? parsed.stories : [],
          });
        } else {
          // Pre-meta edition: subject + preheader are still enough to avoid repeats.
          const pre = PREHEADER_RE.exec(html);
          editions.push({
            date: String(b.created_at).slice(0, 10),
            subject: d?.subject ?? '',
            preheader: pre ? decodeHtmlEntities(pre[1].trim()) : undefined,
            stories: [],
          });
        }
      } catch {
        // One unreadable edition shouldn't sink the rest.
      }
    }
    return editions.filter((e) => e.subject);
  } catch (e) {
    console.log(`  ⚠️  Could not load recent editions (continuing without): ${(e as Error).message}`);
    return [];
  }
}
