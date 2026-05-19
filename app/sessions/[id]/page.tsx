import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { getSession } from '@/lib/services';
import { isServiceError } from '@/lib/errors';
import { SessionDetailClient } from '@/app/_components/session-detail-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ firstView?: string }>;
}

const TZ = 'America/Los_Angeles';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const session = await getSession(getDb(), id);
    const venue = session.venue === 'Other' ? (session.venueCustom ?? 'Other') : session.venue;
    const start = new Date(session.startsAt);
    const day = start.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: TZ,
    });
    const time = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: TZ,
    });
    const confirmed = session.courts.reduce((sum, c) => sum + c.slots.length, 0);
    const totalCapacity = session.courts.reduce((sum, c) => sum + c.capacity, 0);
    const waitlist = session.waitlist.length;
    const title = `${venue} · ${day} ${time}`;
    const description =
      waitlist > 0
        ? `${confirmed}/${totalCapacity} confirmed · ${waitlist} on waitlist`
        : `${confirmed}/${totalCapacity} confirmed · ${totalCapacity - confirmed} spots open`;
    const ogImage = `/og/sessions/${encodeURIComponent(id)}`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {
      title: 'Session not found · Vibe Badminton',
      description: 'This session is gone. The lead probably deleted it.',
    };
  }
}

export default async function SessionDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;
  const firstView = search.firstView === '1';

  try {
    const session = await getSession(getDb(), id);
    return <SessionDetailClient initialSession={session} firstView={firstView} />;
  } catch (err) {
    if (isServiceError(err) && err.code === 'not_found') {
      return <SessionNotFound />;
    }
    throw err;
  }
}

function SessionNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="max-w-md text-center">
        <h1 className="t-page text-ink mb-3">This session is gone.</h1>
        <p className="t-body text-ink-soft mb-6">
          The lead probably deleted it. Ask in the chat for a new link.
        </p>
        <Link href="/" className="btn-primary">
          Back to home
        </Link>
      </div>
    </main>
  );
}
