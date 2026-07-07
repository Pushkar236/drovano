import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { expectNoA11yViolations } from '../testing/axe.js';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './table.js';

function renderTable() {
  return render(
    <Table aria-label="Deals">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Amount</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow selected>
          <TableCell>Acme renewal</TableCell>
          <TableCell numeric>12,400.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Globex pilot</TableCell>
          <TableCell numeric>3,150.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table shell', () => {
  it('renders semantic table structure with scoped headers', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Deals' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('scope', 'col');
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('marks selected rows for styling and assistive tech', () => {
    renderTable();
    const selectedRow = screen.getByText('Acme renewal').closest('tr');
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');
  });

  it('numeric cells get the tabular treatment', () => {
    renderTable();
    expect(screen.getByText('12,400.00').className).toContain('numeric');
  });

  it('passes axe', async () => {
    const { container } = renderTable();
    await expectNoA11yViolations(container);
  });
});
