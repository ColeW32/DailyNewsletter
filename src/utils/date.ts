/** "Today" as yyyy-mm-dd in US Eastern time (where all our sources publish). */
export function todayInET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(),
  );
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
