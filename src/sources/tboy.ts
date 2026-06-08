import Parser from 'rss-parser';
import { htmlToLines } from '../utils/html';
import { todayInET } from '../utils/date';
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

  // TBOY only publishes Mon–Fri. On weekends/holidays the feed still serves the
  // last (e.g. Friday's) episode — we don't want to repurpose those stale stories.
  // Only run this section when the latest episode is actually from today (ET).
  const episodeDateET = item.pubDate
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
        new Date(item.pubDate),
      )
    : '';
  if (episodeDateET !== todayInET()) return null;

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

  const date = episodeDateET;

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
      'Pick the TOP 2 — two DISTINCT, genuinely newsworthy stories (never the same story written up twice). SKIP any item that is really about the podcast/show itself: a guest coming on the show, a live tour, ticket promos, "our other show", or schedule/frequency notes — those are not stories. For each pick, write the ACTUAL news (the real company/event/development and why it matters), NOT the "they joined the show" framing. Use the RESEARCHED FACTS below for real names, numbers and specifics; write a fun, informative ~3–4 sentence blurb.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
