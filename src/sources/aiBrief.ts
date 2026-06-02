import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { todayInET } from '../utils/date';
import type { SourceData, ContentItem } from './types';

// TLDR AI: discover today's issue via RSS, then scrape the dated HTML page for
// the story bodies (the RSS feed itself carries titles/links only).
const RSS = 'https://tldr.tech/api/rss/ai';
const UA = 'Mozilla/5.0 (SurveyClubNewsletterBot)';

const parser = new Parser({ headers: { 'User-Agent': UA } });

export async function fetchAiBrief(): Promise<SourceData | null> {
  const feed = await parser.parseURL(RSS);
  if (!feed.items.length) return null;

  // Prefer today's (ET) issue; fall back to the most recent available.
  const today = todayInET();
  const item =
    feed.items.find((i) => i.link?.endsWith(`/ai/${today}`)) ?? feed.items[0];
  const url = item.link;
  if (!url) return null;

  const html = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) =>
    r.text(),
  );
  const $ = cheerio.load(html);

  const items: ContentItem[] = [];
  $('article.mt-3').each((_, el) => {
    const a = $(el).find('a.font-bold').first();
    const h3 = a.find('h3').text().trim();
    const m = h3.match(/\((\d+)\s+minute read\)\s*$/);
    if (!m) return; // skip sponsors / non-story blocks
    items.push({
      title: h3.replace(/\s*\(\d+\s+minute read\)\s*$/, '').trim(),
      summary: $(el).find('div.newsletter-html').text().trim(),
      url: (a.attr('href') || '').split('?')[0],
    });
  });

  if (items.length === 0) return null;

  const date = url.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];

  return {
    id: 'ai-brief',
    title: 'AI Brief',
    emoji: '🤖',
    source: 'TLDR AI',
    date,
    items: items.slice(0, 6),
    notes:
      'Feature the TOP 2 AI stories (most important / most interesting). Keep them fun and skimmable, and keep each story’s link.',
  };
}
