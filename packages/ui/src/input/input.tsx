import { Field } from '@base-ui/react/field';
import type { ComponentPropsWithoutRef } from 'react';

import { cx } from '../cx.js';
import styles from './input.module.css';

export interface InputProps extends ComponentPropsWithoutRef<'input'> {
  label: string;
  /** Supporting copy under the control. */
  description?: string;
  /**
   * External error message (server validation, domain errors). When set,
   * the field renders invalid regardless of native validity.
   */
  error?: string;
}

/**
 * Strata text input (spec: docs/design-system/components/input.md).
 * Built on Base UI Field so label/description/error are wired to the
 * control with correct ids/aria automatically. The error state is a
 * designed state (DESIGN_SYSTEM.md rule 9), not an afterthought.
 */
export function Input({ label, description, error, className, ...rest }: InputProps) {
  return (
    <Field.Root className={cx(styles.root, className)} invalid={error !== undefined}>
      <Field.Label className={styles.label}>{label}</Field.Label>
      <Field.Control className={styles.control} {...rest} />
      {description !== undefined && (
        <Field.Description className={styles.description}>{description}</Field.Description>
      )}
      {error !== undefined && (
        <Field.Error className={styles.error} match={true}>
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}
