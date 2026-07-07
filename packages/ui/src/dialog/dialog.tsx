import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

import styles from './dialog.module.css';

export interface DialogProps {
  /**
   * The element that opens the dialog — a real button-like element; Base
   * UI merges trigger semantics onto it (no wrapper node in the a11y tree).
   */
  trigger: ReactElement<Record<string, unknown>>;
  title: string;
  /** Optional supporting copy under the title, wired as the accessible description. */
  description?: string;
  children?: ReactNode;
  /** Action row (typically Buttons); rendered right-aligned. */
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Strata modal dialog (spec: docs/design-system/components/dialog.md).
 * Base UI provides focus trapping, Esc-to-close, and portal rendering;
 * Strata provides the one legitimate shadow. Modal by design — non-modal
 * surfaces should be the peek panel, not a dialog.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  footer,
  open,
  onOpenChange,
}: DialogProps) {
  return (
    <BaseDialog.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <BaseDialog.Trigger render={trigger} />
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
          {description !== undefined && (
            <BaseDialog.Description className={styles.description}>
              {description}
            </BaseDialog.Description>
          )}
          {children}
          {footer !== undefined && <div className={styles.footer}>{footer}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Closes the containing dialog; use for Cancel buttons in `footer`. */
export function DialogClose(props: ComponentPropsWithoutRef<typeof BaseDialog.Close>) {
  return <BaseDialog.Close {...props} />;
}
