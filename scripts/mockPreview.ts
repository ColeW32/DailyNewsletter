/**
 * Design preview WITHOUT calling Claude or sending email. Collects today's real
 * source data and renders the email template using the raw text, so you can see
 * the layout/branding before wiring up API keys. Run: `npm run preview:mock`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { collectSources } from '../src/sources';
import { renderNewsletter } from '../src/email/template';
import { longDateET } from '../src/utils/date';
import type { Newsletter } from '../src/writer/writeNewsletter';

const sources = await collectSources();

const nl: Newsletter = {
  subject: '[design preview] Survey Club Daily Brief',
  preheader: 'Layout preview with raw source data — real copy is written by Claude.',
  intro:
    'This is a layout preview built from raw source data. The real edition is written by Claude in a fun, conversational voice — this just shows the design.',
  sections: sources.map((s) => ({
    id: s.id,
    emoji: s.emoji,
    title: s.title,
    source: s.source,
    blurbs:
      s.id === 'markets-snapshot'
        ? [{ body: 'The day’s market color line goes here (written by Claude).' }]
        : (s.items ?? [])
            .slice(
              0,
              s.id === 'chart-of-the-day' ? 99 : s.id === 'macro-news' ? 1 : 2,
            )
            .map((it) => ({
              body: [it.title, it.summary].filter(Boolean).join(' — '),
              url: it.url,
            })),
  })),
  signoff: 'That’s the shape of it — real AI copy lands once the keys are in. 🚀',
};

mkdirSync('out', { recursive: true });
writeFileSync('out/newsletter.html', renderNewsletter(nl, sources, longDateET()), 'utf8');
console.log('✅ Wrote out/newsletter.html');
