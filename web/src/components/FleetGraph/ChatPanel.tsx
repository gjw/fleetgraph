import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/cn';
import { useFleetGraphChat } from '@/hooks/useFleetGraph';
import { FindingsPanel } from './FindingsPanel';
import type { Finding } from '@/hooks/useFleetGraph';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  findings?: Finding[];
  findingDocIds?: string[];
}

interface ChatPanelProps {
  documentId: string;
  documentType: string;
}

export function ChatPanel({ documentId, documentType }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatMutation = useFleetGraphChat();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Reset messages when document changes
  useEffect(() => {
    setMessages([]);
  }, [documentId]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const result = await chatMutation.mutateAsync({
        message: trimmed,
        documentId,
        documentType,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.classification || 'Analysis complete.',
        findings: result.findings,
        findingDocIds: result.findingDocIds,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. FleetGraph may be unavailable.',
      }]);
    }
  }, [input, chatMutation, documentId, documentType]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="border-t border-border">
      {/* Toggle bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-muted hover:text-foreground hover:bg-border/30 transition-colors"
      >
        <FleetGraphIcon />
        <span>FleetGraph</span>
        {messages.length > 0 && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
            {messages.filter(m => m.role === 'assistant').length}
          </span>
        )}
        <svg
          className={cn('ml-auto h-3 w-3 transition-transform', isOpen && 'rotate-180')}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="flex flex-col" style={{ height: '320px' }}>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-muted italic">
                Ask FleetGraph about this document — scope creep, stale items, accountability gaps, or anything else.
              </p>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn('space-y-2', msg.role === 'user' && 'flex justify-end')}>
                {msg.role === 'user' ? (
                  <div className="rounded-lg bg-accent/20 px-3 py-2 text-sm text-foreground max-w-[80%]">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-foreground">{msg.content}</p>
                    {msg.findings && msg.findings.length > 0 && (
                      <FindingsPanel
                        findings={msg.findings}
                        findingDocIds={msg.findingDocIds}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Analyzing...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-border px-4 py-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask FleetGraph..."
                disabled={chatMutation.isPending}
                className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FleetGraphIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="3" r="2" />
      <circle cx="3" cy="12" r="2" />
      <circle cx="13" cy="12" r="2" />
      <line x1="8" y1="5" x2="3" y2="10" />
      <line x1="8" y1="5" x2="13" y2="10" />
    </svg>
  );
}
