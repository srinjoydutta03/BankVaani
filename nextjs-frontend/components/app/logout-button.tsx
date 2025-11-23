'use client';

import { useRouter } from 'next/navigation';
import { PowerIcon } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/livekit/button';

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const sessionId = window.localStorage.getItem('session_id');
    if (sessionId) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch (error) {
        console.error('Logout failed', error);
      }
    }

    window.localStorage.removeItem('session_id');
    window.localStorage.removeItem('user_id');
    window.localStorage.removeItem('user_name');
    router.push('/');
  };

  return (
    <Button variant="secondary" size="sm" className="font-mono" onClick={handleLogout}>
      <PowerIcon weight="bold" />
      Logout
    </Button>
  );
}
