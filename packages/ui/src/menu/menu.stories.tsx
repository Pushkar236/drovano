import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/button.js';
import { Menu, MenuItem, MenuSeparator } from './menu.js';

const meta = {
  title: 'Strata/Menu',
  component: Menu,
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button>Record actions</Button>,
    children: (
      <>
        <MenuItem>Open</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuItem disabled>Share (coming soon)</MenuItem>
        <MenuSeparator />
        <MenuItem danger>Delete record</MenuItem>
      </>
    ),
  },
};
