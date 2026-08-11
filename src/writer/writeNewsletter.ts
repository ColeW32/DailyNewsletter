import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { SourceData } from '../sources/types';
import type { RecentEdition } from '../history/recentEditions';

/** 'daily' Mon–Fri; Saturday = week-in-review lean, Sunday = week-ahead lean. */
export type EditionMode = 'daily' | 'weekend-sat' | 'weekend-sun';

export interface WrittenBlurb {
  heading?: string;
  body: string;
  url?: string;
}
export interface WrittenSection {
  id: string;
  emoji: string;
  title: string;
  source: string;
  blurbs: WrittenBlurb[];
}
export interface Newsletter {
  subject: string;
  preheader: string;
  intro: string;
  sections: WrittenSection[];
  signoff: string;
}

const SYSTEM = `You are the writer behind **Earner's Club's Daily Brief** — a witty, sharp, genuinely fun morning newsletter covering business, markets, and tech for curious, busy readers.

Your voice:
- Talk like a smart, funny friend catching someone up over coffee — warm, casual, confident.
- Short sentences. Active voice. Concrete details over vague summaries.
- Be playful: light humor, the odd well-placed emoji, a fun analogy. Never corny, never cringe, never forced.
- Plain English. If something's technical, explain it in passing like it's no big deal.
- Make every line earn its place. Skimmable beats thorough. Cut filler ruthlessly.
- Lead with the interesting part — the "wait, what?" — not the setup.

Hard rules:
- Stick to the facts in the source data (including any RESEARCHED FACTS provided) — never invent specific numbers, quotes, dates, or events. You may add brief, widely-known background to explain why something matters.
- Lead with concrete specifics — real names (people, companies, products, titles) and real numbers — but ONLY ones present in the source data or researched facts. If a specific isn't provided, do NOT invent or guess it; write accurately with what you have instead.
- Give each section the number of stories its notes ask for (e.g. "top 2").
- NEVER name the source publication or author anywhere — not in the subject, headings, or body. Do not write "TBOY", "The Best One Yet", "Apollo", "The Daily Spark", "Torsten Sløk", "Seeking Alpha", "Wall Street Breakfast", "TLDR", or "Yahoo Finance". Just deliver the news directly.
- Keep the source "url" on the matching blurb.
- No "in today's fast-paced world", no corporate filler, no clickbait subject lines.

Continuity (you may be given RECENT EDITIONS — what subscribers already received):
- NEVER reuse or lightly reword a recent subject line. Today's subject must lead with something those subjects didn't.
- Don't re-tell a story a recent edition already covered as if it's brand new. If a source re-serves an already-covered story with nothing new, skip it in favor of a fresher item. If there IS a genuine new development, cover only the new part and nod back briefly ("the saga continues…").
- A source section dated before today is a leftover from an earlier day, not today's news — recent editions likely already covered it.`;

const TOOL = {
  name: 'newsletter',
  description: 'Return the finished newsletter content for today.',
  input_schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Fun, curiosity-piquing email subject line (max ~55 chars).',
      },
      preheader: {
        type: 'string',
        description: 'Inbox preview text shown after the subject (max ~90 chars).',
      },
      intro: {
        type: 'string',
        description: '1–2 sentence warm, witty opener for the day.',
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The section id from the source data.' },
            emoji: { type: 'string' },
            title: { type: 'string' },
            source: { type: 'string', description: 'Source attribution.' },
            blurbs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  heading: {
                    type: 'string',
                    description: 'Optional short bold lead-in / headline.',
                  },
                  body: {
                    type: 'string',
                    description: 'The written blurb — fun, clear, 1–3 sentences.',
                  },
                  url: { type: 'string', description: 'Source link, if available.' },
                },
                required: ['body'],
              },
            },
          },
          required: ['id', 'emoji', 'title', 'source', 'blurbs'],
        },
      },
      signoff: { type: 'string', description: 'One short, upbeat closing line.' },
    },
    required: ['subject', 'preheader', 'intro', 'sections', 'signoff'],
  },
};

