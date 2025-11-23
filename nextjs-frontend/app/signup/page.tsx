'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, ArrowRightIcon, UserPlusIcon } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/livekit/button';
import { cn } from '@/lib/utils';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    user_id: '',
    password: '',
    name: '',
    customer_id: '',
  });
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'error' | 'success'; message?: string }>({
    type: 'idle',
  });

  const updateField = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: 'loading' });

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.detail ?? 'Signup failed';
        throw new Error(msg);
      }

      const data = await res.json();
      window.localStorage.setItem('user_id', data.user_id ?? form.user_id);
      window.localStorage.setItem('user_name', form.name);
      setStatus({ type: 'success', message: 'Account created! Redirecting to login...' });
      setTimeout(() => router.push('/login'), 600);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to sign up',
      });
    }
  };

  return (
    <div className="bg-background relative min-h-screen">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-primary/15 absolute left-10 top-24 h-64 w-64 rounded-full blur-3xl" />
        <div className="bg-primary/20 absolute right-0 bottom-20 h-60 w-60 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 md:flex-row md:items-center md:gap-16 md:px-8">
        <div className="flex-1 space-y-4">
          <Link href="/" className="text-muted-foreground inline-flex items-center gap-2 text-sm hover:text-foreground">
            <ArrowLeftIcon weight="bold" /> Back to landing
          </Link>
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">Voice Banking</p>
          <h1 className="text-foreground text-4xl font-semibold leading-tight md:text-5xl">Create your account</h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-7">
            Set up a profile so your LiveKit sessions are linked to your banking identity. You can add accounts and
            start a secure voice session right after you log in.
          </p>
          <div className="bg-muted/50 border-input/50 flex items-center gap-3 rounded-2xl border p-4 text-sm text-foreground/80">
            <UserPlusIcon weight="fill" />
            Customer ID keeps your banking data tied to the right profile. Use the ID provided by your bank.
          </div>
        </div>

        <div className="flex-1">
          <div className="bg-background/80 border-input/70 relative rounded-3xl border p-8 shadow-xl shadow-black/10 backdrop-blur">
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-primary to-primary/40" />
            <form className="space-y-6" onSubmit={handleSubmit}>
              {[
                { id: 'user_id', label: 'User ID', placeholder: 'e.g. alice' },
                { id: 'name', label: 'Full name', placeholder: 'Alice Rao' },
                { id: 'customer_id', label: 'Customer ID', placeholder: 'cust_1001' },
              ].map((field) => (
                <div className="space-y-2" key={field.id}>
                  <label className="text-sm font-semibold text-foreground" htmlFor={field.id}>
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    name={field.id}
                    value={form[field.id as keyof typeof form]}
                    onChange={(e) => updateField(field.id as keyof typeof form)(e.target.value)}
                    required
                    className={cn(
                      'bg-muted/50 border-input/70 h-11 w-full rounded-xl border px-4 text-sm outline-none',
                      'focus:border-primary focus:ring-2 focus:ring-primary/20'
                    )}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password')(e.target.value)}
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
                {status.type === 'loading' ? 'Creating account…' : 'Create account'}
                <ArrowRightIcon weight="bold" />
              </Button>
            </form>
            <p className="text-muted-foreground mt-4 text-sm">
              Already have an account?{' '}
              <Link href="/login" className="text-primary font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
