import type { Meta, StoryObj } from '@storybook/react-vite';

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './table.js';

const meta = {
  title: 'Strata/Table',
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table aria-label="Open deals">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Deal</TableHeaderCell>
          <TableHeaderCell>Stage</TableHeaderCell>
          <TableHeaderCell style={{ textAlign: 'right' }}>Amount</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow selected>
          <TableCell>Acme renewal</TableCell>
          <TableCell>Negotiation</TableCell>
          <TableCell numeric>12,400.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Globex pilot</TableCell>
          <TableCell>Discovery</TableCell>
          <TableCell numeric>3,150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Initech expansion</TableCell>
          <TableCell>Proposal</TableCell>
          <TableCell numeric>48,900.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