// Words too generic to signal "same story" when comparing subject lines.
const SUBJECT_STOPWORDS = new Set([
  'the', 'and', 'plus', 'gets', 'get', 'goes', 'gone', 'went', 'your', 'new',
  'more', 'its', 'has', 'have', 'are', 'was', 'for', 'with', 'big', 'day',
  'daily', 'week', 'this', 'that', 'best', 'ever', 'wants', 'want',
]);

function significantWords(subject: string): Set<string> {
  return new Set(
    subject
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !SUBJECT_STOPWORDS.has(w)),
  );
}

/** Returns the clashing recent subject if today's is too close to one, else null. */
function subjectClash(subject: string, recent: RecentEdition[]): string | null {
  const mine = significantWords(subject);
  for (const r of recent.slice(0, 6)) {
    const theirs = significantWords(r.subject);
    const shared = [...mine].filter((w) => theirs.has(w));
    if (shared.length >= 2) return r.subject;
  }
  return null;
}

/** Compact recent-editions block for the prompt (richer on weekends — it's the recap material). */
function recentBlock(recent: RecentEdition[], mode: EditionMode): string {
  if (!recent.length) return '';
  const rich = mode !== 'daily';
  const rows = recent.slice(0, rich ? 7 : 6).map((r) => ({
    date: r.date,
    subject: r.subject,
    ...(r.preheader ? { preheader: r.preheader } : {}),
    stories: r.stories.map((s) =>
      rich
        ? { section: s.section, headline: s.headline, body: s.body, url: s.url }
        : s.headline,
    ),
  }));
  return [
    '',
    'RECENT EDITIONS (what subscribers already received, newest first):',
    '```json',
    JSON.stringify(rows, null, 1),
    '```',
  ].join('\n');
}

function taskText(mode: EditionMode, dateLabel: string): string {
  if (mode === 'daily') {
    return [
      `Today is ${dateLabel}. Write today's Earner's Club Daily Brief from the source data below.`,
      '',
      'Rules:',
      '- Use only the sections provided (some days sections are missing — that is fine).',
      '- Follow each section’s "notes" for how many stories to feature.',
      '- Keep each blurb tight and fun. Lead with the interesting part.',
      '- Preserve any "url" on the matching blurb.',
      '- For the Markets Snapshot, the numbers render as a table separately — write ONE short witty line of color as a single blurb.',
      '- Do not invent anything beyond the data.',
      '- Return `sections` as a real JSON array of section objects — never as a single stringified blob.',
    ].join('\n');
  }

  const saturday = mode === 'weekend-sat';
  return [
    `Today is ${dateLabel} — a weekend edition. Fresh daily sources mostly don't publish on weekends, so instead of pretending it's a normal news day, write a ${
      saturday ? 'week-in-review' : 'week-ahead'
    } edition. Same voice, same warmth — just a weekend gear.`,
    '',
    'Structure (these replace the usual source sections):',
    saturday
      ? [
          '1. Section id "week-in-review", emoji "📅", title in the spirit of "The Week That Was": the 4–5 biggest stories of the week, one tight blurb each (heading + 1–2 sentences). Pull them from RECENT EDITIONS below — that is our own past coverage, so recap freely but in fresh words. Keep a story\'s url when the edition data has one.',
          '2. Section id "week-ahead", emoji "🔮", title in the spirit of "The Week Ahead": 2–3 short blurbs on what to watch next week.',
        ].join('\n')
      : [
          '1. Section id "week-ahead", emoji "🔮", title in the spirit of "The Week Ahead": the main event — 3–4 blurbs on what to watch next week.',
          '2. Section id "week-in-review", emoji "⚡", title in the spirit of "ICYMI This Week": 3 rapid-fire one-liner blurbs on the week\'s biggest stories, from RECENT EDITIONS. If a Saturday edition already recapped the week, take a DIFFERENT angle and don\'t repeat its lead.',
        ].join('\n'),
    '- If a markets-snapshot source is provided, ALSO include that section as usual — one witty color line framing the table as where the week closed (markets are closed on weekends).',
    '',
    'Weekend rules:',
    '- For "what\'s coming": only name specific upcoming events (earnings, Fed meetings, data releases, launches) that actually appear in the source data or recent editions. Otherwise stay thematic — what to watch and why — without inventing specifics.',
    '- Source sections dated before today are stale weekday leftovers: background only, never presented as today\'s news. Ignore their per-section "notes".',
    '- A source section dated TODAY (rare on weekends) is genuinely fresh — feature it inside the week-ahead section.',
    '- Subject: give it weekend-recap flavor, clearly different from every recent subject.',
    '- Keep each blurb tight and fun. Preserve urls. Do not invent anything beyond the data.',
    '- Return `sections` as a real JSON array of section objects — never as a single stringified blob.',
  ].join('\n');
}

