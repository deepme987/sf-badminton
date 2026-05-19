/**
 * Inline SVG icon set. Each icon is a 24x24 stroke-only glyph that inherits
 * color from `currentColor`. Pass `className` to size or recolor — the SVG
 * itself stays at 24x24 because the IconButton wrapper provides the hit area.
 *
 * Stroke = 1.5, round caps + joins, no fills. Keeps the look consistent
 * across the app so we don't accidentally mix line weights.
 */

import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

const BASE_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function IconSun({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5" />
      <path d="M12 19.5V21" />
      <path d="M3 12h1.5" />
      <path d="M19.5 12H21" />
      <path d="M5.6 5.6l1.1 1.1" />
      <path d="M17.3 17.3l1.1 1.1" />
      <path d="M5.6 18.4l1.1-1.1" />
      <path d="M17.3 6.7l1.1-1.1" />
    </svg>
  );
}

export function IconMoon({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 0 0 1 13.5 8 8 0 0 0 9.5-3z" />
    </svg>
  );
}

export function IconUser({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function IconArrowLeft({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <path d="M15 5l-7 7 7 7" />
      <path d="M8 12h12" />
    </svg>
  );
}

export function IconShare({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <path d="M12 3v13" />
      <path d="M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function IconMore({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <circle cx="5.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlus({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconClose({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

/** Arrow-into-tray glyph used by the PWA install button. */
export function IconDownload({ className, ...rest }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} {...rest}>
      <path d="M12 4v12" />
      <path d="M7.5 11.5L12 16l4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}
