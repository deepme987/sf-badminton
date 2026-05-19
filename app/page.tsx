import { getDb } from '@/lib/db/client';
import { listPastSessions, listUpcomingSessions } from '@/lib/services';
import { HomePageClient } from './_components/home-page-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HomePage() {
  const db = getDb();
  // Server-side fetch via the service layer (avoids the HTTP round-trip per
  // PHASE B brief). If anything goes wrong we surface an empty list to the
  // client and let it carry on — the client refetches anyway.
  let upcoming: Awaited<ReturnType<typeof listUpcomingSessions>> = [];
  let past: Awaited<ReturnType<typeof listPastSessions>> = [];
  try {
    [upcoming, past] = await Promise.all([
      listUpcomingSessions(db),
      listPastSessions(db),
    ]);
  } catch {
    // Surface as an empty state; the client component renders its own
    // onboarding/empty flows.
  }

  return <HomePageClient initialUpcoming={upcoming} initialPast={past} />;
}
