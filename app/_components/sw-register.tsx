'use client';

/**
 * Service-worker registration. Mounts as a tiny client component in the
 * root layout; renders nothing.
 *
 * Behaviour:
 *   - Production only. In dev (`NODE_ENV !== 'production'`) we no-op, so
 *     the worker doesn't shadow `next dev`'s HMR / cache headers.
 *   - Browsers only register service workers on secure origins (https) and
 *     `http://localhost`; we don't need to guard for that because the
 *     `serviceWorker` API itself short-circuits on insecure origins.
 *   - Waits for the `load` event before kicking off `register()` so we
 *     don't compete with the first paint or hydration for network.
 *   - Failures are logged but never thrown — a broken SW must not crash
 *     the app.
 */

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[sw] register failed', err);
        });
    };

    // `load` may have already fired by the time we run (we mount after
    // hydration); register immediately in that case, otherwise wait.
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
