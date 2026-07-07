import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './input.js';

const meta = {
  title: 'Strata/Input',
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Email', placeholder: 'ada@example.com' },
};

export const States: Story = {
  args: { label: 'Name' },
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '20rem' }}>
      <Input label="Name" placeholder="Ada Lovelace" />
      <Input label="Email" description="Work address preferred." />
      <Input label="Handle" defaultValue="ada" error="This handle is already taken." />
      <Input label="Locked" disabled defaultValue="read only" />
    </div>
  ),
};
