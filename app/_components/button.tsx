'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSNAME: Record<Variant, string> = {
  primary: 'btn-primary',
  // "secondary" semantically lands on btn-ghost in the Sheet variant.
  secondary: 'btn-ghost',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const widthClass = fullWidth ? 'w-full' : '';
  const composed = `${VARIANT_CLASSNAME[variant]} ${widthClass} ${className}`.trim();
  return (
    <button type={rest.type ?? 'button'} {...rest} className={composed}>
      {children}
    </button>
  );
}
