/** "Today" as yyyy-mm-dd in US Eastern time (where all our sources publish). */
export function todayInET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(),
  );
}

/** The last `n` calendar dates as yyyy-mm-dd (ET), most recent first: [today, …]. */
export function recentDatesET(n: number): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    dates.push(fmt.format(new Date(Date.now() - i * 86_400_000)));
  }
  return dates;
}

/** A friendly long date for the newsletter header, e.g. "Monday, June 1, 2026". */
export function longDateET(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}
