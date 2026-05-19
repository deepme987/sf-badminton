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
