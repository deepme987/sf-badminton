import { describe, expect, it } from 'vitest';
import { _internals, generateCreatorCode, generateSlug } from '@/lib/ids';

const URL_SAFE_RE = /^[a-z0-9]+$/;

describe('generateSlug', () => {
  it('returns a 4-char string by default', () => {
    const s = generateSlug();
    expect(s).toHaveLength(4);
  });

  it('uses only the url-safe alphabet', () => {
    const alphabet = _internals.SLUG_ALPHABET;
    for (let i = 0; i < 100; i++) {
      const s = generateSlug();
      expect(URL_SAFE_RE.test(s)).toBe(true);
      for (const ch of s) {
        expect(alphabet).toContain(ch);
      }
    }
  });

  it('has < 5 collisions over 1000 samples', () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const s = generateSlug();
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    let collisions = 0;
    for (const count of seen.values()) {
      if (count > 1) collisions += count - 1;
    }
    expect(collisions).toBeLessThan(5);
  });

  it('respects a custom length', () => {
    expect(generateSlug(6)).toHaveLength(6);
    expect(generateSlug(8)).toHaveLength(8);
  });

  it('throws on length <= 0', () => {
    expect(() => generateSlug(0)).toThrow();
  });
});

describe('generateCreatorCode', () => {
  it('matches `<slug>-<4chars>` shape', () => {
    const slug = generateSlug();
    const code = generateCreatorCode(slug);
    expect(code).toMatch(/^[a-z0-9]+-[a-z0-9]{4}$/);
    expect(code.startsWith(`${slug}-`)).toBe(true);
    const tail = code.slice(slug.length + 1);
    expect(tail).toHaveLength(4);
    expect(URL_SAFE_RE.test(tail)).toBe(true);
  });
});