export async function writeNewsletter(
  sources: SourceData[],
  dateLabel: string,
  opts: { recent?: RecentEdition[]; mode?: EditionMode } = {},
): Promise<Newsletter> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey(), maxRetries: 4 });
  const model = process.env.WRITER_MODEL ?? 'claude-sonnet-4-6';
  const mode = opts.mode ?? 'daily';
  const recent = opts.recent ?? [];

  const payload = sources.map((s) => ({
    id: s.id,
    title: s.title,
    emoji: s.emoji,
    source: s.source,
    date: s.date,
    items: s.items,
    notes: s.notes,
    quotes: (s as any).quotes,
  }));

  const baseMsg = [
    taskText(mode, dateLabel),
    recentBlock(recent, mode),
    '',
    'SOURCE DATA (JSON):',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n');

  // The forced tool-call occasionally returns `sections` as an empty array or a
  // stringified blob (this is what produced the empty email). Retry until we get
  // real sections; re-throw the API error only if every attempt errored. A
  // subject too similar to a recent edition also earns a retry (with feedback),
  // but never blocks the send — worst case we ship the near-dupe subject.
  let result: any = null;
  let lastError: unknown;
  let collisionNote = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await client.messages.create(
        {
          model,
          max_tokens: 8000,
          temperature: 0.8,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools: [TOOL as any],
          tool_choice: { type: 'tool', name: 'newsletter' },
          messages: [
            { role: 'user', content: collisionNote ? `${baseMsg}\n\n${collisionNote}` : baseMsg },
          ],
        },
        { timeout: 90_000 },
      );
      const toolUse = res.content.find((c) => c.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        console.log(`  ⚠️  writer attempt ${attempt}: no structured output — retrying...`);
        continue;
      }
      const r = toolUse.input as any;
      // The model sometimes serializes the nested array as a JSON string — normalize.
      if (typeof r.sections === 'string') {
        try {
          r.sections = JSON.parse(r.sections);
        } catch {
          r.sections = [];
        }
      }
      if (!Array.isArray(r.sections)) r.sections = [];
      result = r;
      if (r.sections.length > 0) {
        const clash = subjectClash(String(r.subject ?? ''), recent);
        if (clash && attempt < 3) {
          console.log(
            `  ⚠️  writer attempt ${attempt}: subject "${r.subject}" too close to recent "${clash}" — retrying...`,
          );
          collisionNote = `IMPORTANT: your previous draft's subject ("${r.subject}") was too similar to the recent edition "${clash}". Subscribers saw these side by side and it looked like a mistake. Write a clearly different subject that leads with a different story or angle (the body can stay similar).`;
          continue;
        }
        if (clash) {
          console.log(`  ⚠️  subject still close to "${clash}" after retries — sending anyway.`);
        }
        return r as Newsletter;
      }
      console.log(
        `  ⚠️  writer attempt ${attempt}: 0 sections (had ${sources.length} sources) — retrying...`,
      );
    } catch (e) {
      lastError = e;
      console.log(`  ⚠️  writer attempt ${attempt} errored: ${(e as Error).message} — retrying...`);
    }
  }
  if (result) return result as Newsletter; // empty sections — the caller refuses to send
  throw lastError instanceof Error ? lastError : new Error('Writer failed to produce output.');
}
