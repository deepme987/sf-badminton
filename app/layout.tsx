import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ToastProvider } from './_components/toast';
import { ServiceWorkerRegister } from './_components/sw-register';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * Resolve the canonical site URL for absolute metadata.
 *
 * Order of precedence:
 *  1. NEXT_PUBLIC_SITE_URL — set by the deployer when a custom domain exists
 *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production alias
 *     (e.g. sf-badminton.vercel.app), available in Next 14.2+
 *  3. VERCEL_URL — per-deploy preview URL (e.g. sf-badminton-abc.vercel.app)
 *  4. localhost fallback for dev
 *
 * Used as `metadataBase` so relative OG image URLs resolve to absolute https
 * URLs that crawlers (WhatsApp, iMessage, Twitter, etc.) can actually fetch.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // In-app wordmark is "SFB"; the manifest's full name stays "SF Badminton"
  // (see public/manifest.webmanifest) so the home-screen launcher reads
  // properly.
  title: 'SFB',
  description: 'Who is playing this week.',
  applicationName: 'SFB',
  appleWebApp: {
    capable: true,
    title: 'SFB',
    statusBarStyle: 'default',
  },
  manifest: '/manifest.webmanifest',
  // Favicon, icon, and apple-icon are auto-routed from app/favicon.ico,
  // app/icon.png, and app/apple-icon.png — no need to declare them here.
  openGraph: {
    title: 'SF Badminton',
    description: 'Who is playing this week.',
    url: siteUrl,
    siteName: 'SF Badminton',
    type: 'website',
    locale: 'en_US',
    // Explicitly reference the auto-routed app/opengraph-image.tsx so the
    // <meta property="og:image"> tag is always emitted, even when other
    // metadata fields override the page-level defaults. Crawlers without
    // JS won't follow Next's auto-attached image — being explicit is
    // belt-and-suspenders.
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'SF Badminton — who is playing this week',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SF Badminton',
    description: 'Who is playing this week.',
    images: ['/opengraph-image'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAFA' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0A' },
  ],
};

/**
 * Read the persisted theme from localStorage and apply it to <html> before
 * first paint. This is the only way to avoid the light/dark flash.
 *
 * Default (no value in localStorage) is "light". This is a deliberate UX
 * decision — user feedback was that light reads cleaner on this sheet
 * design. Users who want dark or system-following can pick it from the
 * 3-way selector in /profile.
 */
const THEME_FOUC_SCRIPT = `(function(){try{var m=localStorage.getItem('vibe.theme');if(!m){document.documentElement.setAttribute('data-theme','light');return;}var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_FOUC_SCRIPT }} />
      </head>
      {/* min-h-screen replaced with the dvh+svh stack in globals.css so the
        * mobile chrome doesn't leave white space beneath content. */}
      <body>
        {/* Skip-to-content — first focusable on the page for keyboard users.
          * Lives outside the toast provider so it isn't gated on any context.
          * Targets `#main` which each page's `<main>` element opts into. */}
        <a href="#main" className="skip-link sr-only focus:not-sr-only">
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  );
}
