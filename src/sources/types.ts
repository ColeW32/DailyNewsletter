/**
 * Contracts shared by every data source.
 *
 * Each source fetcher returns `SourceData` when it has content for the day,
 * or `null` when it doesn't — a `null` result causes that section to be
 * omitted from the newsletter entirely (per the "omit if missing" rule).
 */

/** A single content item (e.g. one story) within a section. */
export interface ContentItem {
  title: string;
  summary: string;
  url?: string;
}

/** Raw data returned by a source fetcher, before Claude writes it up. */
export interface SourceData {
  /** Stable id matching the section, e.g. "staying-in-the-know". */
  id: string;
  /** Display title, e.g. "Staying in the Know". */
  title: string;
  /** Section emoji, e.g. "🧠". */
  emoji: string;
  /** Human-readable attribution, e.g. "TBOY". */
  source: string;
  /** ISO date (yyyy-mm-dd) the underlying content is for. */
  date?: string;
  /** The raw items/stories pulled from the source. */
  items?: ContentItem[];
  /** Free-form extra context handed to the writer. */
  notes?: string;
  /** Optional image (e.g. the Chart of the Day). */
  imageUrl?: string;
}

/** One quote in the Markets Snapshot section. */
export interface MarketQuote {
  label: string; // "S&P 500"
  value: string; // formatted level/price, e.g. "5,300.42"
  changePct?: number; // signed daily % change, used for color/arrow, e.g. -0.42
  changeText?: string; // pre-formatted change, e.g. "+0.38%" or "+2.2 bps"
}

/** Markets Snapshot data — a SourceData carrying structured quotes. */
export interface MarketsData extends SourceData {
  quotes: MarketQuote[];
}

/** The contract every source fetcher implements. */
export type SourceFetcher = () => Promise<SourceData | null>;
