import type { ComponentPropsWithoutRef } from 'react';

import { cx } from '../cx.js';
import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the spinner, sets aria-busy, and prevents interaction. */
  loading?: boolean;
}

/**
 * Strata Button (spec: docs/design-system/components/button.md).
 * `type` defaults to `"button"` — accidental form submission is the bug,
 * submitting is the opt-in.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <svg className={styles.spinner} viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path
            d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
