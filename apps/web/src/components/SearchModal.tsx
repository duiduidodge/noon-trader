'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, TrendingUp, TrendingDown, Minus, ExternalLink, Zap, Flame, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  url: string;
  titleOriginal: string;
  titleTh?: string;
  summaryTh?: string;
  publishedAt: string;
  source: string;
  tags: string[];
  sentiment?: string;
  marketImpact?: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleResultClick(results[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [isOpen, results, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedEl = resultsRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
        const data = await response.json();
        setResults(data.items || []);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleResultClick = useCallback((result: SearchResult) => {
    window.open(result.url, '_blank', 'noopener,noreferrer');
    onClose();
  }, [onClose]);

  const getSentimentIcon = (sentiment?: string) => {
    if (sentiment === 'bullish') return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (sentiment === 'bearish') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-gray-500" />;
  };

  const getImpactIcon = (impact?: string) => {
    if (impact === 'high') return <Flame className="w-4 h-4 text-orange-400" />;
    if (impact === 'medium') return <Zap className="w-4 h-4 text-yellow-400" />;
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  // ... existing hooks

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Search Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -10 }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="relative w-full max-w-2xl mx-4 z-[101]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Main container */}
          <div className="bg-card border border-border/40 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-border/10">

            {/* Search Input Area */}
            <div className="relative border-b border-border/10 bg-surface/30">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search intel..."
                className="w-full pl-14 pr-12 py-5 bg-transparent text-lg text-foreground placeholder-muted-foreground/60 focus:outline-none font-medium"
                spellCheck={false}
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="search-results"
                aria-activedescendant={results.length > 0 ? `search-result-${selectedIndex}` : undefined}
                aria-label="Search articles"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {loading && (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                )}
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-surface rounded-md text-muted-foreground transition-colors"
                >
                  <span className="sr-only">Close</span>
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground/70 bg-surface rounded border border-border/20">ESC</kbd>
                  <X className="sm:hidden w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Results Area */}
            <div ref={resultsRef} id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto custom-scrollbar bg-card/50">
              {query.length < 2 && !loading && (
                <div className="p-12 text-center text-muted-foreground/40">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Type to search the archives</p>
                </div>
              )}

              {results.length === 0 && query.length >= 2 && !loading && (
                <div className="p-12 text-center text-muted-foreground/60">
                  <p className="text-sm">No results found for &quot;{query}&quot;</p>
                </div>
              )}

              {results.length > 0 && (
                <div className="py-2">
                  <div className="px-4 pb-2">
                    <h3 className="text-[10px] font-mono-data uppercase tracking-widest text-muted-foreground/50 font-bold">Top Results</h3>
                  </div>
                  {results.toSorted((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).map((result, index) => (
                    <motion.div
                      key={result.id}
                      id={`search-result-${index}`}
                      role="option"
                      aria-selected={index === selectedIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.02 }}
                      onClick={() => handleResultClick(result)}
                      className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-4 cursor-pointer group ${index === selectedIndex
                        ? 'bg-surface'
                        : 'hover:bg-surface/50'
                        }`}
                    >
                      <div className="mt-1 flex-shrink-0">
                        {getImpactIcon(result.marketImpact)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-medium leading-tight mb-1 transition-colors ${index === selectedIndex ? 'text-primary' : 'text-foreground'
                          }`}>
                          {result.titleOriginal}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                          <span className="font-mono-data uppercase tracking-wide text-[10px]">{result.source}</span>
                          <span>•</span>
                          <span className="truncate opacity-70">
                            {new Date(result.publishedAt).toLocaleDateString()}
                          </span>
                          {result.sentiment && (
                            <>
                              <span>•</span>
                              <span className={cn(
                                "capitalize font-medium",
                                result.sentiment === 'BULLISH' && "text-bullish",
                                result.sentiment === 'BEARISH' && "text-bearish"
                              )}>
                                {result.sentiment.toLowerCase()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-surface/50 border-t border-border/10 flex items-center justify-between text-[10px] text-muted-foreground/60 font-mono-data">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <kbd className="bg-background border border-border/20 rounded px-1 min-w-[18px] text-center">↑↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="bg-background border border-border/20 rounded px-1 min-w-[18px] text-center">↵</kbd>
                  Select
                </span>
              </div>
              <div>
                {results.length} results
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
