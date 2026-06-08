import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import type { SourceData } from '../sources/types';

// Haiku for research: separate (higher) rate-limit pool from the Sonnet writer,
// plus it's faster and cheaper for fact-gathering.
const ENRICH_MODEL = process.env.ENRICH_MODEL ?? 'claude-haiku-4-5';

/**
 * Some sources (notably TBOY) only give one-line teasers — no names, numbers,
 * or specifics. This uses Claude + web search to pull the concrete facts for the
 * top stories so the writer can include real substance. Falls back to the
 * original data on any error, so a research hiccup never blocks the newsletter.
 */
export async function enrichWithResearch(data: SourceData): Promise<SourceData> {
  const teasers = (data.items ?? []).map((it) => it.title).filter(Boolean);
  if (teasers.length === 0) return data;

  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey(), maxRetries: 4 });
    const prompt = [
      `Today is ${data.date ?? 'today'}. Below are one-line teasers from a daily business-news podcast. They lack specifics.`,
      `Choose the TWO most genuinely newsworthy, DISTINCT stories (two different topics — never the same story twice). IGNORE any teaser that's really about the podcast itself — a guest coming on the show, a live tour/tickets, "our other show", or schedule/frequency notes; those aren't stories.`,
      `For each of the two, use web search to find the concrete facts a reader would want: exact names (people, companies, products, titles), key numbers ($ amounts, %, rankings), and what ACTUALLY happened — the real-world event, not the "joined the show" framing.`,
      `Return a tight factual brief — a few bullet points per story with the specifics filled in. Facts only, no fluff. If a story can't be verified, say so in one line.`,
      ``,
      `Teasers:`,
      ...teasers.map((t, i) => `${i + 1}. ${t}`),
    ].join('\n');

    const res = await client.messages.create(
      {
        model: ENRICH_MODEL,
        max_tokens: 1500,
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 2,
            allowed_callers: ['direct'], // Haiku supports direct (not programmatic) tool calls
          } as any,
        ],
        messages: [{ role: 'user', content: prompt }],
      },
      // Best-effort: cap time + retries so a slow/flaky web search can't hang the
      // whole newsletter — on timeout we fall back to the plain teasers.
      { timeout: 120_000, maxRetries: 1 },
    );

    const facts = res.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('\n')
      .trim();

    if (!facts) return data;

    return {
      ...data,
      notes: [
        data.notes ?? '',
        '',
        'RESEARCHED FACTS — weave these specifics (real names, numbers, companies) into the blurbs; prefer them over the vague teasers:',
        facts,
      ].join('\n'),
    };
  } catch (err) {
    console.log(`  ⚠️  research enrichment skipped for "${data.title}": ${(err as Error).message}`);
    return data;
  }
}
