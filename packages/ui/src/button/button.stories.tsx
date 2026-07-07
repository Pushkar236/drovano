import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button.js';

const meta = {
  title: 'Strata/Button',
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Create record' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Delete</Button>
      <Button variant="primary" loading>
        Saving
      </Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
      <Button variant="secondary" size="sm">
        Small
      </Button>
    </div>
  ),
};
