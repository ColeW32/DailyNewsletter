import type { Newsletter, WrittenBlurb, WrittenSection } from '../writer/writeNewsletter';
import type { SourceData, MarketsData, MarketQuote } from '../sources/types';

// Robinhood-inspired palette: black + electric green, clean and minimal.
const C = {
  green: '#00C805', // Robinhood brand green — CTA + accents on dark
  up: '#00A300', // gains (slightly deepened for legibility on white)
  down: '#FF5000', // losses (Robinhood-style orange-red)
  headerBg: '#000000',
  ink: '#1a1a1a',
  body: '#3a3a42',
  muted: '#8a9099',
  pageBg: '#f4f5f7',
  card: '#ffffff',
  divider: '#ededf1',
};

// Sections whose blurbs should NOT show "Read more" links.
const LINKLESS_SECTIONS = new Set(['macro-news', 'ai-brief']);

// Only these sections show a source/attribution label (others have no subtext).
const ATTRIBUTED_SECTIONS = new Set(['chart-of-the-day']);

// utm_campaign=open_app is load-bearing: the Survey Club backend counts Resend
// click events whose link carries it as "app button clicks" on the admin
// newsletter dashboard (and it gives GA clean attribution).
const CTA_URL =
  'https://getsurvey.club?utm_source=club_daily&utm_medium=email&utm_campaign=open_app';
const CTA_TEXT = 'Earn more cash today →';

// Recommended-newsletter referral. `email=` is filled per recipient: the real
// address in self mode, or Resend's {{{EMAIL}}} merge tag in broadcast mode.
const CAPITAL_REC_URL =
  'https://recs.page/survey-club?ref_code=7fd0d6c68c&lc=link_campaign_c696870dcf23&email=';

