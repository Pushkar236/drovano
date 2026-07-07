import type { ComponentPropsWithoutRef } from 'react';

import { cx } from '../cx.js';
import styles from './table.module.css';

/**
 * Strata table shell (spec: docs/design-system/components/table.md):
 * semantic-HTML presentation primitives establishing the dense-context
 * visual pattern — hairline seams, sticky header, 32px rows, tabular
 * numerals. The real data grid (virtualization, inline edit, keyboard
 * grid model) is TASK-0025 (M2) and will consume these styles; this shell
 * is for simple, small tables until then.
 */
export function Table(props: ComponentPropsWithoutRef<'table'>) {
  return <table {...props} className={cx(styles.table, props.className)} />;
}

export function TableHead(props: ComponentPropsWithoutRef<'thead'>) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentPropsWithoutRef<'tbody'>) {
  return <tbody {...props} />;
}

export interface TableRowProps extends ComponentPropsWithoutRef<'tr'> {
  selected?: boolean;
}

export function TableRow({ selected = false, ...rest }: TableRowProps) {
  return (
    <tr
      {...rest}
      data-selected={selected || undefined}
      aria-selected={selected || undefined}
      className={cx(styles.row, rest.className)}
    />
  );
}

export function TableHeaderCell(props: ComponentPropsWithoutRef<'th'>) {
  return <th scope="col" {...props} className={cx(styles.headerCell, props.className)} />;
}

export interface TableCellProps extends ComponentPropsWithoutRef<'td'> {
  /** IDs, metrics, timestamps, money: mono + tabular + right-aligned. */
  numeric?: boolean;
}

export function TableCell({ numeric = false, ...rest }: TableCellProps) {
  return <td {...rest} className={cx(styles.cell, numeric && styles.numeric, rest.className)} />;
}
