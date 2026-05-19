/**
 * Venue presets (decision #12 in PLAN.md).
 *
 * Known venues are stored as `sessions.venue = '<name>'` (the human-readable
 * name, not the id). `venue_custom` is required iff `venue === 'Other'`.
 */

export const KNOWN_VENUES = [
  { id: 'shuttl', name: 'Shuttl', maxCourts: 4 },
  { id: 'onea', name: 'OneA', maxCourts: 1 },
] as const;

export type KnownVenue = (typeof KNOWN_VENUES)[number];
export type KnownVenueId = KnownVenue['id'];
export type KnownVenueName = KnownVenue['name'];

export const OTHER_VENUE = 'Other' as const;
export type VenueName = KnownVenueName | typeof OTHER_VENUE;

export const ALL_VENUE_NAMES = [
  ...KNOWN_VENUES.map((v) => v.name),
  OTHER_VENUE,
] as const satisfies readonly VenueName[];

/**
 * Returns the maxCourts cap for a venue name, or `null` if the venue has no
 * cap ('Other').
 */
export function getVenueMaxCourts(venueName: string): number | null {
  const known = KNOWN_VENUES.find((v) => v.name === venueName);
  return known ? known.maxCourts : null;
}

export function isKnownVenueName(name: string): name is KnownVenueName {
  return KNOWN_VENUES.some((v) => v.name === name);
}
