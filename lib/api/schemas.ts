/**
 * Zod schemas for API request bodies. Keep these decoupled from Drizzle so we
 * can adapt the on-wire shape without touching the schema.
 */
import { z } from 'zod';
import { ALL_VENUE_NAMES, OTHER_VENUE } from '../venues';

const venueEnum = z.enum(ALL_VENUE_NAMES as unknown as [string, ...string[]]);

export const createSessionBody = z
  .object({
    startsAt: z.number().int().nonnegative(),
    endsAt: z.number().int().nonnegative(),
    venue: venueEnum,
    venueCustom: z.string().trim().max(120).nullish(),
    initialCapacity: z.number().int().min(4).max(6).optional(),
    // Optional — the client passes their display name so the audit log can
    // show "Session created by X". Stored in the create_session event payload.
    creatorDisplayName: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.venue === OTHER_VENUE) {
      const custom = (val.venueCustom ?? '').trim();
      if (custom === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['venueCustom'],
          message: 'venueCustom is required when venue is "Other"',
        });
      }
    }
    if (val.endsAt <= val.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsAt must be after startsAt',
      });
    }
  });
export type CreateSessionBody = z.infer<typeof createSessionBody>;

export const updateSessionBody = z
  .object({
    startsAt: z.number().int().nonnegative().optional(),
    endsAt: z.number().int().nonnegative().optional(),
    venue: venueEnum.optional(),
    venueCustom: z.string().trim().max(120).nullable().optional(),
    totalCostCents: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'patch is empty',
  });
export type UpdateSessionBody = z.infer<typeof updateSessionBody>;

export const addCourtBody = z.object({
  capacity: z.number().int().min(4).max(6).optional(),
});
export type AddCourtBody = z.infer<typeof addCourtBody>;

export const setCostBody = z.object({
  totalCostCents: z.number().int().nonnegative().nullable(),
});
export type SetCostBody = z.infer<typeof setCostBody>;

export const patchCourtBody = z
  .object({
    capacity: z.number().int().min(4).max(6).optional(),
    bookedAs: z.string().trim().max(60).nullable().optional(),
  })
  .refine((v) => v.capacity !== undefined || v.bookedAs !== undefined, {
    message: 'patch is empty',
  });
export type PatchCourtBody = z.infer<typeof patchCourtBody>;

export const joinSessionBody = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    // Adding a +1 in the same call is supported via the dedicated endpoint
    // (POST /api/slots/:id/plus-one) — keep this clean.
  })
  .strict();
export type JoinSessionBody = z.infer<typeof joinSessionBody>;

export const addPlusOneBody = z
  .object({
    plusOneName: z.string().trim().min(1).max(60),
  })
  .strict();
export type AddPlusOneBody = z.infer<typeof addPlusOneBody>;

/**
 * PushSubscriptionJSON-shaped body from the browser's PushManager.
 * `endpoint` is the URL the push service mints; `keys.p256dh` + `keys.auth`
 * are the ECDH and HMAC secrets used to encrypt the payload.
 */
export const pushSubscribeBody = z
  .object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(200),
    }),
    userAgent: z.string().trim().max(400).optional(),
  })
  .strict();
export type PushSubscribeBody = z.infer<typeof pushSubscribeBody>;
