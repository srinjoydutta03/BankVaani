'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { TokenSource } from 'livekit-client';
import { SessionProvider, useSession } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';

interface ConnectionContextType {
  isConnectionActive: boolean;
  connect: (startSession?: boolean) => void;
  startDisconnectTransition: () => void;
  onDisconnectTransitionComplete: () => void;
}

const ConnectionContext = createContext<ConnectionContextType>({
  isConnectionActive: false,
  connect: () => {},
  startDisconnectTransition: () => {},
  onDisconnectTransitionComplete: () => {},
});

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return ctx;
}

interface ConnectionProviderProps {
  appConfig: AppConfig;
  children: React.ReactNode;
}

export function ConnectionProvider({ appConfig, children }: ConnectionProviderProps) {
  const [isConnectionActive, setIsConnectionActive] = useState(false);

  const tokenSource = useMemo(() => {
    const customEndpoint = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT?.trim();
    const endpoint = customEndpoint && customEndpoint.length > 0 ? customEndpoint : '/api/connection-details';

    return TokenSource.custom(async () => {
      const url = new URL(endpoint, window.location.origin);

      // Pull auth context from client storage; adjust keys to match your login flow.
      const userId = window.localStorage.getItem('user_id');
      const userName = window.localStorage.getItem('user_name') ?? undefined;
      const sessionId = window.localStorage.getItem('session_id') ?? undefined;

      if (!userId) {
        throw new Error('Missing user id. Please log in first.');
      }

      try {
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            ...(userName ? { 'X-User-Name': userName } : {}),
            ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
            'X-Sandbox-Id': appConfig.sandboxId ?? '',
          },
          body: JSON.stringify({
            room_config: appConfig.agentName
              ? {
                  agents: [{ agent_name: appConfig.agentName }],
                }
              : undefined,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Error fetching connection details (${res.status}): ${text}`);
        }
        return await res.json();
      } catch (error) {
        console.error('Error fetching connection details:', error);
        throw new Error('Error fetching connection details!');
      }
    });
  }, [appConfig]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  const { start: startSession, end: endSession } = session;

  const value = useMemo(() => {
    return {
      isConnectionActive,
      connect: () => {
        setIsConnectionActive(true);
        startSession();
      },
      startDisconnectTransition: () => {
        setIsConnectionActive(false);
      },
      onDisconnectTransitionComplete: () => {
        endSession();
      },
    };
  }, [startSession, endSession, isConnectionActive]);

  return (
    <SessionProvider session={session}>
      <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
    </SessionProvider>
  );
}
