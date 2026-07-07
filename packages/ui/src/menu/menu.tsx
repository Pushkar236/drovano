import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

import { cx } from '../cx.js';
import styles from './menu.module.css';

export interface MenuProps {
  /**
   * The element that opens the menu — must render a real button-like
   * element (e.g. our Button); Base UI merges the trigger semantics onto
   * it, so no wrapper node pollutes the accessibility tree.
   */
  trigger: ReactElement<Record<string, unknown>>;
  children: ReactNode;
  /** Popup alignment relative to the trigger. */
  align?: 'start' | 'center' | 'end';
}

/**
 * Strata action menu (spec: docs/design-system/components/menu.md).
 * Base UI supplies roving focus, typeahead, and Esc/arrow-key handling;
 * every action here must also be reachable outside the menu (⌘K or a
 * visible control) — menus are shortcuts, never the only path.
 */
export function Menu({ trigger, children, align = 'start' }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align={align} sideOffset={4}>
          <BaseMenu.Popup className={styles.popup}>{children}</BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export interface MenuItemProps extends ComponentPropsWithoutRef<typeof BaseMenu.Item> {
  /** Destructive actions get the danger treatment. */
  danger?: boolean;
}

export function MenuItem({ danger = false, className, ...rest }: MenuItemProps) {
  return (
    <BaseMenu.Item
      {...rest}
      className={cx(
        styles.item,
        danger && styles.danger,
        typeof className === 'string' ? className : undefined,
      )}
    />
  );
}

export function MenuSeparator() {
  return <BaseMenu.Separator className={styles.separator} />;
}
