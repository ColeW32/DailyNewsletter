/** "Today" as yyyy-mm-dd in US Eastern time (where all our sources publish). */
export function todayInET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(),
  );
}

/** Day of week in US Eastern time: 0=Sunday … 6=Saturday. */
export function dayOfWeekET(): number {
  const dow = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dow);
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
