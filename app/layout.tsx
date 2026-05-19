import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from './_components/toast';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

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
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/icon-512.png',
  },
  openGraph: {
    title: 'SFB',
    description: 'Who is playing this week.',
    type: 'website',
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
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
