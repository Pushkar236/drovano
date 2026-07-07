import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { handleInvalidationFrame } from './realtime.js';

describe('handleInvalidationFrame', () => {
  it('invalidates the named resource key', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    handleInvalidationFrame(queryClient, JSON.stringify({ resource: 'workspaces' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['workspaces'] });
  });

  it('ignores malformed frames without throwing', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    handleInvalidationFrame(queryClient, 'not json');
    handleInvalidationFrame(queryClient, JSON.stringify({ nope: 1 }));
    handleInvalidationFrame(queryClient, JSON.stringify({ resource: '' }));
    expect(spy).not.toHaveBeenCalled();
  });
});
