import { ImageResponse } from 'next/og';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db/client';
import { getSession } from '@/lib/services';
import type { SessionView } from '@/lib/services/types';
import { isServiceError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;
const DEFAULT_TZ = 'America/Los_Angeles';

// ─── Sheet design tokens (light) ──────────────────────────────────────────
const BG = '#FAFAFA';
const INK = '#171717';
const INK_SOFT = '#737373';
const INK_FAINT = '#A3A3A3';
const ACCENT = '#059669';
const ACCENT_INK = '#FFFFFF';
const HAIRLINE = '#E5E5E5';

/**
 * Resolve the IANA timezone for the OG image. Accepts `?tz=America/New_York`
 * via the query string; falls back to PT if missing or unparseable. We
 * validate by attempting to construct a DateTimeFormat — invalid zones
 * throw a RangeError which we catch.
 */
function resolveTz(req: Request): string {
  try {
    const url = new URL(req.url);
    const candidate = url.searchParams.get('tz');
    if (!candidate) return DEFAULT_TZ;
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TZ;
  }
}

// ─── Inter font loading (cached per process) ──────────────────────────────
let fontsPromise: Promise<{ regular: ArrayBuffer; semibold: ArrayBuffer }> | null = null;
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

// ─── Icon embedding (cached per process) ──────────────────────────────────
let iconDataUri: string | null = null;
async function getIconDataUri(): Promise<string> {
  if (iconDataUri) return iconDataUri;
  const buf = await fs.readFile(path.join(process.cwd(), 'public', 'icon-512.png'));
  iconDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  return iconDataUri;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RenderInput {
  id: string;
  venueLabel: string;
  weekday: string;
  dayNum: string;
  month: string;
  timeLabel: string;
}

function formatTimeLabel(startsAt: number, endsAt: number, tz: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  };
  const start = new Date(startsAt).toLocaleTimeString('en-US', opts);
  const end = new Date(endsAt).toLocaleTimeString('en-US', opts);
  return `${start} – ${end}`;
}

function projectSession(id: string, session: SessionView, tz: string): RenderInput {
  const d = new Date(session.startsAt);
  return {
    id,
    venueLabel: session.venue === 'Other' ? (session.venueCustom ?? 'Other') : session.venue,
    weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz }).toUpperCase(),
    dayNum: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz }),
    month: d.toLocaleDateString('en-US', { month: 'short', timeZone: tz }).toUpperCase(),
    timeLabel: formatTimeLabel(session.startsAt, session.endsAt, tz),
  };
}

/**
 * Session card OG — ticket-stub layout. The two questions a recipient asks
 * when a link drops in WhatsApp are "when?" and "where?". Both need to land
 * before they decide to tap. Left stub: calendar tear-off (weekday, day
 * number, month) on accent so the date is the visual anchor. Right pane:
 * TIME and LOCATION stacked at near-equal weight with small label tags.
 * Live counts are deliberately omitted — OG images cache at share time, so
 * any number baked in would be stale within minutes. The page itself has
 * truth.
 */
function renderCard(input: RenderInput) {
  const { id, venueLabel, weekday, dayNum, month, timeLabel } = input;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: BG,
        color: INK,
        fontFamily: 'Inter',
        padding: 64,
        gap: 56,
      }}
    >
      {/* Left — calendar stub (the visual anchor) */}
      <div
        style={{
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: ACCENT,
          color: ACCENT_INK,
          borderRadius: 28,
          padding: '36px 24px',
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: '0.24em',
            opacity: 0.92,
          }}
        >
          {weekday}
        </div>
        <div
          style={{
            fontSize: 240,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            marginTop: 8,
          }}
        >
          {dayNum}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: '0.24em',
            opacity: 0.92,
            marginTop: 8,
          }}
        >
          {month}
        </div>
      </div>

      {/* Right — TIME + LOCATION (the two glanceable answers) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 36,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: INK_SOFT,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: ACCENT }} />
          SFB · Session
        </div>

        {/* TIME */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: INK_FAINT,
            }}
          >
            Time
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              fontVariantNumeric: 'tabular-nums',
              color: INK,
            }}
          >
            {timeLabel}
          </div>
        </div>

        {/* LOCATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: INK_FAINT,
            }}
          >
            Location
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: INK,
            }}
          >
            {venueLabel}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: `1px solid ${HAIRLINE}`,
            fontSize: 22,
            color: INK_FAINT,
            fontFeatureSettings: '"tnum" 1',
          }}
        >
          <span>sf-badminton.vercel.app</span>
          <span>/s/{id}</span>
        </div>
      </div>
    </div>
  );
}

function renderNotFound(iconDataUri: string) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: BG,
        color: INK,
        fontFamily: 'Inter',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        gap: 32,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconDataUri} width={200} height={200} alt="" />
      <div
        style={{
          fontSize: 64,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: INK,
          textAlign: 'center',
        }}
      >
        This session is gone.
      </div>
      <div style={{ fontSize: 28, color: INK_SOFT, textAlign: 'center' }}>
        The lead probably deleted it.
      </div>
    </div>
  );
}

const OG_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
};

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const tz = resolveTz(req);
  const [icon, fonts] = await Promise.all([getIconDataUri(), loadFonts()]);
  const interFonts = [
    { name: 'Inter', data: fonts.regular, style: 'normal' as const, weight: 400 as const },
    { name: 'Inter', data: fonts.semibold, style: 'normal' as const, weight: 600 as const },
  ];

  try {
    const session = await getSession(getDb(), id);
    const input = projectSession(id, session, tz);
    return new ImageResponse(renderCard(input), {
      width: WIDTH,
      height: HEIGHT,
      fonts: interFonts,
      headers: OG_HEADERS,
    });
  } catch (err) {
    if (isServiceError(err) && err.code === 'not_found') {
      return new ImageResponse(renderNotFound(icon), {
        width: WIDTH,
        height: HEIGHT,
        status: 404,
        fonts: interFonts,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    throw err;
  }
}
