'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useRoomContext, useSessionContext, useSessionMessages } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { ChatTranscript } from '@/components/app/chat-transcript';
import { PreConnectMessage } from '@/components/app/preconnect-message';
import { TileLayout } from '@/components/app/tile-layout';
import {
  AgentControlBar,
  type ControlBarControls,
} from '@/components/livekit/agent-control-bar/agent-control-bar';
import { useConnection } from '@/hooks/useConnection';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../livekit/scroll-area/scroll-area';

const MotionBottom = motion.create('div');

const BOTTOM_VIEW_MOTION_PROPS = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    delay: 0.5,
    ease: 'easeOut',
  },
};

interface FadeProps {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

export function Fade({ top = false, bottom = false, className }: FadeProps) {
  return (
    <div
      className={cn(
        'from-background pointer-events-none h-4 bg-linear-to-b to-transparent',
        top && 'bg-linear-to-b',
        bottom && 'bg-linear-to-t',
        className
      )}
    />
  );
}

interface SessionViewProps {
  appConfig: AppConfig;
}

export const SessionView = ({
  appConfig,
  ...props
}: React.ComponentProps<'section'> & SessionViewProps) => {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const room = useRoomContext();
  const [chatOpen, setChatOpen] = useState(false);
  const { isConnectionActive, startDisconnectTransition } = useConnection();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  type RpcPrompt =
    | {
        type: 'chooseAccount';
        prompt?: string;
        accounts: { id: string; nickname?: string; type?: string; last4?: string }[];
        resolve: (payload: string) => void;
        reject: (reason?: Error) => void;
      }
    | {
        type: 'input';
        field: 'accountNumber' | 'tpin';
        title: string;
        description?: string;
        resolve: (payload: string) => void;
        reject: (reason?: Error) => void;
      };

  const [rpcPrompt, setRpcPrompt] = useState<RpcPrompt | null>(null);

  const controls: ControlBarControls = {
    leave: true,
    microphone: true,
    chat: appConfig.supportsChatInput,
    camera: appConfig.supportsVideoInput,
    screenShare: appConfig.supportsVideoInput,
  };

  useEffect(() => {
    const lastMessage = messages.at(-1);
    const lastMessageIsLocal = lastMessage?.from?.isLocal === true;

    if (scrollAreaRef.current && lastMessageIsLocal) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // reset input when prompt changes
  useEffect(() => {
    setInputValue('');
  }, [rpcPrompt?.type]);

  const unregisterAll = useMemo(() => {
    return () => {
      if (!room) return;
      room.unregisterRpcMethod('chooseAccount');
      room.unregisterRpcMethod('requestPayeeAccNo');
      room.unregisterRpcMethod('requestTpin');
    };
  }, [room]);

  // Register RPC handlers
  useEffect(() => {
    if (!room) return;

    const handleChooseAccount = async (data: { payload: string }) => {
      const parsed = (() => {
        try {
          return JSON.parse(data.payload || '{}');
        } catch {
          return { accounts: [], prompt: '' };
        }
      })();
      const accounts =
        Array.isArray(parsed.accounts) && parsed.accounts.length > 0 ? parsed.accounts : [];

      return await new Promise<string>((resolve, reject) => {
        setRpcPrompt({
          type: 'chooseAccount',
          accounts,
          prompt: parsed.prompt ?? '',
          resolve,
          reject,
        });
      });
    };

    const handleRequestPayeeAccNo = async (data: { payload: string }) => {
      const description = data.payload || 'Enter the payee account number';
      return await new Promise<string>((resolve, reject) => {
        setRpcPrompt({
          type: 'input',
          field: 'accountNumber',
          title: 'Payee account number',
          description,
          resolve,
          reject,
        });
      });
    };

    const handleRequestTpin = async (data: { payload: string }) => {
      const description = data.payload || 'Enter your transaction PIN';
      return await new Promise<string>((resolve, reject) => {
        setRpcPrompt({
          type: 'input',
          field: 'tpin',
          title: 'Transaction PIN',
          description,
          resolve,
          reject,
        });
      });
    };

    room.registerRpcMethod('chooseAccount', handleChooseAccount);
    room.registerRpcMethod('requestPayeeAccNo', handleRequestPayeeAccNo);
    room.registerRpcMethod('requestTpin', handleRequestTpin);

    return unregisterAll;
  }, [room, unregisterAll]);

  const handleAccountSelect = (accountId: string) => {
    if (rpcPrompt?.type !== 'chooseAccount') return;
    rpcPrompt.resolve(JSON.stringify({ accountId }));
    setRpcPrompt(null);
  };

  const handleAccountCancel = () => {
    if (!rpcPrompt) return;
    // Always return -1 on cancel to signal rejection to the agent
    const cancelPayload =
      rpcPrompt.type === 'input'
        ? JSON.stringify({ tpin: -1, accountNumber: -1 })
        : JSON.stringify({ accountId: -1 });
    rpcPrompt.resolve(cancelPayload);
    setRpcPrompt(null);
  };

  const handleInputSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rpcPrompt || rpcPrompt.type !== 'input') return;

    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (rpcPrompt.field === 'tpin' && (!/^[0-9]{4}$/.test(trimmed))) {
      return;
    }

    const payload =
      rpcPrompt.field === 'accountNumber'
        ? JSON.stringify({ accountNumber: trimmed })
        : JSON.stringify({ tpin: trimmed });

    rpcPrompt.resolve(payload);
    setRpcPrompt(null);
  };

  return (
    <section className="bg-background relative z-10 h-full w-full overflow-hidden" {...props}>
      {/* Account selection overlay (RPC-driven) */}
      {rpcPrompt && (
        <div className="bg-background/70 fixed inset-0 z-[60] backdrop-blur-md">
          <div className="flex h-full w-full items-center justify-center p-4">
            <div className="bg-background border-input/70 relative w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-2xl shadow-black/15">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary to-primary/50" />

              {rpcPrompt.type === 'chooseAccount' && (
                <>
                  <h3 className="text-foreground text-xl font-semibold">
                    {rpcPrompt.prompt || 'Select an account'}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Choose which account to use. We won&apos;t read numbers aloud—this stays on-screen.
                  </p>
                  <div className="space-y-2">
                    {rpcPrompt.accounts.length === 0 && (
                      <div className="text-muted-foreground text-sm">No accounts available.</div>
                    )}
                    {rpcPrompt.accounts.map((acct) => (
                      <button
                        key={acct.id}
                        className="bg-muted/40 hover:bg-muted/70 border-input/70 flex w-full flex-col rounded-xl border px-4 py-3 text-left transition-colors"
                        onClick={() => handleAccountSelect(acct.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-foreground font-semibold">
                            {acct.nickname || 'Account'} ••••{acct.last4 ?? acct.id.slice(-4)}
                          </span>
                          <span className="text-muted-foreground text-xs uppercase">
                            {acct.type || 'Account'}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-sm">
                          ID:{' '}
                          {acct.id.length > 6
                            ? `${acct.id.slice(0, 2)}…${acct.id.slice(-2)}`
                            : acct.id}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {rpcPrompt.type === 'input' && (
                <form className="space-y-3" onSubmit={handleInputSubmit}>
                  <h3 className="text-foreground text-xl font-semibold">{rpcPrompt.title}</h3>
                  <p className="text-muted-foreground text-sm">{rpcPrompt.description}</p>
                  <input
                    autoFocus
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    type={rpcPrompt.field === 'tpin' ? 'password' : 'text'}
                    inputMode={rpcPrompt.field === 'tpin' ? 'numeric' : 'text'}
                    maxLength={rpcPrompt.field === 'tpin' ? 4 : undefined}
                    className="bg-muted/50 border-input/70 h-11 w-full rounded-xl border px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={rpcPrompt.field === 'tpin' ? '••••' : 'Enter value'}
                  />
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleAccountCancel}
                      className="text-muted-foreground hover:text-foreground text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/80"
                    >
                      Submit
                    </button>
                  </div>
                </form>
              )}

              {rpcPrompt.type === 'chooseAccount' && (
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleAccountCancel}
                    className="text-muted-foreground hover:text-foreground text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Transcript */}
      <div
        className={cn(
          'fixed inset-0 grid grid-cols-1 grid-rows-1',
          !chatOpen && 'pointer-events-none'
        )}
      >
        <Fade top className="absolute inset-x-4 top-0 h-40" />
        <ScrollArea ref={scrollAreaRef} className="px-4 pt-40 pb-[150px] md:px-6 md:pb-[200px]">
          <ChatTranscript
            hidden={!chatOpen}
            messages={messages}
            className="mx-auto max-w-2xl space-y-3 transition-opacity duration-300 ease-out"
          />
        </ScrollArea>
      </div>

      {/* Tile Layout */}
      <TileLayout chatOpen={chatOpen} />

      {/* Bottom */}
      <MotionBottom
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="fixed inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {appConfig.isPreConnectBufferEnabled && (
          <PreConnectMessage messages={messages} className="pb-4" />
        )}
        <div className="bg-background relative mx-auto max-w-2xl pb-3 md:pb-12">
          <Fade bottom className="absolute inset-x-0 top-0 h-4 -translate-y-full" />
          <AgentControlBar
            controls={controls}
            isConnectionActive={isConnectionActive}
            onDisconnect={startDisconnectTransition}
            onChatOpenChange={setChatOpen}
          />
        </div>
      </MotionBottom>
    </section>
  );
};