/** Minimal HTML escaping for interpolated text + attribute values. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBlurb(b: WrittenBlurb, showLink: boolean): string {
  const heading = b.heading
    ? `<strong style="color:${C.ink};">${esc(b.heading)}</strong> `
    : '';
  const link =
    showLink && b.url
      ? ` <a href="${esc(b.url)}" style="color:${C.up};text-decoration:none;font-weight:600;white-space:nowrap;">Read more →</a>`
      : '';
  return `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${C.body};">${heading}${esc(
    b.body,
  )}${link}</p>`;
}

function renderMarkets(quotes: MarketQuote[]): string {
  const rows = quotes
    .map((q) => {
      const up = (q.changePct ?? 0) >= 0;
      const color = up ? C.up : C.down;
      const arrow = up ? '▲' : '▼';
      const change = q.changeText ?? '';
      return `<tr>
        <td style="padding:11px 0;font-size:15px;color:${C.body};border-bottom:1px solid ${C.divider};">${esc(
          q.label,
        )}</td>
        <td style="padding:11px 0;font-size:15px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.divider};">${esc(
          q.value,
        )}</td>
        <td style="padding:11px 0 11px 16px;font-size:14px;font-weight:700;color:${color};text-align:right;border-bottom:1px solid ${C.divider};white-space:nowrap;">${arrow} ${esc(
          change,
        )}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 2px;border-collapse:collapse;">${rows}</table>`;
}

function renderChart(imageUrl: string): string {
  return `<div style="margin:10px 0 2px;"><img src="${esc(
    imageUrl,
  )}" width="536" alt="Chart of the Day" style="width:100%;max-width:536px;height:auto;border-radius:10px;border:1px solid ${C.divider};display:block;"></div>`;
}

function renderSection(sec: WrittenSection, source?: SourceData): string {
  const showLink = !LINKLESS_SECTIONS.has(sec.id);
  const blurbs = (sec.blurbs ?? []).map((b) => renderBlurb(b, showLink)).join('');
  let extra = '';
  const quotes = (source as MarketsData | undefined)?.quotes;
  if (quotes?.length) extra += renderMarkets(quotes);
  if (source?.imageUrl) extra += renderChart(source.imageUrl);

  // Nothing to show for this section — skip it (and its divider).
  if (!blurbs && !extra) return '';

  const sourceLabel = ATTRIBUTED_SECTIONS.has(sec.id)
    ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};">${esc(
        source?.source ?? sec.source,
      )}</div>`
    : '';

  return `
  <tr><td style="padding:26px 32px 0;">
    ${sourceLabel}
    <h2 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:${C.ink};font-weight:800;">${
      sec.emoji
    } ${esc(sec.title)}</h2>
    ${blurbs}${extra}
  </td></tr>
  <tr><td style="padding:22px 32px 0;"><hr style="border:none;border-top:1px solid ${C.divider};margin:0;"></td></tr>`;
}

function renderCta(): string {
  return `
  <tr><td style="padding:30px 32px 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" bgcolor="${C.green}" style="border-radius:999px;">
        <a href="${CTA_URL}" style="display:inline-block;padding:17px 34px;font-size:17px;line-height:1;font-weight:800;color:#000000;text-decoration:none;">${esc(
          CTA_TEXT,
        )}</a>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;text-align:center;font-size:13px;color:${C.muted};"><a href="https://getsurvey.club" style="color:${C.muted};text-decoration:none;">getsurvey.club</a></p>
  </td></tr>`;
}

function renderCapitalRec(emailValue: string): string {
  const url = CAPITAL_REC_URL + emailValue;
  return `
  <tr><td style="padding:6px 32px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.divider};border-radius:12px;border-collapse:separate;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};">Recommended newsletter</div>
        <h3 style="margin:5px 0 6px;font-size:18px;line-height:1.25;color:${C.ink};font-weight:800;">CAPITAL</h3>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${C.body};">The daily newsletter that delivers the most important news on tech, markets and freedom. Readers who add Capital to their Club Daily tend to build higher income over time — and report a happier life.</p>
        <a href="${esc(url)}" style="display:inline-block;font-size:14px;line-height:1;font-weight:800;color:#000000;background:${C.green};border-radius:999px;padding:11px 22px;text-decoration:none;">Subscribe to Capital →</a>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderNewsletter(
  nl: Newsletter,
  sources: SourceData[],
  dateLabel: string,
  opts: { unsubscribeHref?: string; mailingAddress?: string; recipientEmail?: string } = {},
): string {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const order = sources.map((s) => s.id);
  const secs = Array.isArray(nl.sections) ? nl.sections : [];
  const ordered = [...secs].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
  const sectionsHtml = ordered
    .map((sec) => renderSection(sec, byId.get(sec.id)))
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(nl.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(nl.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pageBg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${C.card};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(20,20,40,.06);">

<tr><td style="background:${C.headerBg};padding:26px 32px;">
  <div style="font-size:22px;font-weight:900;letter-spacing:.01em;color:#ffffff;">Survey Club</div>
  <div style="margin-top:5px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.green};">Daily Brief · ${esc(
    dateLabel,
  )}</div>
</td></tr>

<tr><td style="padding:26px 32px 4px;">
  <p style="margin:0;font-size:17px;line-height:1.6;color:${C.body};">${esc(nl.intro)}</p>
</td></tr>

${sectionsHtml}

<tr><td style="padding:22px 32px 4px;">
  <p style="margin:0;font-size:16px;line-height:1.6;color:${C.body};">${esc(nl.signoff)}</p>
</td></tr>

${renderCta()}

${renderCapitalRec(opts.recipientEmail ?? '')}

<tr><td style="padding:24px 32px 32px;">
  <p style="margin:0;font-size:12px;line-height:1.5;color:${C.muted};">You're reading the Survey Club Daily Brief — curated from public sources and written up by AI. Double-check anything before you bet the farm on it.</p>
  ${opts.mailingAddress ? `<p style="margin:10px 0 0;font-size:12px;color:${C.muted};">Survey Club · ${esc(opts.mailingAddress)}</p>` : ''}
  <p style="margin:6px 0 0;font-size:12px;color:${C.muted};"><a href="${esc(opts.unsubscribeHref ?? '#')}" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
