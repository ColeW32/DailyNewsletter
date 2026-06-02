import * as cheerio from 'cheerio';

/**
 * Turn an HTML fragment into clean text lines, preserving paragraph/list/break
 * boundaries as line breaks. Entities are decoded by cheerio.
 */
export function htmlToLines(html: string): string[] {
  const withBreaks = String(html)
    .replace(/<\/p>|<br\s*\/?>|<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n');
  const text = cheerio.load(withBreaks).text();
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Collapse an HTML fragment to a single line of plain text. */
export function htmlToText(html: string): string {
  return cheerio
    .load(String(html).replace(/<\/p>|<br\s*\/?>/gi, ' '))
    .text()
    .replace(/\s+/g, ' ')
    .trim();
}
