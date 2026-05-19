import { ImageResponse } from 'next/og';
import { getDb } from '@/lib/db/client';
import { getSession } from '@/lib/services';
import type { SessionView } from '@/lib/services/types';
import { isServiceError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;
const TZ = 'America/Los_Angeles';

// ─── Sheet design tokens (light) ──────────────────────────────────────────
const BG = '#FAFAFA';
const SURFACE = '#FFFFFF';
const ZEBRA = '#FAFAF9';
const INK = '#171717';
const INK_SOFT = '#737373';
const INK_FAINT = '#A3A3A3';
const RULE = '#E7E5E4';
const ACCENT = '#059669';

// ─── Inter font loading (cached per process) ──────────────────────────────
type FontWeight = 400 | 500 | 600;
interface InterFonts {
  regular: ArrayBuffer;
  medium: ArrayBuffer;
  semibold: ArrayBuffer;
}

let fontsPromise: Promise<InterFonts> | null = null;

function loadFonts(): Promise<InterFonts> {
  if (!fontsPromise) {
    const url = (weight: FontWeight) =>
      `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${weight}-normal.ttf`;
    fontsPromise = Promise.all([
      fetch(url(400)).then((r) => r.arrayBuffer()),
      fetch(url(500)).then((r) => r.arrayBuffer()),
      fetch(url(600)).then((r) => r.arrayBuffer()),
    ]).then(([regular, medium, semibold]) => ({ regular, medium, semibold }));
  }
  return fontsPromise;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RenderInput {
  id: string;
  venueLabel: string;
  dayLabel: string;
  timeLabel: string;
  confirmed: number;
  totalCapacity: number;
  waitlistCount: number;
  spotsOpen: number;
}

function formatDayLabel(startsAt: number): string {
  return new Date(startsAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: TZ,
  });
}

function formatTimeLabel(startsAt: number, endsAt: number): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  };
  const start = new Date(startsAt).toLocaleTimeString('en-US', opts);
  const end = new Date(endsAt).toLocaleTimeString('en-US', opts);
  return `${start} – ${end}`;
}

function projectSession(id: string, session: SessionView): RenderInput {
  const confirmed = session.courts.reduce((sum, c) => sum + c.slots.length, 0);
  const totalCapacity = session.courts.reduce((sum, c) => sum + c.capacity, 0);
  const waitlistCount = session.waitlist.length;
  const spotsOpen = Math.max(0, totalCapacity - confirmed);
  const venueLabel = session.venue === 'Other' ? (session.venueCustom ?? 'Other') : session.venue;

  return {
    id,
    venueLabel,
    dayLabel: formatDayLabel(session.startsAt),
    timeLabel: formatTimeLabel(session.startsAt, session.endsAt),
    confirmed,
    totalCapacity,
    waitlistCount,
    spotsOpen,
  };
}

function StatusItem({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span
        style={{
          color: INK,
          fontSize: 32,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span style={{ color: INK_SOFT, fontSize: 26, fontWeight: 400 }}>{label}</span>
    </div>
  );
}

function Separator() {
  return <span style={{ color: INK_FAINT, fontSize: 26 }}>·</span>;
}

function renderCard(input: RenderInput) {
  const { id, venueLabel, dayLabel, timeLabel, confirmed, totalCapacity, waitlistCount, spotsOpen } =
    input;

  const showWaitlist = waitlistCount > 0;
  const showSpotsOpen = !showWaitlist && spotsOpen > 0;

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
      }}
    >
      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '40px 72px',
          borderBottom: `1px solid ${RULE}`,
          background: SURFACE,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: ACCENT,
            }}
          />
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: INK_SOFT,
            }}
          >
            SF Badminton
          </span>
        </div>
        <span
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: INK,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {dayLabel.toUpperCase()}
        </span>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 72px',
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: INK_SOFT,
          }}
        >
          {venueLabel}
        </div>
        <div
          style={{
            fontSize: 132,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: INK,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {timeLabel}
        </div>
      </div>

      {/* ── Footer meta strip ───────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '32px 72px',
          borderTop: `1px solid ${RULE}`,
          background: ZEBRA,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <StatusItem value={`${confirmed}/${totalCapacity}`} label="confirmed" />
          {showWaitlist && (
            <>
              <Separator />
              <StatusItem value={String(waitlistCount)} label="waiting" />
            </>
          )}
          {showSpotsOpen && (
            <>
              <Separator />
              <StatusItem
                value={String(spotsOpen)}
                label={spotsOpen === 1 ? 'spot open' : 'spots open'}
              />
            </>
          )}
        </div>
        <span
          style={{
            fontSize: 22,
            color: INK_FAINT,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          /s/{id}
        </span>
      </div>
    </div>
  );
}

function renderNotFound() {
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
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '40px 72px',
          borderBottom: `1px solid ${RULE}`,
          background: SURFACE,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: ACCENT,
          }}
        />
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: INK_SOFT,
          }}
        >
          SF Badminton
        </span>
      </div>

      {/* Center body */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 72px',
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 84,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: INK,
            textAlign: 'center',
          }}
        >
          This session is gone.
        </div>
        <div
          style={{
            fontSize: 28,
            color: INK_SOFT,
            fontWeight: 400,
            textAlign: 'center',
          }}
        >
          The lead probably deleted it.
        </div>
      </div>
    </div>
  );
}

const OG_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
};

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const fonts = await loadFonts();
  const interFonts = [
    { name: 'Inter', data: fonts.regular, style: 'normal' as const, weight: 400 as const },
    { name: 'Inter', data: fonts.medium, style: 'normal' as const, weight: 500 as const },
    { name: 'Inter', data: fonts.semibold, style: 'normal' as const, weight: 600 as const },
  ];

  try {
    const session = await getSession(getDb(), id);
    const input = projectSession(id, session);
    return new ImageResponse(renderCard(input), {
      width: WIDTH,
      height: HEIGHT,
      fonts: interFonts,
      headers: OG_HEADERS,
    });
  } catch (err) {
    if (isServiceError(err) && err.code === 'not_found') {
      return new ImageResponse(renderNotFound(), {
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
