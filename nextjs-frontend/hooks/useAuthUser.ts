'use client';

import { useEffect, useState } from 'react';

interface AuthUser {
  id: string;
  name?: string;
}

export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const id = window.localStorage.getItem('user_id');
    const name = window.localStorage.getItem('user_name') ?? undefined;
    if (id) {
      setUser({ id, name });
    }
  }, []);

  return user;
}
