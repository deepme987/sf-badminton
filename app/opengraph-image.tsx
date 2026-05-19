import { ImageResponse } from 'next/og';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Next 13+ auto-routes this file as the page-level Open Graph image. Sessions
// override this via their own generateMetadata; this is the default for the
// home page and any other route that doesn't supply its own image.

export const runtime = 'nodejs';
export const alt = 'SF Badminton — who is playing this week';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Tokens (Sheet, light)
const BG = '#FAFAFA';
const INK = '#171717';
const INK_SOFT = '#737373';
const ACCENT = '#059669';

// Inter font — fetched once per process, baked into the OG output.
let fontsPromise: Promise<{
  regular: ArrayBuffer;
  semibold: ArrayBuffer;
}> | null = null;

function loadFonts() {
  if (!fontsPromise) {
    const url = (w: 400 | 600) =>
      `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${w}-normal.ttf`;
    fontsPromise = Promise.all([
      fetch(url(400)).then((r) => r.arrayBuffer()),
      fetch(url(600)).then((r) => r.arrayBuffer()),
    ]).then(([regular, semibold]) => ({ regular, semibold }));
  }
  return fontsPromise;
}

// Read the canonical app icon once per process so we can embed it inline.
let iconDataUri: string | null = null;
async function getIconDataUri(): Promise<string> {
  if (iconDataUri) return iconDataUri;
  const buf = await fs.readFile(path.join(process.cwd(), 'public', 'icon-512.png'));
  iconDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  return iconDataUri;
}

export default async function OG() {
  const [icon, fonts] = await Promise.all([getIconDataUri(), loadFonts()]);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: BG,
          color: INK,
          fontFamily: 'Inter',
          padding: 80,
        }}
      >
        {/* Left: icon */}
        <div
          style={{
            width: 360,
            height: 360,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 64,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} width={360} height={360} alt="" />
        </div>

        {/* Right: wordmark + tagline */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 28,
              color: INK_SOFT,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: ACCENT,
              }}
            />
            SFB
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: INK,
            }}
          >
            SF Badminton
          </div>
          <div
            style={{
              fontSize: 36,
              color: INK_SOFT,
              lineHeight: 1.3,
              marginTop: 8,
            }}
          >
            Who is playing this week.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: fonts.regular, style: 'normal', weight: 400 },
        { name: 'Inter', data: fonts.semibold, style: 'normal', weight: 600 },
      ],
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  );
}
