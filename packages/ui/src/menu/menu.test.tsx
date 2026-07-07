import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button/button.js';
import { expectNoA11yViolations } from '../testing/axe.js';
import { Menu, MenuItem, MenuSeparator } from './menu.js';

function renderMenu(onRename = vi.fn(), onDelete = vi.fn()) {
  render(
    <Menu trigger={<Button>Actions</Button>}>
      <MenuItem onClick={onRename}>Rename</MenuItem>
      <MenuSeparator />
      <MenuItem danger onClick={onDelete}>
        Delete
      </MenuItem>
    </Menu>,
  );
  return { onRename, onDelete };
}

describe('Menu', () => {
  it('opens from the trigger and lists items', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('activates items and closes', async () => {
    const { onRename } = renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('passes axe while open', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    await expectNoA11yViolations(document.body);
  });
});
