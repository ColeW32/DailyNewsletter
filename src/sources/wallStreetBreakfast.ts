import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import type { SourceData, ContentItem } from './types';

// Seeking Alpha's "Wall Street Breakfast" via Spreaker RSS. The site itself is
// bot-walled, but the feed carries the top stories + Show Notes as text/links.
const FEED = 'https://www.spreaker.com/show/5725002/episodes/feed';
const UA = 'Mozilla/5.0 (SurveyClubNewsletterBot)';

const parser = new Parser({ headers: { 'User-Agent': UA } });

export async function fetchWallStreetBreakfast(): Promise<SourceData | null> {
  const feed = await parser.parseURL(FEED);
  const item = feed.items[0];
  if (!item) return null;

  const html = item.content ?? (item as any).description ?? '';
  const $ = cheerio.load(html);

  // Links to the underlying Seeking Alpha articles, in order of appearance.
  const newsLinks = $('a')
    .toArray()
    .map((a) => ({
      text: $(a).text().trim(),
      url: ($(a).attr('href') || '').split('?')[0],
    }))
    .filter((s) => s.url.includes('seekingalpha.com/news/'));

  // Full briefing text, trimmed before the promo tail.
  const fullText = $.root()
    .text()
    .split(/Episode transcripts/i)[0]
    .replace(/\s+/g, ' ')
    .trim();

  // The top stories are full sentences each ending in an audio timestamp "(m:ss)".
  const preShowNotes = fullText.split(/Show Notes/i)[0];
  const sentences = [...preShowNotes.matchAll(/\s*(.+?)\s*\(\d{1,2}:\d{2}\)/g)]
    .map((m) => m[1].trim())
    .filter((s) => s.length > 0);

  const headline = item.title?.trim() || sentences[0] || newsLinks[0]?.text || '';
  if (!headline && newsLinks.length === 0) return null;

  const date = item.pubDate
    ? new Date(item.pubDate).toISOString().slice(0, 10)
    : undefined;

  // Pair each timestamped story with its source link (same order); fall back to links.
  const items: ContentItem[] = sentences.length
    ? sentences.map((title, i) => ({
        title,
        summary: '',
        url: newsLinks[i]?.url,
      }))
    : newsLinks.slice(0, 4).map((s) => ({ title: s.text, summary: '', url: s.url }));

  return {
    id: 'macro-news',
    title: 'Macro News',
    emoji: '🌎',
    source: 'Seeking Alpha — Wall Street Breakfast',
    date,
    items,
    notes: [
      `Headline of the day: ${headline}`,
      fullText ? `Briefing summary: ${fullText.slice(0, 700)}` : '',
      'Write up the SINGLE top macro story clearly and engagingly. You may nod to one other story if it adds color.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
