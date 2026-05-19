/**
 * Single source of truth for the user's device-id and display-name.
 * Persisted in localStorage under one key (`vibe.identity`).
 *
 * Per PLAN.md: no accounts, no auth tokens. Just a stable per-device UUID
 * generated once and never changed, plus a freely-editable display name.
 *
 * Identity is the ONLY thing this app writes to localStorage. No theme,
 * no auth tokens, no fetched data — just identity.
 */

export const IDENTITY_KEY = 'vibe.identity';

export interface Identity {
  deviceId: string;
  displayName: string;
  venmoHandle?: string;
  zelleHandle?: string;
  /** Last venue picked on the create-session form. Prefilled next time. */
  lastVenue?: string;
}

function uuidv4(): string {
  // Browser path: native crypto.randomUUID() in modern Chrome/Safari/Firefox.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older WebViews — RFC 4122 variant via getRandomValues.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  // Last-ditch fallback. We accept very low entropy here because anyone
  // running without WebCrypto is on a museum-piece browser.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function readIdentity(): Identity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.deviceId !== 'string' || parsed.deviceId.trim() === '') return null;
    if (typeof parsed.displayName !== 'string') return null;
    return {
      deviceId: parsed.deviceId,
      displayName: parsed.displayName,
      venmoHandle: parsed.venmoHandle,
      zelleHandle: parsed.zelleHandle,
      lastVenue: parsed.lastVenue,
    };
  } catch {
    return null;
  }
}

export function writeIdentity(id: Identity): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

export function clearIdentity(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(IDENTITY_KEY);
}

/**
 * Returns the existing identity if present, else mints a new one with the
 * given (trimmed) display name. Caller is responsible for validating that
 * displayName isn't empty.
 */
export function ensureIdentity(displayName: string): Identity {
  const existing = readIdentity();
  if (existing) {
    if (existing.displayName === displayName.trim()) return existing;
    const next: Identity = { ...existing, displayName: displayName.trim() };
    writeIdentity(next);
    return next;
  }
  const next: Identity = {
    deviceId: uuidv4(),
    displayName: displayName.trim(),
  };
  writeIdentity(next);
  return next;
}
