import React from 'react';
import { SparkleIcon } from '@phosphor-icons/react/dist/ssr';
import { cn } from '@/lib/utils';

interface WelcomeCardProps {
  userName?: string;
  className?: string;
}

export function WelcomeCard({ userName, className }: WelcomeCardProps) {
  if (!userName) return null;

  return (
    <div
      className={cn(
        'bg-background/85 border-input/60 relative w-full max-w-md overflow-hidden rounded-2xl border px-5 py-4 shadow-xl shadow-black/10 backdrop-blur',
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary/15 via-transparent to-primary/10" />
      <div className="relative flex items-center gap-3">
        <div className="bg-primary/90 text-primary-foreground inline-flex size-10 items-center justify-center rounded-xl">
          <SparkleIcon weight="bold" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-mono uppercase text-muted-foreground tracking-[0.2em]">BankVaani</p>
          <p className="text-foreground text-lg font-semibold leading-tight">Welcome back, {userName}</p>
          <p className="text-muted-foreground text-sm">Ready to continue your secure session.</p>
        </div>
      </div>
    </div>
  );
}
