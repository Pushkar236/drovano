import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from '../button/button.js';
import { expectNoA11yViolations } from '../testing/axe.js';
import { Dialog } from './dialog.js';

function renderDialog() {
  return render(
    <Dialog
      trigger={<Button>Open settings</Button>}
      title="Workspace settings"
      description="Changes apply to everyone in this workspace."
      footer={<Button variant="primary">Save</Button>}
    >
      <p>Body content</p>
    </Dialog>,
  );
}

describe('Dialog', () => {
  it('opens from the trigger with the title as its accessible name', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(await screen.findByRole('dialog', { name: 'Workspace settings' })).toBeInTheDocument();
    expect(screen.getByText('Changes apply to everyone in this workspace.')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes axe while open', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    await screen.findByRole('dialog');
    await expectNoA11yViolations(document.body);
  });
});
