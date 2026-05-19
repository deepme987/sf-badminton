'use client';

import type { SlotView } from '@/lib/services/types';

interface SlotRowProps {
  slot: SlotView;
  /** Position chip — for confirmed slots use the position within court,
   * for waitlist use the W-position. */
  position: number;
  isWaitlist: boolean;
  isYou: boolean;
  /** Owner's display name if this is a +1, undefined if it's not. */
  plusOneHostName?: string;
  canDrop: boolean;
  onDrop: (slot: SlotView) => void;
  isDropping?: boolean;
  /** True when this slot belongs to the session creator. */
  isHost?: boolean;
}

export function SlotRow({
  slot,
  position,
  isWaitlist,
  isYou,
  plusOneHostName,
  canDrop,
  onDrop,
  isDropping = false,
  isHost = false,
}: SlotRowProps) {
  const positionLabel = isWaitlist ? `W${position}` : String(position);

  // Determine the tag — host wins over +1 wins over "you".
  let tagNode: React.ReactNode = null;
  if (isHost) {
    tagNode = <span className="tag tag-host">Host</span>;
  } else if (slot.isPlusOne) {
    tagNode = <span className="tag tag-plus">+1</span>;
  } else if (isYou) {
    tagNode = <span className="tag tag-you">You</span>;
  }

  const nameClass = isYou || isHost ? 't-body text-ink font-medium' : 't-body text-ink';

  const nameNode =
    slot.isPlusOne && plusOneHostName ? (
      <span className={nameClass} title={`${plusOneHostName}'s +1 (${slot.displayName})`}>
        {slot.displayName}
        <span className="text-ink-faint"> — via {plusOneHostName}</span>
      </span>
    ) : (
      <span className={nameClass} title={slot.displayName}>
        {slot.displayName}
      </span>
    );

  // +1 rows get a left hairline accent so the eye groups them visually under
  // their host. Single treatment — we DON'T also indent + show a tree glyph;
  // the hairline alone reads as "this row belongs to the row above."
  const rowClass = slot.isPlusOne
    ? 'sheet-row sheet-row-roster sheet-row-hover group is-plus-one'
    : 'sheet-row sheet-row-roster sheet-row-hover group';

  return (
    <div className={rowClass}>
      <div className="t-small text-ink-faint num-right tnum">{positionLabel}</div>
      <div className="min-w-0 truncate flex items-center gap-2">
        <span className="truncate">{nameNode}</span>
        {canDrop ? (
          // Mobile (no hover) needs the Drop affordance to be permanently
          // visible — we can't gate it on `:hover`. Desktop keeps the
          // opacity-0/hover-reveal so the cell isn't busy at rest. The
          // hover-pointer media query is the cleanest way to split the two
          // without UA sniffing.
          <button
            type="button"
            onClick={() => onDrop(slot)}
            disabled={isDropping || slot.id.startsWith('__optimistic__')}
            className="text-link t-small ml-auto drop-btn-affordance disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Drop ${slot.displayName}`}
          >
            {isDropping ? 'Dropping…' : 'Drop'}
          </button>
        ) : null}
      </div>
      <div>{tagNode}</div>
      <div className="col-joined t-small text-ink-faint num-right tnum">
        {formatJoined(slot.createdAt)}
      </div>
    </div>
  );
}

interface EmptySlotRowProps {
  position: number;
}

export function EmptySlotRow({ position }: EmptySlotRowProps) {
  // Lighter "open" affordance — the em-dash is intentional. It reads as
  // "this slot exists but is empty" without competing with named roster
  // entries above it. The position number is greyed out further to drop
  // it back another step in the visual hierarchy.
  return (
    <div className="sheet-row sheet-row-roster" aria-label={`Slot ${position} is open`}>
      <div className="t-small text-ink-faint num-right tnum opacity-70">{position}</div>
      <div className="t-body text-ink-faint">—</div>
      <div></div>
      <div className="col-joined"></div>
    </div>
  );
}

/** "Mon 18" — short weekday + day for the Joined column. */
function formatJoined(ms: number): string {
  const d = new Date(ms);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const day = d.getDate();
  return `${weekday} ${day}`;
}
