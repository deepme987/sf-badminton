'use client';

import { useEffect, useRef, useState } from 'react';
import { IconButton } from './app-bar';
import { IconDownload } from './icons';

/**
 * PWA install button + iOS hint card. Replaces the theme toggle in the
 * AppBar's right slot. Behavior split:
 *
 *   - Android Chrome (+ desktop Chrome / Edge): fires `beforeinstallprompt`
 *     when the install criteria are met. We capture the event, surface a
 *     download icon button, and call `prompt()` on tap. Once the user
 *     accepts or dismisses we hide the button for this session — the
 *     browser won't re-fire the event.
 *
 *   - iOS Safari: does NOT fire `beforeinstallprompt`. We detect iOS Safari
 *     via UA and surface a one-time hint card the FIRST visit only
 *     ("tap Share → Add to Home Screen"). Permanent dismiss via localStorage
 *     so we don't pester returning users.
 *
 *   - PWA already installed (displayed in standalone mode): render nothing.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const IOS_HINT_DISMISS_KEY = 'vibe.pwa-ios-hint.dismissed';

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [iosHintOpen, setIosHintOpen] = useState(false);
  const isIosSafariRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect PWA-already-installed. Both display-mode media query and the
    // iOS-specific navigator.standalone cover the two surfaces.
    const standaloneMql = window.matchMedia('(display-mode: standalone)');
    const navWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const standalone = standaloneMql.matches || navWithStandalone.standalone === true;
    setIsStandalone(standalone);
    const onStandaloneChange = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    standaloneMql.addEventListener('change', onStandaloneChange);

    // iOS Safari detection. iOS does not fire `beforeinstallprompt`, so we
    // need to know to show the hint card instead. We use the standard UA
    // check (`/iPad|iPhone|iPod/.test(navigator.userAgent)`) and exclude
    // legacy WebView / IE 11 via the `!window.MSStream` guard the MDN
    // example uses. We further narrow to "Safari" (excludes Chrome on iOS,
    // which doesn't get install prompts either but at least won't see a
    // misleading hint).
    const ua = window.navigator.userAgent;
    const winWithMs = window as Window & { MSStream?: unknown };
    const isIos = /iPad|iPhone|iPod/.test(ua) && !winWithMs.MSStream;
    // CriOS = Chrome on iOS, FxiOS = Firefox on iOS, EdgiOS = Edge on iOS.
    const isIosSafari = isIos && !/CriOS|FxiOS|EdgiOS/.test(ua);
    isIosSafariRef.current = isIosSafari;

    if (!standalone && isIosSafari) {
      try {
        const dismissed = window.localStorage.getItem(IOS_HINT_DISMISS_KEY) === '1';
        if (!dismissed) setIosHintOpen(true);
      } catch {
        // localStorage unavailable — don't show the hint either, it would
        // re-show forever.
      }
    }

    const onBeforeInstall = (e: Event) => {
      // Suppress the browser's default install banner so we can render our
      // own button in the chrome.
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setPromptEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      standaloneMql.removeEventListener('change', onStandaloneChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleClick = async () => {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // user gesture lost or other browser quirk — fall through, the
      // event is one-shot so just clear it.
    }
    setPromptEvent(null);
  };

  const handleDismissHint = () => {
    setIosHintOpen(false);
    try {
      window.localStorage.setItem(IOS_HINT_DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  if (isStandalone) return null;

  // Three render paths:
  //   - Android / desktop Chrome: native prompt button (always visible once
  //     the event fires).
  //   - iOS Safari: button that toggles the "tap Share → Add to Home Screen"
  //     hint card. Persistent so it's always discoverable, not just first
  //     visit.
  //   - Other browsers (Firefox, etc): render nothing — there's no install
  //     path we can offer.
  const showNativeButton = !!promptEvent;
  const showIosButton = isIosSafariRef.current;
  if (!showNativeButton && !showIosButton) return null;

  return (
    <>
      <IconButton
        aria-label={showNativeButton ? 'Install app' : 'How to install'}
        onClick={showNativeButton ? handleClick : () => setIosHintOpen((v) => !v)}
      >
        <IconDownload />
      </IconButton>
      {iosHintOpen ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-1.5rem)] w-[22rem] bg-surface border border-rule rounded-md shadow-lg px-3 py-3 flex items-start gap-3"
        >
          <div className="flex-1 min-w-0 t-small text-ink-soft">
            Install to your home screen: tap{' '}
            <span className="text-ink font-medium">Share</span>, then{' '}
            <span className="text-ink font-medium">Add to Home Screen</span>.
          </div>
          <button
            type="button"
            onClick={handleDismissHint}
            className="text-link h-7 w-7 flex items-center justify-center"
            aria-label="Dismiss install hint"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
