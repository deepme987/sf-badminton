import Link from 'next/link';
import { AppBar, IconButton } from './_components/app-bar';
import { IconArrowLeft } from './_components/icons';

/**
 * Global 404. Shown whenever a server component throws `notFound()` or the
 * router can't match a route. Wears the same chrome as the rest of the app
 * so users don't lose context.
 */
export default function NotFound() {
  return (
    <>
      <AppBar
        left={
          <IconButton href="/" aria-label="Back to sessions">
            <IconArrowLeft />
          </IconButton>
        }
        title="Not found"
      />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="t-page text-ink mb-3">Nothing here.</h1>
        <p className="t-body text-ink-soft mb-6">
          The link might be old, or whoever shared it deleted the page.
        </p>
        <Link href="/" className="btn-primary">
          Back to home
        </Link>
      </main>
    </>
  );
}
