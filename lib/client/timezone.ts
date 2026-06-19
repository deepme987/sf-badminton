/**
 * Time-zone helpers. The whole app is locked to Pacific Time for display and
 * input regardless of the viewer's local zone — this is a Bay Area badminton
 * group and a Tokyo viewer thinking the session is on a different day caused
 * real confusion.
 *
 * All wire timestamps stay as unix-ms (no zone). These helpers only affect
 * the rendering layer + the create-form's date/time picker.
 */

export const DISPLAY_TZ = 'America/Los_Angeles';
export const DISPLAY_TZ_LABEL = 'PT';

export interface PtParts {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
}

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hour12: false,
});

/** Extract the Y-M-D H:M components a clock in Pacific Time would show. */
export function ptParts(ms: number): PtParts {
  const parts = PARTS_FORMATTER.formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  let hour = read('hour');
  // `hour: 'numeric'` with `hour12: false` returns "24" at midnight in some
  // engines — normalize to 0 so downstream comparisons work.
  if (hour === 24) hour = 0;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
  };
}

/** PT components for `Date.now()`. Useful as a "today in PT" default. */
export function nowPtParts(): PtParts {
  return ptParts(Date.now());
}

/**
 * Inverse of `ptParts`: given Y-M-D H:M as PT wall-clock values, return the
 * Unix-ms timestamp.
 *
 * Two refinement passes converge across DST boundaries (Mar/Nov in the US).
 * The pattern: pick a UTC guess, ask PT what time it actually is at that
 * moment, then shift by the delta. After two passes we're within a minute
 * of the requested wall-clock for every input that exists on a real PT
 * calendar.
 */
export function ptToUnixMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desiredUtc;
  for (let i = 0; i < 2; i++) {
    const p = ptParts(guess);
    const ptAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += desiredUtc - ptAsUtc;
  }
  return guess;
}

/** Convenience: today's YYYY-MM-DD string (in PT) for a date <input>. */
export function todayPtDateInput(): string {
  const p = nowPtParts();
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}
