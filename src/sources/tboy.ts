import Parser from 'rss-parser';
import { htmlToLines } from '../utils/html';
import type { SourceData, ContentItem } from './types';

// "The Best One Yet" — Acast podcast RSS. The day's stories live in the
// episode <description> HTML as one-line teasers.
const FEED = 'https://feeds.acast.com/public/shows/69545da8cb029db7575279fc';
const UA = 'Mozilla/5.0 (SurveyClubNewsletterBot)';

const parser = new Parser({
  headers: { 'User-Agent': UA },
  customFields: { item: [['description', 'descriptionHtml']] },
});

export async function fetchTboy(): Promise<SourceData | null> {
  const feed = await parser.parseURL(FEED);
  const item = feed.items[0];
  if (!item) return null;

  const html =
    (item as any).descriptionHtml ??
    (item as any)['content:encoded'] ??
    item.content ??
    item.contentSnippet ??
    '';

  // The footer ("NEWSLETTER:" onward) is a 100%-reliable end-anchor. Cut it,
  // then drop bare URLs and the occasional promo header line.
  const beforeFooter = String(html).split(/NEWSLETTER:/i)[0];
  const lines = htmlToLines(beforeFooter)
    // Drop any line with a URL (promo/ticket lines) and the IPO-tour promo header.
    .filter((l) => !/https?:\/\//i.test(l))
    .filter((l) => !/IPO Tour|Grab your Tickets|Tickets? (here|on sale|to)/i.test(l));

  const tickers = lines.find((l) => /^\$[A-Z]{1,5}(\s+\$[A-Z]{1,5})*$/.test(l));
  const plus = lines.find((l) => /^Plus,/i.test(l));
  const stories = lines.filter(
    (l) => l !== tickers && l !== plus && l.length > 20,
  );

  if (stories.length === 0) return null;

  const date = item.pubDate
    ? new Date(item.pubDate).toISOString().slice(0, 10)
    : undefined;

  const items: ContentItem[] = stories.map((s) => ({ title: s, summary: '' }));
  if (plus) items.push({ title: plus, summary: '' });

  return {
    id: 'staying-in-the-know',
    title: 'Staying in the Know',
    emoji: '🧠',
    source: 'TBOY (The Best One Yet)',
    date,
    items,
    notes: [
      item.title ? `Episode teaser headline: ${item.title}` : '',
      tickers ? `Tickers mentioned: ${tickers}` : '',
      'These are one-line teasers. Feature the TOP 2 stories. For EACH, write a fun, informative ~3–4 sentence blurb that names the ACTUAL people, companies, products/titles and key numbers — not vague teasers. Use the RESEARCHED FACTS below for those specifics when present. Explain what happened and why it matters.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
