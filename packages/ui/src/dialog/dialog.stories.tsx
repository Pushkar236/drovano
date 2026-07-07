import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/button.js';
import { Dialog, DialogClose } from './dialog.js';

const meta = {
  title: 'Strata/Dialog',
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button>Workspace settings</Button>,
    title: 'Workspace settings',
    description: 'Changes apply to everyone in this workspace.',
    children: <p style={{ margin: 0 }}>Settings form goes here.</p>,
    footer: (
      <>
        <DialogClose render={<Button variant="ghost">Cancel</Button>} />
        <Button variant="primary">Save changes</Button>
      </>
    ),
  },
};
