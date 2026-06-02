import type { SourceData } from './types';
import { fetchTboy } from './tboy';
import { fetchApolloSpark } from './apolloSpark';
import { fetchWallStreetBreakfast } from './wallStreetBreakfast';
import { fetchAiBrief } from './aiBrief';
import { fetchMarkets } from './markets';

// Canonical section order for the newsletter.
const SOURCES: { label: string; fn: () => Promise<SourceData | null> }[] = [
  { label: 'TBOY', fn: fetchTboy },
  { label: 'Apollo Daily Spark', fn: fetchApolloSpark },
  { label: 'Wall Street Breakfast', fn: fetchWallStreetBreakfast },
  { label: 'TLDR AI', fn: fetchAiBrief },
  { label: 'Markets', fn: fetchMarkets },
];

/**
 * Run every source fetcher. Failures and "no data today" both simply drop that
 * section (the "omit if missing" rule). Returns sections in canonical order.
 */
export async function collectSources(): Promise<SourceData[]> {
  const settled = await Promise.allSettled(SOURCES.map((s) => s.fn()));
  const out: SourceData[] = [];

  settled.forEach((r, i) => {
    const { label } = SOURCES[i];
    if (r.status === 'fulfilled' && r.value) {
      console.log(`  ✓ ${label}`);
      out.push(r.value);
    } else if (r.status === 'fulfilled') {
      console.log(`  – ${label}: no data today — section omitted`);
    } else {
      const msg = r.reason?.message ?? String(r.reason);
      console.log(`  ✗ ${label}: failed (${msg}) — section omitted`);
    }
  });

  return out;
}
