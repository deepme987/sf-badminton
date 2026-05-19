/**
 * ID + slug generation. Pure functions so tests can inject a deterministic RNG.
 *
 * - Session slug: 4 chars from a 32-char url-safe alphabet. Lowercase only —
 *   removes look-alikes (no '0/o', '1/l/i') and stays case-insensitive on URLs.
 * - Creator code: `<slug>-<4 random chars>` (same alphabet).
 * - Internal ids (courts, slots, events): standard UUIDv4 via crypto.
 */
import { randomBytes, randomUUID } from 'node:crypto';

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // 31 chars, no 0/o/1/l/i

export type RandomBytesFn = (n: number) => Uint8Array;

function defaultRandomBytes(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}

/**
 * Generates a 4-char slug. The alphabet is intentionally url-safe and dodges
 * common look-alikes.
 */
export function generateSlug(length: number = 4, rng: RandomBytesFn = defaultRandomBytes): string {
  if (length <= 0) throw new Error('slug length must be > 0');
  const buf = rng(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    // `buf[i]` is safe because we know we asked for `length` bytes; the type-checker
    // doesn't know that with `noUncheckedIndexedAccess`. Coerce with `!`.
    const byte = buf[i] as number;
    out += SLUG_ALPHABET.charAt(byte % SLUG_ALPHABET.length);
  }
  return out;
}

/**
 * Builds a creator code in the form `<slug>-<random4>`. Pure relative to its inputs.
 */
export function generateCreatorCode(slug: string, rng: RandomBytesFn = defaultRandomBytes): string {
  const tail = generateSlug(4, rng);
  return `${slug}-${tail}`;
}

export function newUuid(): string {
  return randomUUID();
}

export const _internals = {
  SLUG_ALPHABET,
};
