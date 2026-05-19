'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/lib/client/use-identity';
import { useTheme } from '@/lib/client/use-theme';
import type { ThemeMode } from '@/lib/client/theme';
import { Button } from '@/app/_components/button';
import { Modal } from '@/app/_components/modal';
import { useToast } from '@/app/_components/toast';
import { AppBar, IconButton } from '@/app/_components/app-bar';
import { IconArrowLeft } from '@/app/_components/icons';

export default function ProfilePage() {
  const router = useRouter();
  const { identity, isReady, setName, setHandles, clear } = useIdentity();
  const toast = useToast();
  const { mode, setMode, isReady: themeReady } = useTheme();

  const [name, setNameLocal] = useState('');
  const [venmo, setVenmo] = useState('');
  const [zelle, setZelle] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!identity) {
      router.replace('/');
      return;
    }
    setNameLocal(identity.displayName);
    setVenmo(identity.venmoHandle ?? '');
    setZelle(identity.zelleHandle ?? '');
  }, [isReady, identity, router]);

  if (!isReady || !identity) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-soft t-small">
        Loading…
      </main>
    );
  }

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setNameError('Pick a name so people know who you are.');
      return;
    }
    if (trimmed !== identity.displayName) {
      try {
        setName(trimmed);
        toast.show('Name updated.', 'success');
      } catch (cause) {
        setNameError(cause instanceof Error ? cause.message : 'Could not save.');
      }
    }
    setNameError(null);
  };

  const handleVenmoBlur = () => {
    const trimmed = venmo.trim();
    if (trimmed !== (identity.venmoHandle ?? '')) {
      setHandles({ venmoHandle: trimmed });
      toast.show('Venmo updated.', 'success');
    }
  };

  const handleZelleBlur = () => {
    const trimmed = zelle.trim();
    if (trimmed !== (identity.zelleHandle ?? '')) {
      setHandles({ zelleHandle: trimmed });
      toast.show('Zelle updated.', 'success');
    }
  };

  const handleClear = () => {
    clear();
    router.push('/');
  };

  return (
    <>
      <AppBar
        left={
          <IconButton href="/" aria-label="Back to sessions">
            <IconArrowLeft />
          </IconButton>
        }
        title="Profile"
      />
      <main id="main" className="max-w-md mx-auto px-4 sm:px-6 py-6">
        <section className="mb-8">
        <label htmlFor="profile-name" className="block t-label mb-1.5">
          Your name
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setNameLocal(e.target.value)}
          onBlur={handleNameBlur}
          className="input-field"
        />
        {nameError ? (
          <p className="t-small text-danger mt-1.5">{nameError}</p>
        ) : (
          <p className="t-small text-ink-faint mt-1.5">
            This is how you show up on rosters. New name applies to sessions you join from now
            on.
          </p>
        )}
      </section>

      <hr className="border-rule my-6" />

      <section className="mb-8">
        <h2 className="t-label mb-3">Payment handles (optional)</h2>
        <p className="t-small text-ink-faint mb-4">
          Stored on this device only. Shown to others when the lead opens the cost split.
        </p>
        <label htmlFor="profile-venmo" className="block t-label mb-1.5">
          Venmo
        </label>
        <input
          id="profile-venmo"
          type="text"
          value={venmo}
          onChange={(e) => setVenmo(e.target.value)}
          onBlur={handleVenmoBlur}
          placeholder="@your-handle"
          className="input-field mb-3"
        />
        <label htmlFor="profile-zelle" className="block t-label mb-1.5">
          Zelle
        </label>
        <input
          id="profile-zelle"
          type="text"
          value={zelle}
          onChange={(e) => setZelle(e.target.value)}
          onBlur={handleZelleBlur}
          placeholder="email or phone"
          className="input-field"
        />
      </section>

      <hr className="border-rule my-6" />

      <section className="mb-8">
        <h2 className="t-label mb-3">Appearance</h2>
        <p className="t-small text-ink-faint mb-3">
          Switch between light and dark. System matches your OS setting.
        </p>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex items-center gap-2"
        >
          {(['light', 'dark', 'system'] as const).map((m) => {
            const selected = themeReady && mode === m;
            const className = selected ? 'btn-primary' : 'btn-ghost';
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m as ThemeMode)}
                className={`${className} flex-1 capitalize`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </section>

      <hr className="border-rule my-6" />

      <section className="mb-8">
        <h2 className="t-label mb-3">About</h2>
        <p className="t-small text-ink-faint">SF Badminton · v0.1</p>
      </section>

      <hr className="border-rule my-6" />

      <section className="mb-8">
        <Button variant="ghost" onClick={() => setConfirmClear(true)}>
          Clear this device&apos;s data
        </Button>
        <p className="t-small text-ink-faint mt-2">
          Removes your name and any creator codes from this device. Doesn&apos;t affect any
          sessions you joined.
        </p>
      </section>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear this device?"
      >
        <p className="t-body text-ink-soft mb-5">
          This removes your name and payment handles. Sessions you joined will still exist for
          everyone else.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={() => setConfirmClear(false)}>
            Cancel
          </Button>
          <Button variant="danger" fullWidth onClick={handleClear}>
            Clear data
          </Button>
        </div>
      </Modal>
      </main>
    </>
  );
}
