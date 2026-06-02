import * as cheerio from 'cheerio';
import type { SourceData, ContentItem } from './types';

// Apollo "The Daily Spark" (Torsten Sløk). No RSS + slug-based URLs, so we read
// the listing for the latest post, then pull the chart + commentary from it.
// NOTE: Apollo proprietary research — always attribute and link back.
const BASE = 'https://www.apollo.com';
const LIST = `${BASE}/wealth/the-daily-spark`;
const UA = 'Mozilla/5.0 (SurveyClubNewsletterBot)';

export async function fetchApolloSpark(): Promise<SourceData | null> {
  const listHtml = await fetch(LIST, { headers: { 'User-Agent': UA } }).then((r) =>
    r.text(),
  );
  const $l = cheerio.load(listHtml);
  const href = $l('a[href*="/wealth/the-daily-spark/"]')
    .map((_, a) => $l(a).attr('href'))
    .get()
    .find((h) => h && !h.replace(/\/$/, '').endsWith('/the-daily-spark'));
  if (!href) return null;

  const postUrl = new URL(href, BASE).toString();
  const html = await fetch(postUrl, { headers: { 'User-Agent': UA } }).then((r) =>
    r.text(),
  );
  const $ = cheerio.load(html);

  const title = (
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    ''
  )
    .replace(/\s*\|\s*The Daily Spark\s*$/i, '')
    .trim();

  const dateText = $('p.blog-detail-info-date').first().text().trim();

  // Commentary paragraphs live in the post's content-fragments container.
  const commentary = $('.blog-detail-content-fragments p')
    .map((_, p) => $(p).text().trim())
    .get()
    .filter((t) => t.length > 30)
    .filter((t) => !/^Sources?:/i.test(t))
    .filter(
      (t) => !/may not be distributed|This presentation|All Rights Reserved/i.test(t),
    );

  // Chart image: scan the page for Apollo DAM chart URLs, preferring ones whose
  // path matches this post's date (avoids grabbing related-post thumbnails).
  const datePath = (() => {
    const d = dateText ? new Date(dateText) : null;
    if (!d || isNaN(d.getTime())) return '';
    const mon = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
    return `/${d.getFullYear()}/${mon}/${d.getDate()}/`;
  })();
  const allCharts = [
    ...new Set(
      [
        ...html.matchAll(
          /https:\/\/www\.apollo\.com\/content\/dam\/apolloaem\/images\/daily-spark\/[^"'\\]+\.jpg/g,
        ),
      ].map((x) => x[0]),
    ),
  ];
  const todays = datePath ? allCharts.filter((u) => u.includes(datePath)) : [];
  const imageUrl = todays[0] ?? allCharts[0];

  if (!imageUrl && commentary.length === 0) return null;

  const date = dateText
    ? new Date(dateText).toISOString().slice(0, 10)
    : undefined;

  const items: ContentItem[] = commentary.map((c) => ({ title: '', summary: c }));

  return {
    id: 'chart-of-the-day',
    title: 'Chart of the Day',
    emoji: '📈',
    source: 'Apollo — The Daily Spark (Torsten Sløk)',
    date,
    items,
    imageUrl,
    notes: [
      title ? `Chart title: ${title}` : '',
      dateText ? `Published: ${dateText}` : '',
      commentary.length ? `Source commentary: ${commentary.join(' ')}` : '',
      'In 2–3 fun, clear sentences explain WHAT the chart shows and WHY it matters. Do NOT name the source or author in the copy — just explain the chart and its insight.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
