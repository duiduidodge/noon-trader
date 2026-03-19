'use client';

import { X, Calendar, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode, useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface SummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title: string;
    date: string;
}

export function SummaryModal({ isOpen, onClose, children, title, date }: SummaryModalProps) {
  const [mounted, setMounted] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Focus trap: focus close button on open, restore focus on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Delay focus to allow animation to start
      const timer = setTimeout(() => closeButtonRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Escape key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-modal-title"
        onKeyDown={handleKeyDown}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-[radial-gradient(1200px_600px_at_50%_-200px,hsl(var(--primary)/0.18),transparent_60%),linear-gradient(to_bottom,hsl(var(--background)/0.76),hsl(var(--background)/0.92))] backdrop-blur-md"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 14 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="relative z-[101] flex h-[100dvh] sm:h-[92dvh] w-full max-w-[1240px] flex-col overflow-hidden sm:rounded-2xl border border-border/40 bg-[linear-gradient(to_bottom,hsl(var(--card)/0.97),hsl(var(--card)/0.94))] shadow-modal ring-1 ring-border/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative border-b border-border/20 bg-[linear-gradient(to_right,hsl(var(--surface)/0.58),hsl(var(--surface)/0.24))] px-unit-4 py-unit-3 sm:px-unit-5 sm:py-unit-4">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono-data text-small font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Bi-Daily Briefing
                </div>
                <h2 id="summary-modal-title" className="truncate font-display text-display font-bold uppercase tracking-[0.04em] text-foreground sm:text-[2rem]">
                  {title}
                </h2>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/45 bg-card/50 px-2.5 py-1 font-mono-data text-small font-semibold uppercase tracking-[0.12em] text-muted-foreground/85">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {date}
                </div>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="rounded-lg border border-border/45 bg-card/45 p-2 text-muted-foreground transition-colors duration-fast hover:bg-surface/60 hover:text-foreground focus-ring"
                aria-label="Close summary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-unit-2 sm:p-unit-3">
            <div className="h-full rounded-xl border border-border/30 bg-surface/18 p-unit-2 sm:p-unit-3">
              {children}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
