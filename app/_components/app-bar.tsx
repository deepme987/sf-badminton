'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

interface AppBarProps {
  left?: ReactNode;
  title?: ReactNode;
  right?: ReactNode;
}

/**
 * Sticky top app bar. The chrome that establishes the page identity on
 * mobile. The bar itself sits at the top of viewport — `safe-top` padding
 * pushes the content area down so the iPhone notch / Dynamic Island
 * doesn't collide with anything interactive.
 *
 * Layout: 3 columns. Title is centered, truncates. Left and right slots
 * have a 44px minimum so a single icon button always reads as a real
 * tap target.
 */
export function AppBar({ left, title, right }: AppBarProps) {
  return (
    <div
      data-app-bar=""
      className="sticky top-0 z-30 bg-surface border-b border-rule safe-top"
    >
      <div className="max-w-4xl mx-auto px-2 sm:px-4 h-14 flex items-center gap-2">
        <div className="flex items-center justify-start min-w-11 shrink-0">{left}</div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          {typeof title === 'string' ? (
            <h1 className="t-section text-ink truncate">{title}</h1>
          ) : (
            title
          )}
        </div>
        <div className="flex items-center justify-end gap-1 min-w-11 shrink-0">{right}</div>
      </div>
    </div>
  );
}

type IconButtonCommon = {
  'aria-label': string;
  children: ReactNode;
  className?: string;
};

type IconButtonAsButton = IconButtonCommon &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'aria-label'> & {
    href?: undefined;
  };

type IconButtonAsLink = IconButtonCommon &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className' | 'aria-label' | 'href'> & {
    href: string;
  };

type IconButtonProps = IconButtonAsButton | IconButtonAsLink;

const ICON_BUTTON_BASE =
  'inline-flex items-center justify-center h-11 w-11 rounded-md text-ink ' +
  'hover:bg-hover active:bg-rule transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * 44x44 hit area with a 24x24 icon centered inside. Use this for ALL chrome
 * icon controls — never let a 16-24px glyph stand alone.
 */
export function IconButton(props: IconButtonProps) {
  const { children, className = '', ...rest } = props;
  const composed = `${ICON_BUTTON_BASE} ${className}`.trim();

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest;
    return (
      <Link href={href} className={composed} {...anchorRest}>
        {children}
      </Link>
    );
  }

  const { type, ...buttonRest } = rest as IconButtonAsButton;
  return (
    <button type={type ?? 'button'} className={composed} {...buttonRest}>
      {children}
    </button>
  );
}
