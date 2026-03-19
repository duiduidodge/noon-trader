'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SignalPulseHeader } from '@/components/signals/signal-pulse-header';
import { OpportunitySection } from '@/components/signals/opportunity-section';
import { EmergingSection } from '@/components/signals/emerging-section';
import { WhaleSection } from '@/components/signals/whale-section';
import { TradeSetupsPanel } from '@/components/trade-setups-panel';
import { cn } from '@/lib/utils';
import { Target, Radio, Waves, Sparkles } from 'lucide-react';

async function fetchDeepSignals() {
  const res = await fetch('/api/signals/deep');
  if (!res.ok) throw new Error('Failed to fetch deep signals');
  return res.json();
}

type MobileTab = 'setups' | 'opportunities' | 'emerging' | 'whales';

const MOBILE_TABS: { id: MobileTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'setups', label: 'Setups', icon: <Sparkles className="w-3 h-3" />, color: 'text-primary' },
  { id: 'opportunities', label: 'Opp', icon: <Target className="w-3 h-3" />, color: 'text-cyan-400' },
  { id: 'emerging', label: 'EMG', icon: <Radio className="w-3 h-3" />, color: 'text-amber-400' },
  { id: 'whales', label: 'Whales', icon: <Waves className="w-3 h-3" />, color: 'text-violet-400' },
];

export default function SignalsPage() {
  const [mobileTab, setMobileTab] = useState<MobileTab>('setups');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deep-signals'],
    queryFn: fetchDeepSignals,
    refetchInterval: 60_000,
  });

  const opp = data?.opportunities;
  const emg = data?.emerging;
  const whl = data?.whales;

  return (
    <div className="bg-background lg:h-[100dvh] lg:overflow-hidden flex flex-col">

      {/* ── Signal Pulse Header (always visible compact bar) ── */}
      <div className="shrink-0 px-3 pt-2 pb-0 md:px-4">
        {data && !isLoading ? (
          <SignalPulseHeader
            oppScanTime={opp?.snapshot?.scanTime ?? null}
            emergingScanTime={emg?.snapshot?.signalTime ?? null}
            whaleScanTime={whl?.snapshot?.scanTime ?? null}
            btcContext={opp?.snapshot?.btcContext ?? null}
            oppCount={opp?.items?.length ?? 0}
            emergingCount={emg?.alerts?.length ?? 0}
            whaleCount={whl?.traders?.length ?? 0}
            hasImmediate={emg?.snapshot?.hasImmediate ?? false}
          />
        ) : (
          <div className="h-9 rounded-lg border border-border/30 bg-surface/20 animate-shimmer" />
        )}
      </div>

      {/* ── Mobile Tab Bar ── */}
      <div className="lg:hidden shrink-0 flex gap-1 px-3 pt-2">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 font-mono-data text-[10px] font-bold uppercase tracking-wider transition-all duration-fast',
              mobileTab === tab.id
                ? 'border-border/60 bg-surface/50 text-foreground/90'
                : 'border-border/20 bg-transparent text-muted-foreground/50 hover:border-border/35 hover:text-muted-foreground/75'
            )}
          >
            <span className={mobileTab === tab.id ? tab.color : ''}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Loading state ── */}
      {isLoading && (
        <div className="flex-1 p-3 md:p-4">
          <div className="grid lg:grid-cols-[300px_1fr_340px] gap-3 h-full">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border/25 bg-surface/10 animate-shimmer" />
            ))}
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {isError && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="rounded-xl border border-bearish/30 bg-bearish/8 px-6 py-8 text-center max-w-md">
            <p className="font-mono-data text-caption text-bearish uppercase tracking-wider">
              Signal feed unavailable. Check connection and retry.
            </p>
          </div>
        </div>
      )}

      {/* ── Main Intelligence Grid ── */}
      {data && !isLoading && (
        <>
          {/* ── DESKTOP: 3-column + whale row ── */}
          <div className="hidden lg:flex flex-col flex-1 min-h-0 gap-2 px-3 pb-3 pt-2 md:px-4 md:pb-4">

            {/* Top 3-column grid */}
            <div className="flex gap-2 flex-1 min-h-0">

              {/* LEFT: Trade Setups */}
              <div className="w-[300px] shrink-0 flex flex-col min-h-0 rounded-xl border border-border/35 panel-secondary overflow-hidden">
                <TradeSetupsPanel />
              </div>

              {/* CENTER: Opportunity Scanner */}
              <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-xl border border-border/35 panel-primary overflow-hidden">
                <OpportunitySection
                  snapshot={opp?.snapshot ?? null}
                  items={opp?.items ?? []}
                />
              </div>

              {/* RIGHT: Emerging Movers */}
              <div className="w-[340px] shrink-0 flex flex-col min-h-0 rounded-xl border border-border/35 panel-secondary overflow-hidden">
                <EmergingSection
                  snapshot={emg?.snapshot ?? null}
                  alerts={emg?.alerts ?? []}
                />
              </div>
            </div>

            {/* BOTTOM: Whale Table (full width) */}
            <div className="shrink-0 rounded-xl border border-border/35 panel-secondary overflow-hidden">
              <WhaleSection
                snapshot={whl?.snapshot ?? null}
                traders={whl?.traders ?? []}
              />
            </div>
          </div>

          {/* ── MOBILE: Tab switcher ── */}
          <div className="lg:hidden flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-3 pt-2">
            {mobileTab === 'setups' && (
              <div className="rounded-xl border border-border/35 panel-secondary overflow-hidden">
                <TradeSetupsPanel />
              </div>
            )}
            {mobileTab === 'opportunities' && (
              <OpportunitySection
                snapshot={opp?.snapshot ?? null}
                items={opp?.items ?? []}
              />
            )}
            {mobileTab === 'emerging' && (
              <EmergingSection
                snapshot={emg?.snapshot ?? null}
                alerts={emg?.alerts ?? []}
              />
            )}
            {mobileTab === 'whales' && (
              <WhaleSection
                snapshot={whl?.snapshot ?? null}
                traders={whl?.traders ?? []}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
