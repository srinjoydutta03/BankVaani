'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, ArrowRightIcon, ShieldCheckIcon } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/livekit/button';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'error' | 'success'; message?: string }>({
    type: 'idle',
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: 'loading' });

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password }),
      });

      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.detail ?? 'Login failed';
        throw new Error(msg);
      }

      const data = await res.json();
      window.localStorage.setItem('session_id', data.session_id);
      window.localStorage.setItem('user_id', userId);
      if (data.user_name) window.localStorage.setItem('user_name', data.user_name);
      setStatus({ type: 'success', message: 'Logged in! Redirecting...' });
      router.push('/call');
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to log in',
      });
    }
  };

  return (
    <div className="bg-background relative min-h-screen">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-primary/15 absolute -left-20 top-10 h-72 w-72 rounded-full blur-3xl" />
        <div className="bg-primary/25 absolute right-10 bottom-10 h-56 w-56 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 md:flex-row md:items-center md:gap-16 md:px-8">
        <div className="flex-1 space-y-4">
          <Link href="/" className="text-muted-foreground inline-flex items-center gap-2 text-sm hover:text-foreground">
            <ArrowLeftIcon weight="bold" /> Back to landing
          </Link>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">Voice Banking</p>
          <h1 className="text-foreground text-4xl font-semibold leading-tight md:text-5xl">Welcome back</h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-7">
            Log in to create a secure session. Your LiveKit token will be minted with your user identity so every
            action maps back to your accounts.
          </p>
          <div className="bg-muted/50 border-input/50 flex items-center gap-3 rounded-2xl border p-4 text-sm text-foreground/80">
            <ShieldCheckIcon weight="fill" />
            Sessions are short-lived and tied to your login. Keep your session ID safe.
          </div>
        </div>

        <div className="flex-1">
          <div className="bg-background/80 border-input/70 relative rounded-3xl border p-8 shadow-xl shadow-black/10 backdrop-blur">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-primary to-primary/40" />
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="user_id">
                  User ID
                </label>
                <input
                  id="user_id"
                  name="user_id"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  className={cn(
                    'bg-muted/50 border-input/70 h-11 w-full rounded-xl border px-4 text-sm outline-none',
                    'focus:border-primary focus:ring-2 focus:ring-primary/20'
                  )}
                  placeholder="e.g. alice"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={cn(
                    'bg-muted/50 border-input/70 h-11 w-full rounded-xl border px-4 text-sm outline-none',
                    'focus:border-primary focus:ring-2 focus:ring-primary/20'
                  )}
                  placeholder="••••••••"
                />
              </div>
              {status.type === 'error' && (
                <p className="text-destructive text-sm" role="alert">
                  {status.message}
                </p>
              )}
              {status.type === 'success' && (
                <p className="text-emerald-500 text-sm" role="status">
                  {status.message}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-mono"
                disabled={status.type === 'loading'}
              >
                {status.type === 'loading' ? 'Signing in…' : 'Sign in'}
                <ArrowRightIcon weight="bold" />
              </Button>
            </form>
            <p className="text-muted-foreground mt-4 text-sm">
              New here?{' '}
              <Link href="/signup" className="text-primary font-semibold hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
