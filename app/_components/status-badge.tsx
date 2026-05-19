import type { ReactNode } from 'react';

export type BadgeTone = 'green' | 'yellow' | 'grey' | 'blue' | 'lead';

const TONES: Record<BadgeTone, string> = {
  // "You're in" — emerald-tinted
  green: 'tag tag-host',
  // "Waitlist #N"
  yellow: 'tag tag-waitlist',
  // "Not voted" / "Dropped" — neutral chip
  grey: 'tag',
  // Reserved (kept for backwards compat)
  blue: 'tag',
  // Lead-only
  lead: 'tag tag-host',
};

interface StatusBadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, className = '' }: StatusBadgeProps) {
  return (
    <span className={`${TONES[tone]} tabular-nums ${className}`.trim()}>{children}</span>
  );
}
