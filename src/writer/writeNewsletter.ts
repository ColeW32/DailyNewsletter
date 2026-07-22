import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { SourceData } from '../sources/types';

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
- No "in today's fast-paced world", no corporate filler, no clickbait subject lines.`;

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

export async function writeNewsletter(
  sources: SourceData[],
  dateLabel: string,
): Promise<Newsletter> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey(), maxRetries: 4 });
  const model = process.env.WRITER_MODEL ?? 'claude-sonnet-4-6';

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

  const userMsg = [
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
    '',
    'SOURCE DATA (JSON):',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n');

  // The forced tool-call occasionally returns `sections` as an empty array or a
  // stringified blob (this is what produced the empty email). Retry until we get
  // real sections; re-throw the API error only if every attempt errored.
  let result: any = null;
  let lastError: unknown;
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
          messages: [{ role: 'user', content: userMsg }],
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
      if (r.sections.length > 0) return r as Newsletter;
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
