/**
 * @vitest-environment happy-dom
 *
 * Unit tests for the clipboard helper. We test BOTH paths:
 *   1) Modern `navigator.clipboard.writeText` in a secure context.
 *   2) Legacy `document.execCommand('copy')` fallback when the modern API
 *      isn't available or `window.isSecureContext` is false (the LAN /
 *      HTTP-IP case the user actually hit).
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { copyText } from '@/lib/client/clipboard';

describe('copyText', () => {
  let origClipboard: PropertyDescriptor | undefined;
  let origIsSecureContext: PropertyDescriptor | undefined;
  let origExecCommand: typeof document.execCommand;

  beforeEach(() => {
    origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    origIsSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    origExecCommand = document.execCommand;
  });

  afterEach(() => {
    if (origClipboard) {
      Object.defineProperty(navigator, 'clipboard', origClipboard);
    } else {
      // happy-dom sometimes doesn't ship clipboard; just delete if we
      // added one.
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
    if (origIsSecureContext) {
      Object.defineProperty(window, 'isSecureContext', origIsSecureContext);
    }
    document.execCommand = origExecCommand;
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard.writeText in a secure context', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });

    const ok = await copyText('hello-secure');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello-secure');
  });

  it('falls back to execCommand when isSecureContext is false (LAN/HTTP)', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    const execCmd = vi.fn(() => true);
    document.execCommand = execCmd;

    const ok = await copyText('hello-lan');
    expect(ok).toBe(true);
    // Modern API must NOT be used here — the secure-context check should
    // gate it off.
    expect(writeText).not.toHaveBeenCalled();
    expect(execCmd).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when navigator.clipboard throws', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('blocked')));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    const execCmd = vi.fn(() => true);
    document.execCommand = execCmd;

    const ok = await copyText('hello-throw');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCmd).toHaveBeenCalledWith('copy');
  });

  it('returns false when both paths fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    document.execCommand = vi.fn(() => false);

    const ok = await copyText('nope');
    expect(ok).toBe(false);
  });

  it('cleans up the temporary <textarea> after fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    document.execCommand = vi.fn(() => true);

    const before = document.querySelectorAll('textarea').length;
    await copyText('cleanup-please');
    const after = document.querySelectorAll('textarea').length;
    expect(after).toBe(before);
  });
});
