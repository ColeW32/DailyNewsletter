/**
 * Enable open + click tracking on the newsletter's sending domain in Resend.
 *
 * Resend disables tracking by default, and it only works once a tracking
 * subdomain (a CNAME) is configured AND verified. This script flips the flags
 * on via the API and prints the DNS record you still need to add.
 *
 *   RESEND_API_KEY=re_xxx npx tsx scripts/enable-resend-tracking.ts
 *   RESEND_API_KEY=re_xxx npx tsx scripts/enable-resend-tracking.ts daily.getsurvey.club links
 *
 * Args (both optional):
 *   1) domain name           default: daily.getsurvey.club  (must match NEWSLETTER_FROM's domain)
 *   2) tracking subdomain     default: links                 (becomes links.<domain>)
 */
import 'dotenv/config';

const API = 'https://api.resend.com';
const KEY = (process.env.RESEND_API_KEY || '').trim();
const DOMAIN = (process.argv[2] || 'daily.getsurvey.club').trim();
const TRACKING_SUBDOMAIN = (process.argv[3] || 'links').trim();

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${init?.method || 'GET'} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  if (!KEY) throw new Error('Set RESEND_API_KEY (re_...) in the environment or .env.');

  console.log(`🔎 Finding domain "${DOMAIN}" in Resend...`);
  const list = await api('/domains');
  const domains: Array<{ id: string; name: string }> = list?.data ?? list ?? [];
  const match = domains.find((d) => d.name === DOMAIN);
  if (!match) {
    throw new Error(
      `Domain "${DOMAIN}" not found. Domains in this account: ${domains.map((d) => d.name).join(', ') || '(none)'}`,
    );
  }
  console.log(`   ✓ ${match.name} (${match.id})`);

  console.log(`\n⚙️  Enabling open + click tracking (tracking subdomain: ${TRACKING_SUBDOMAIN}.${DOMAIN})...`);
  await api(`/domains/${match.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      open_tracking: true,
      click_tracking: true,
      tracking_subdomain: TRACKING_SUBDOMAIN,
    }),
  });

  // Re-fetch to surface the tracking CNAME that now needs to be added + verified.
  const full = await api(`/domains/${match.id}`);
  const records: Array<Record<string, any>> = full?.records ?? [];
  const tracking = records.filter(
    (r) => String(r.name || '').includes(TRACKING_SUBDOMAIN) || String(r.type || '').toUpperCase() === 'CNAME',
  );

  console.log('\n✅ Tracking flags set: open_tracking=true, click_tracking=true');
  console.log(`   status: ${full?.status ?? 'unknown'}`);
  console.log('\n📌 Add this DNS record (then click "Verify" on the domain in Resend):');
  if (tracking.length) {
    for (const r of tracking) {
      console.log(`   ${r.type}  ${r.name}  →  ${r.value}${r.status ? `   [${r.status}]` : ''}`);
    }
  } else {
    console.log('   (No CNAME returned — open the domain in the Resend dashboard to copy the tracking record.)');
  }
  console.log('\nUntil that CNAME is verified, Resend will NOT inject the open pixel.');
}

main().catch((err) => {
  console.error('\n💥 Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
