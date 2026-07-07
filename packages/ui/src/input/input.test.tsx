import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { expectNoA11yViolations } from '../testing/axe.js';
import { Input } from './input.js';

describe('Input', () => {
  it('associates the label with the control', async () => {
    render(<Input label="Email" />);
    const control = screen.getByLabelText('Email');
    await userEvent.type(control, 'ada@example.com');
    expect(control).toHaveValue('ada@example.com');
  });

  it('renders the description as supporting copy', () => {
    render(<Input label="Email" description="Work address preferred." />);
    expect(screen.getByText('Work address preferred.')).toBeInTheDocument();
  });

  it('external errors mark the field invalid and show the message', () => {
    render(<Input label="Email" error="This address is already in use." />);
    expect(screen.getByText('This address is already in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('passes axe in normal, described, error, and disabled states', async () => {
    const { container } = render(
      <div>
        <Input label="Name" />
        <Input label="Email" description="Work address preferred." />
        <Input label="Handle" error="Already taken." />
        <Input label="Locked" disabled />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
