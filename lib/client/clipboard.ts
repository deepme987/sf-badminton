/**
 * Clipboard helper with fallback for non-secure contexts.
 *
 * `navigator.clipboard.writeText()` requires a secure context (HTTPS or
 * localhost). When the user opens the app over a LAN IP like
 * `http://192.168.1.50:3000`, the browser treats it as non-secure and either
 * throws or returns a rejected promise. We fall back to the legacy
 * `document.execCommand('copy')` after staging the text in a hidden
 * `<textarea>`. That path still works on HTTP/LAN in every browser we care
 * about.
 *
 * Returns true on success, false on failure. The caller is responsible for
 * the toast (we don't want this module to know about the toast surface).
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // Modern path — only works in secure contexts (https://, http://localhost).
  // Wrap in try/catch because some browsers throw synchronously when called
  // from an insecure origin.
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }

  // Legacy fallback: stage text in an off-screen <textarea>, select, copy,
  // remove. Works over HTTP LAN in Safari/Chrome/Firefox. The textarea must
  // be visible-ish to the layout engine (display:none disables selection),
  // hence position:fixed off-screen + opacity:0.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    // Save current selection so we can restore it. Some pages have an
    // active text selection the user cares about.
    const previousSelection = document.getSelection();
    const previousRange =
      previousSelection && previousSelection.rangeCount > 0
        ? previousSelection.getRangeAt(0)
        : null;
    ta.focus();
    ta.select();
    // iOS Safari needs setSelectionRange to actually select.
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (previousRange && previousSelection) {
      previousSelection.removeAllRanges();
      previousSelection.addRange(previousRange);
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Result of a `shareUrl` attempt.
 *
 *   - `shared`  → `navigator.share` succeeded; the OS-level share sheet
 *                 handled user feedback. The caller should NOT toast.
 *   - `copied`  → fell back to clipboard copy and succeeded. The caller
 *                 should toast "Link copied."
 *   - `failed`  → neither path worked. The caller should toast a failure.
 *
 * AbortError from `navigator.share` (user dismissed the share sheet) is
 * treated as `failed` so the caller can decide whether to show a toast.
 * In practice the existing call sites suppress the toast on abort by
 * checking the result.
 */
export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareUrl(opts: {
  title: string;
  text?: string;
  url: string;
}): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(opts);
      return 'shared';
    } catch (err) {
      // User cancelled the share sheet — don't fall through to clipboard,
      // they made an explicit dismissal choice.
      const name = (err as { name?: string })?.name;
      if (name === 'AbortError') return 'failed';
      // Any other failure (NotAllowedError on non-secure context, etc.)
      // falls through to the clipboard path.
    }
  }
  const ok = await copyText(opts.url);
  return ok ? 'copied' : 'failed';
}
