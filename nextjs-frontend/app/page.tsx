import Link from 'next/link';
import { ArrowRightIcon, HeadsetIcon, ShieldCheckIcon, SparkleIcon } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/livekit/button';
import { cn } from '@/lib/utils';

const features = [
  {
    title: 'Secure voice banking',
    description: 'Identity-aware sessions tied to your login keep every interaction mapped to the right customer.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Human-like assistance',
    description: 'LiveKit agents listen and respond in real-time with audio, chat, and optional video avatar.',
    icon: HeadsetIcon,
  },
  {
    title: 'Compliance-ready',
    description: 'Keep sensitive steps on-screen only with RPC prompts for PINs and account selection.',
    icon: SparkleIcon,
  },
];

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-background/70 border-input/60 relative overflow-hidden rounded-3xl border p-6 shadow-2xl shadow-black/5 backdrop-blur-lg',
        'before:absolute before:inset-0 before:bg-linear-to-br before:from-white/5 before:to-primary/5 before:opacity-70',
        className
      )}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-primary/10 absolute -left-10 top-10 h-60 w-60 rounded-full blur-3xl" />
        <div className="bg-primary/20 absolute right-10 top-24 h-48 w-48 rounded-full blur-3xl" />
        <div className="bg-foreground/5 absolute bottom-0 left-1/4 h-64 w-64 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pb-24 pt-20 md:gap-20 md:px-8 lg:px-0">
        <header className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-muted-foreground font-mono text-sm uppercase tracking-[0.3em]">
              BANKVAANI
            </p>
            <h1 className="text-foreground mt-2 max-w-3xl text-4xl font-semibold leading-[1.1] md:text-5xl lg:text-6xl">
              Your secure voice-first banking copilot.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-7">
              Log in, verify once, and let BankVaani handle balances, account insights, and guided actions across channels.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild size="lg" variant="primary" className="font-mono">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-mono">
              <Link href="/signup">Create account</Link>
            </Button>
          </div>
        </header>

        <GlassCard className="grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div className="space-y-4">
            <p className="text-muted-foreground font-mono text-xs uppercase">How it works</p>
            <h2 className="text-foreground text-3xl font-semibold tracking-tight">
              Sign in, connect, and start a secure voice session.
            </h2>
            <ol className="text-muted-foreground space-y-3">
              <li className="flex gap-3">
                <span className="bg-primary text-primary-foreground mt-1 inline-flex size-7 items-center justify-center rounded-full font-semibold">
                  1
                </span>
                <div>
                  <h3 className="text-foreground font-semibold">Authenticate</h3>
                  <p>Log in to create a time-bound banking session tied to your user profile.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="bg-primary text-primary-foreground mt-1 inline-flex size-7 items-center justify-center rounded-full font-semibold">
                  2
                </span>
                <div>
                  <h3 className="text-foreground font-semibold">Get your token</h3>
                  <p>
                    We mint a LiveKit token with your identity so every command and transcript maps back to you.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="bg-primary text-primary-foreground mt-1 inline-flex size-7 items-center justify-center rounded-full font-semibold">
                  3
                </span>
                <div>
                  <h3 className="text-foreground font-semibold">Talk to your agent</h3>
                  <p>Start the call and use voice or chat.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="bg-primary text-primary-foreground mt-1 inline-flex size-7 items-center justify-center rounded-full font-semibold">
                  4
                </span>
                <div>
                  <h3 className="text-foreground font-semibold">Hindi + English support</h3>
                  <p>Talk to the agent in hindi or english or hinglish, your wish!</p>
                </div>
              </li>
            </ol>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg" className="font-mono">
                <Link href="/signup">
                  Register now by creating an account
                  <ArrowRightIcon weight="bold" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="bg-muted/50 border-input/50 relative h-full rounded-2xl border p-6 shadow-xl shadow-black/10">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
            <div className="relative flex h-full flex-col justify-between gap-4">
              <div>
                <p className="text-muted-foreground font-mono text-xs uppercase">Session preview</p>
                <h3 className="text-foreground mt-2 text-2xl font-semibold">Live assistant tiles</h3>
              </div>
              <div className="bg-background/80 border-input/60 grid grid-cols-2 gap-3 rounded-xl border p-4 backdrop-blur">
                <div className="bg-primary/80 text-primary-foreground flex h-32 items-center justify-center rounded-lg text-lg font-semibold">
                  Agent
                </div>
                <div className="bg-muted flex h-32 items-center justify-center rounded-lg text-lg font-semibold">
                  You
                </div>
                <div className="bg-muted/70 col-span-2 h-10 rounded-md" />
                <div className="bg-muted/70 col-span-2 h-10 rounded-md" />
              </div>
              <p className="text-muted-foreground text-sm leading-6">
                Dynamic tiles for agent audio and chat mirror the in-call layout you’ll see after login.
              </p>
            </div>
          </div>
        </GlassCard>

        <section className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <GlassCard key={feature.title} className="h-full space-y-3">
              <div className="bg-primary/10 text-primary-foreground inline-flex size-10 items-center justify-center rounded-2xl">
                <feature.icon size={24} weight="fill" />
              </div>
              <h3 className="text-foreground text-xl font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-6">{feature.description}</p>
            </GlassCard>
          ))}
        </section>
      </div>
    </div>
  );
}
