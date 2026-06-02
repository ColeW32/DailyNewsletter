import YahooFinance from 'yahoo-finance2';
import type { MarketsData, MarketQuote } from './types';

// Markets Snapshot via Yahoo Finance (no API key). yahoo-finance2 v3 must be
// instantiated with `new`, and the survey notice suppressed via the constructor.
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface Instrument {
  label: string;
  symbol: string;
  decimals: number;
  prefix?: string;
  isYield?: boolean;
}

const INSTRUMENTS: Instrument[] = [
  { label: 'S&P 500', symbol: '^GSPC', decimals: 2 },
  { label: 'Nasdaq', symbol: '^IXIC', decimals: 2 },
  { label: '10Y Treasury', symbol: '^TNX', decimals: 3, isYield: true },
  { label: 'Bitcoin', symbol: 'BTC-USD', decimals: 0, prefix: '$' },
  { label: 'Oil (WTI)', symbol: 'CL=F', decimals: 2, prefix: '$' },
];

function fmt(n: number, decimals: number, prefix = ''): string {
  return (
    prefix +
    n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function signed(n: number, decimals: number, suffix: string): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}${suffix}`;
}

async function quoteAll(symbols: string[]): Promise<any[]> {
  try {
    return await yf.quote(symbols);
  } catch {
    try {
      return await yf.quote(symbols, {}, { validateResult: false });
    } catch {
      const out: any[] = [];
      for (const s of symbols) {
        try {
          out.push(await yf.quote(s, {}, { validateResult: false }));
        } catch {
          /* skip this symbol */
        }
      }
      return out;
    }
  }
}

export async function fetchMarkets(): Promise<MarketsData | null> {
  const results = await quoteAll(INSTRUMENTS.map((i) => i.symbol));
  const bySym: Record<string, any> = Object.fromEntries(
    results.filter(Boolean).map((q) => [q.symbol, q]),
  );

  const quotes: MarketQuote[] = [];
  for (const inst of INSTRUMENTS) {
    const q = bySym[inst.symbol];
    if (!q || q.regularMarketPrice == null) continue;

    const price = q.regularMarketPrice as number;
    const prev = (q.regularMarketPreviousClose as number) ?? price;
    const chg = price - prev;
    const pct = prev ? (chg / prev) * 100 : 0;

    const value = inst.isYield
      ? `${price.toFixed(inst.decimals)}%`
      : fmt(price, inst.decimals, inst.prefix);

    // For the 10Y, change is more naturally read in basis points than percent.
    const changeText = inst.isYield
      ? signed(chg * 100, 1, ' bps')
      : signed(pct, 2, '%');

    quotes.push({ label: inst.label, value, changePct: +pct.toFixed(2), changeText });
  }

  if (quotes.length === 0) return null;

  const marketState = results.find(Boolean)?.marketState ?? 'unknown';

  return {
    id: 'markets-snapshot',
    title: 'Markets Snapshot',
    emoji: '📊',
    source: 'Yahoo Finance',
    items: [],
    quotes,
    notes: `Market state: ${marketState}. The numbers render as a table separately — write ONE short, witty line of color (the biggest mover or the overall vibe).`,
  };
}
