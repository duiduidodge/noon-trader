'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { MarketTicker } from './market-ticker';
import { ThemeToggle } from './theme-toggle';
import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { label: 'Trading Desk', sectionId: null, path: '/' },
  { label: 'Signals', sectionId: null, path: '/signals' },
  { label: 'Charts', sectionId: null, path: '/charts' },
  { label: 'Paper Bot', sectionId: null, path: '/paper' },
  { label: 'Backtests', sectionId: null, path: '/backtests' },
];

export function FeedHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Trading Desk');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Sync active tab with pathname on mount/change
  useEffect(() => {
    if (pathname === '/') {
      setActiveTab('Trading Desk');
    } else if (pathname.includes('/signals')) {
      setActiveTab('Signals');
    } else if (pathname.includes('/charts')) {
      setActiveTab('Charts');
    } else if (pathname.includes('/paper')) {
      setActiveTab('Paper Bot');
    } else if (pathname.includes('/backtests')) {
      setActiveTab('Backtests');
    }
  }, [pathname]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  const handleNavClick = useCallback((item: typeof NAV_ITEMS[0]) => {
    setIsMenuOpen(false);

    if (!item.sectionId && !item.path) return;

    setActiveTab(item.label);

    if (pathname === '/') {
      const el = document.getElementById(item.sectionId || '');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        return;
      }
    }

    if (item.path) {
      router.push(item.path);
    }
  }, [pathname, router]);

  return (
    <header className="sticky top-0 z-50">
      {/* Main navigation bar */}
      <div className="bg-background/90 backdrop-blur-xl border-b border-border/45 transition-all duration-normal relative z-50">
        <div className="mx-auto flex h-14 max-w-[1640px] items-center justify-between px-3 md:px-unit-4 lg:px-unit-6">
          {/* Logo */}
          <div
            className="flex items-center cursor-pointer opacity-90 hover:opacity-100 transition-opacity duration-fast"
            onClick={() => router.push('/')}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') router.push('/'); }}
          >
            <Image
              src="/noon-logo.png"
              alt="Noon Trader"
              width={160}
              height={46}
              className="h-7 md:h-8 w-auto logo-light select-none"
              priority
            />
          </div>

          {/* Navigation tabs — center */}
          <nav
            className="hidden md:flex items-center gap-6 lg:gap-7"
            role="tablist"
            aria-label="Main navigation"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.label;
              const isDisabled = !item.sectionId && !item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => handleNavClick(item)}
                  disabled={isDisabled}
                  role="tab"
                  aria-selected={isActive}
                  aria-disabled={isDisabled}
                  className={`
                    relative py-2 text-small font-medium tracking-tight transition-colors duration-fast
                    ${isActive
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground/85'
                    }
                    ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer focus-ring'}
                  `}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.label}
                    {isDisabled && (
                      <span className="rounded-full border border-border/60 bg-card/70 px-1.5 py-0.5 font-mono-data text-micro font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                        Soon
                      </span>
                    )}
                  </span>

                  {/* Animated active indicator */}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-indicator"
                      className="absolute -bottom-[18px] left-0 right-0 h-[2px] bg-primary rounded-t-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1 md:gap-2">
            <ThemeToggle />

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="group relative z-50 flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface/50 transition-colors duration-fast md:h-10 md:w-10 focus-ring"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
            >
              <div className="flex flex-col gap-[5px] w-[18px]" aria-hidden="true">
                <span className={`block w-full h-[1.5px] bg-foreground/80 transition-all duration-normal ${isMenuOpen ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
                <span className={`block w-full h-[1.5px] bg-foreground/80 transition-all duration-normal ${isMenuOpen ? 'opacity-0 scale-x-0' : ''}`} />
                <span className={`block w-full h-[1.5px] bg-foreground/80 transition-all duration-normal ${isMenuOpen ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-background/95 backdrop-blur-xl transition-all duration-slow md:hidden ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
          }`}
        role="dialog"
        aria-modal={isMenuOpen}
        aria-label="Navigation menu"
      >
        <div className={`flex min-h-[100dvh] flex-col overflow-y-auto pt-20 px-6 pb-10 transition-all duration-slow delay-100 ${isMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <div className="flex flex-col gap-1" role="tablist">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = activeTab === item.label;
              const isDisabled = !item.sectionId && !item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => handleNavClick(item)}
                  disabled={isDisabled}
                  role="tab"
                  aria-selected={isActive}
                  className={`
                     group flex items-center justify-between py-5 border-b border-border/20 text-left focus-ring
                     ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                   `}
                  style={{ transitionDelay: `${150 + idx * 50}ms` }}
                >
                  <span className={`text-2xl font-display font-bold tracking-tight transition-colors duration-fast ${isActive ? 'text-primary' : 'text-foreground group-hover:text-primary/70'}`}>
                    {item.label}
                  </span>
                  {isActive && <div className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
                  {isDisabled && (
                    <span className="px-2 py-0.5 rounded-full bg-surface text-caption font-mono-data uppercase tracking-wider text-muted-foreground">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="p-5 rounded-2xl bg-surface/50 border border-border/30 backdrop-blur-sm">
              <h4 className="font-mono-data text-caption uppercase tracking-widest text-muted-foreground mb-3">Live Market Pulse</h4>
              <MarketTicker marquee={false} compact />
            </div>
          </div>
        </div>
      </div>

      {/* Market ticker strip (Desktop) */}
      <div className="ticker-pause relative hidden h-[30px] items-center overflow-hidden border-b border-border/30 bg-background/70 backdrop-blur-md md:flex" role="marquee" aria-label="Market prices ticker">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background via-background/80 to-transparent z-10" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background via-background/80 to-transparent z-10" aria-hidden="true" />
        <MarketTicker />
      </div>

    </header>
  );
}
