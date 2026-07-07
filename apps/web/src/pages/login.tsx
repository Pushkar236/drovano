import { Button, Input } from '@drovano/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { authClient } from '../lib/auth-client.js';

type Mode = 'sign-in' | 'sign-up';

/** Email/password entry (ADR-0008). OAuth providers join when configured. */
export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '');

    setSubmitting(true);
    setError(undefined);
    void (async () => {
      const result =
        mode === 'sign-in'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name });
      setSubmitting(false);
      if (result.error) {
        setError(result.error.message ?? 'That didn’t work. Check the details and try again.');
        return;
      }
      await navigate({ to: '/' });
    })();
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-surface-base">
      <div className="w-[22rem] rounded-lg border border-border-hairline bg-surface-raised p-6">
        <h1 tabIndex={-1} className="text-xl font-semibold tracking-tight text-text-primary">
          {mode === 'sign-in' ? 'Sign in to Drovano' : 'Create your account'}
        </h1>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          {mode === 'sign-up' && <Input label="Name" name="name" autoComplete="name" required />}
          <Input label="Email" name="email" type="email" autoComplete="email" required />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            minLength={12}
            required
            {...(mode === 'sign-up' ? { description: 'At least 12 characters.' } : {})}
            {...(error !== undefined ? { error } : {})}
          />
          <Button type="submit" variant="primary" loading={submitting}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(undefined);
          }}
        >
          {mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </Button>
      </div>
    </div>
  );
}
