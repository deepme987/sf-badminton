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
  dayLabel: string;
  timeLabel: string;
}

function formatDayLabel(startsAt: number, tz: string): string {
  return new Date(startsAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  });
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
  return {
    id,
    venueLabel: session.venue === 'Other' ? (session.venueCustom ?? 'Other') : session.venue,
    dayLabel: formatDayLabel(session.startsAt, tz),
    timeLabel: formatTimeLabel(session.startsAt, session.endsAt, tz),
  };
}

/**
 * Session card OG. Mirrors the home OG layout (icon on the left, content on
 * the right) so shared links from the app feel like they belong to the same
 * brand surface. Deliberately omits any live counts — OG images are cached
 * at share time, so any number we bake in would be stale within minutes.
 * The recipient gets enough to decide whether to tap; they get truth on
 * the page itself.
 */
function renderCard(input: RenderInput, iconDataUri: string) {
  const { id, venueLabel, dayLabel, timeLabel } = input;

  return (
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
      {/* Left — icon */}
      <div
        style={{
          width: 320,
          height: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 56,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconDataUri} width={320} height={320} alt="" />
      </div>

      {/* Right — kicker, venue (hero), time, day */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: INK_SOFT,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: ACCENT }} />
          SFB · Session
        </div>
        <div
          style={{
            fontSize: 112,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: INK,
          }}
        >
          {venueLabel}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: INK,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
            marginTop: 8,
          }}
        >
          {timeLabel}
        </div>
        <div
          style={{
            fontSize: 30,
            color: INK_SOFT,
            fontWeight: 400,
          }}
        >
          {dayLabel}
        </div>
        <div
          style={{
            fontSize: 22,
            color: INK_FAINT,
            fontFeatureSettings: '"tnum" 1',
            marginTop: 16,
          }}
        >
          /s/{id}
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
    return new ImageResponse(renderCard(input, icon), {
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
