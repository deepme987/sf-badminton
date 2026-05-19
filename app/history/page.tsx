import { getDb } from '@/lib/db/client';
import { listPastSessions } from '@/lib/services';
import { HistoryList } from '@/app/_components/history-list';
import { AppBar, IconButton } from '@/app/_components/app-bar';
import { IconArrowLeft } from '@/app/_components/icons';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HistoryPage() {
  let past: Awaited<ReturnType<typeof listPastSessions>> = [];
  try {
    past = await listPastSessions(getDb());
  } catch {
    // soft fail
  }

  return (
    <>
      <AppBar
        left={
          <IconButton href="/" aria-label="Back to sessions">
            <IconArrowLeft />
          </IconButton>
        }
        title="History"
      />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <HistoryList sessions={past} />
      </main>
    </>
  );
}
