import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { collectSources } from './sources';
import { writeNewsletter, type EditionMode } from './writer/writeNewsletter';
import { enrichWithResearch } from './writer/enrich';
import { renderNewsletter } from './email/template';
import { sendEmail, sendAlert, sendBroadcast, broadcastSentToday } from './email/send';
import { fetchRecentEditions } from './history/recentEditions';
import { longDateET, dayOfWeekET } from './utils/date';
import { config } from './config';

/** Sat/Sun (ET) switch to recap/week-ahead editions. EDITION_MODE=daily|weekend-sat|weekend-sun overrides (testing). */
function editionMode(): EditionMode {
  const forced = process.env.EDITION_MODE?.trim();
  if (forced === 'daily' || forced === 'weekend-sat' || forced === 'weekend-sun') return forced;
  const dow = dayOfWeekET();
  return dow === 6 ? 'weekend-sat' : dow === 0 ? 'weekend-sun' : 'daily';
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const collectOnly = args.has('--collect-only');

  // Send the already-generated newsletter from out/ (the exact version you previewed).
  if (args.has('--send-saved')) {
    const html = readFileSync('out/newsletter.html', 'utf8');
    const meta = JSON.parse(readFileSync('out/newsletter.json', 'utf8'));
    console.log(`📨 Sending saved newsletter to ${config.to}...`);
    console.log(`   Subject: ${meta.subject}`);
    const id = await sendEmail({ subject: meta.subject, html });
    console.log(`✅ Sent!${id ? ` (id: ${id})` : ''}`);
    return;
  }

  console.log('📡 Collecting sources...');
  const sources = await collectSources();
  console.log(
    `\nCollected ${sources.length} section(s): ${
      sources.map((s) => s.title).join(', ') || '(none)'
    }`,
  );

  if (collectOnly) {
    console.log('\n' + JSON.stringify(sources, null, 2));
    return;
  }
  if (sources.length === 0) {
    console.log('No sections available today — nothing to send.');
    if (!dryRun) {
      await sendAlert(
        'No sections collected',
        'Every source returned no data today, so no newsletter was sent.',
      );
    }
    return;
  }

  console.log('\n🔎 Researching specifics for thin sources...');
  const enriched = await Promise.all(
    sources.map((s) =>
      s.id === 'staying-in-the-know' ? enrichWithResearch(s) : Promise.resolve(s),
    ),
  );

  const mode = editionMode();
  if (mode !== 'daily') console.log(`\n🗓️  Weekend edition: ${mode === 'weekend-sat' ? 'week in review (Saturday)' : 'week ahead (Sunday)'}`);

  console.log('\n🧠 Loading recent editions for continuity...');
  const recent = await fetchRecentEditions(7);
  console.log(
    recent.length
      ? `   ${recent.length} loaded (latest: ${recent[0].date} — "${recent[0].subject}")`
      : '   none available — writing without history.',
  );

  console.log('\n✍️  Writing the newsletter with Claude...');
  const label = longDateET();
  const nl = await writeNewsletter(enriched, label, { recent, mode });

  // Safety net: never send an empty newsletter (writer returned no sections).
  if (!Array.isArray(nl.sections) || nl.sections.length === 0) {
    console.error('💥 Writer returned 0 sections — refusing to send an empty newsletter.');
    if (!dryRun) {
      await sendAlert(
        'Empty newsletter blocked',
        `The writer produced 0 sections for ${label} despite ${enriched.length} source(s) collected. Nothing was sent.`,
      );
      process.exit(1);
    }
  }

  const broadcast = config.sendMode === 'broadcast';
  const html = renderNewsletter(nl, enriched, label, {
    mailingAddress: config.mailingAddress,
    unsubscribeHref: broadcast ? '{{{RESEND_UNSUBSCRIBE_URL}}}' : '#',
    recipientEmail: broadcast ? '{{{EMAIL}}}' : config.to,
  });

  if (dryRun) {
    mkdirSync('out', { recursive: true });
    writeFileSync('out/newsletter.html', html, 'utf8');
    writeFileSync('out/newsletter.json', JSON.stringify(nl, null, 2), 'utf8');
    console.log(`\n📝 Subject: ${nl.subject}`);
    console.log(
      '💾 Saved preview to out/newsletter.html (open it in a browser). No email sent.',
    );
    return;
  }

  if (broadcast) {
    if (!args.has('--force') && (await broadcastSentToday())) {
      console.log('⏭️  A broadcast already went out today — skipping (use --force to override).');
      return;
    }
    console.log('\n📣 Sending Broadcast to the Audience...');
    const id = await sendBroadcast({ subject: nl.subject, html });
    console.log(`✅ Broadcast sent!${id ? ` (id: ${id})` : ''}`);
  } else {
    console.log(`\n📨 Sending to ${config.to}...`);
    const id = await sendEmail({ subject: nl.subject, html });
    console.log(`✅ Sent!${id ? ` (id: ${id})` : ''}`);
  }
}

main().catch(async (err) => {
  console.error('\n💥 Failed:', err);
  await sendAlert('Daily newsletter run failed', String(err?.stack ?? err));
  process.exit(1);
});
