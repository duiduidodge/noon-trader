'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { SummaryModal } from './summary-modal';
import { ExternalLink, TrendingUp, TrendingDown, Sun, Moon } from 'lucide-react';
import Image from 'next/image';

interface Headline {
  title: string;
  url: string;
  source: string;
}

interface PriceData {
  btc: { price: number; change24h: number };
  eth: { price: number; change24h: number };
  sol: { price: number; change24h: number };
  hype: { price: number; change24h: number };
  totalMarketCap: number;
  marketCapChange24h: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
}

interface Summary {
  id: string;
  scheduleType: 'morning' | 'evening';
  summaryText: string;
  headlines: Headline[];
  prices: PriceData;
  articleCount: number;
  createdAt: string;
}

interface LivePriceCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  priceUsd: number;
  changePercent24Hr: number;
}

interface LivePricesResponse {
  majors: LivePriceCoin[];
  global: {
    totalMcap: number;
    totalVolume: number;
    btcDominance: number;
    avgChange24h: number;
  };
  asOf?: string;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  return `$${(value / 1e6).toFixed(0)}M`;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(2)}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateRich(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate();
  const monthTh = date.toLocaleDateString('th-TH', { month: 'short' });
  const weekdayTh = date.toLocaleDateString('th-TH', { weekday: 'short' });
  return `${weekdayTh}, ${day} ${monthTh}`;
}

function formatDateImpact(isoString: string): string {
  const date = new Date(isoString);
  const fullDate = date.toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${fullDate} • ${formatTime(isoString)} UTC`;
}

// Mini gauge for inline Fear & Greed display
function MiniMoodGauge({ value, label = '', svgClassName = 'w-[80px]' }: { value: number; label?: string; svgClassName?: string }) {
  const valueColor =
    value <= 25 ? 'text-bearish' :
      value <= 45 ? 'text-orange-500' :
        value <= 55 ? 'text-yellow-600' : 'text-bullish';

  const r = 36;
  const cx = 44;
  const cy = 40;
  const nx = cx + (r - 5) * Math.cos((180 - (value / 100) * 180) * (Math.PI / 180));
  const ny = cy - (r - 5) * Math.sin((180 - (value / 100) * 180) * (Math.PI / 180));

  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`Fear and Greed Index: ${value}, ${label}`}>
      <svg viewBox="0 0 88 46" className={svgClassName} aria-hidden="true">
        <defs>
          <linearGradient id="normalFgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(0, 50%, 48%)" />
            <stop offset="25%" stopColor="hsl(25, 70%, 50%)" />
            <stop offset="50%" stopColor="hsl(45, 70%, 50%)" />
            <stop offset="75%" stopColor="hsl(90, 40%, 45%)" />
            <stop offset="100%" stopColor="hsl(145, 55%, 38%)" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#normalFgGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.15" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#normalFgGrad)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 100) * Math.PI * r} ${Math.PI * r}`} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="text-muted-foreground" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="2.5" className="text-muted-foreground" fill="currentColor" />
        <text x={cx} y={cy - 12} textAnchor="middle" className={clsx('font-mono-data font-bold', valueColor)} style={{ fontSize: '18px', fill: 'currentColor' }}>{value}</text>
      </svg>
      <span className={clsx('font-mono-data text-micro font-bold uppercase tracking-widest', valueColor)}>{label}</span>
    </div>
  );
}

// Parse section-based bullet format into structured sections
function parseSections(text: string): Array<{ header: string; bullets: string[] }> | null {
  const sections: Array<{ header: string; bullets: string[] }> = [];
  let current: { header: string; bullets: string[] } | null = null;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('• ')) {
      if (!current) current = { header: '', bullets: [] };
      current.bullets.push(line.slice(2).trim());
    } else {
      if (current) sections.push(current);
      current = { header: line.trim(), bullets: [] };
    }
  }
  if (current) sections.push(current);

  const hasBullets = sections.some(s => s.bullets.length > 0);
  return hasBullets ? sections : null;
}

// Render summary — section+bullet format (new) with paragraph fallback (old)
function FormattedSummary({ text }: { text: string }) {
  const sections = parseSections(text);

  if (sections) {
    return (
      <div className="space-y-5" lang="th">
        {sections.map((section, i) => (
          <div key={i}>
            {section.header && (
              <p className="font-mono-data text-small font-bold uppercase tracking-[0.12em] text-muted-foreground/70 mb-2">
                {section.header}
              </p>
            )}
            <ul className="space-y-2.5">
              {section.bullets.map((bullet, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <span className="text-primary/50 mt-[5px] shrink-0 text-[10px]">◆</span>
                  <span className="font-thai text-body leading-relaxed text-foreground/90">
                    {highlightNumbers(bullet)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: paragraph mode for legacy prose summaries
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  return (
    <div className="space-y-4" lang="th">
      {paragraphs.map((para, idx) => (
        <p key={idx} className="font-thai text-body leading-relaxed text-foreground/90 tracking-wide">
          {highlightNumbers(para)}
        </p>
      ))}
    </div>
  );
}

// Highlight percentages and dollar amounts inline
function highlightNumbers(text: string) {
  const parts = text.split(/([-+]?\d+\.?\d*%|\$[\d,.]+[TBMK]?)/g);
  return parts.map((part, i) => {
    if (/^[-+]?\d+\.?\d*%$/.test(part)) {
      const isPositive = !part.startsWith('-');
      return (
        <span key={i} className={clsx(
          'font-mono-data text-small font-semibold px-0.5 rounded transition-colors',
          isPositive ? 'text-bullish bg-bullish/5' : 'text-bearish bg-bearish/5'
        )}>
          {part}
        </span>
      );
    }
    if (/^\$[\d,.]+[TBMK]?$/.test(part)) {
      return (
        <span key={i} className="font-mono-data text-small font-medium text-foreground px-0.5">
          {part}
        </span>
      );
    }
    return part;
  });
}


// ─── Token mention extraction from headlines ───

const KNOWN_TOKENS: Array<{ ticker: string; keywords: string[] }> = [
  { ticker: 'BTC', keywords: ['BTC', 'Bitcoin'] },
  { ticker: 'ETH', keywords: ['ETH', 'Ethereum', 'Ether'] },
  { ticker: 'SOL', keywords: ['SOL', 'Solana'] },
  { ticker: 'XRP', keywords: ['XRP', 'Ripple'] },
  { ticker: 'BNB', keywords: ['BNB', 'Binance Coin'] },
  { ticker: 'ADA', keywords: ['ADA', 'Cardano'] },
  { ticker: 'DOGE', keywords: ['DOGE', 'Dogecoin'] },
  { ticker: 'AVAX', keywords: ['AVAX', 'Avalanche'] },
  { ticker: 'LINK', keywords: ['LINK', 'Chainlink'] },
  { ticker: 'HYPE', keywords: ['HYPE', 'Hyperliquid'] },
  { ticker: 'MATIC', keywords: ['MATIC', 'Polygon'] },
  { ticker: 'DOT',  keywords: ['DOT', 'Polkadot'] },
  { ticker: 'UNI',  keywords: ['UNI', 'Uniswap'] },
  { ticker: 'LTC',  keywords: ['LTC', 'Litecoin'] },
  { ticker: 'SHIB', keywords: ['SHIB', 'Shiba'] },
  { ticker: 'USDT', keywords: ['USDT', 'Tether'] },
  { ticker: 'USDC', keywords: ['USDC'] },
];

// Real brand logos from CoinGecko CDN (stable thumb URLs)
const TOKEN_IMAGES: Record<string, string> = {
  BTC:  'https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png',
  ETH:  'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
  SOL:  'https://assets.coingecko.com/coins/images/4128/thumb/solana.png',
  XRP:  'https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png',
  BNB:  'https://assets.coingecko.com/coins/images/825/thumb/bnb-icon2_2x.png',
  ADA:  'https://assets.coingecko.com/coins/images/975/thumb/cardano.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/thumb/dogecoin.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/thumb/Avalanche_Circle_RedWhite_Trans.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png',
  HYPE: 'https://assets.coingecko.com/coins/images/51291/thumb/hyperliquid.jpg',
  MATIC:'https://assets.coingecko.com/coins/images/4713/thumb/polygon.png',
  DOT:  'https://assets.coingecko.com/coins/images/12171/thumb/polkadot.png',
  UNI:  'https://assets.coingecko.com/coins/images/12504/thumb/uniswap-uni.png',
  LTC:  'https://assets.coingecko.com/coins/images/2/thumb/litecoin.png',
  SHIB: 'https://assets.coingecko.com/coins/images/11939/thumb/shiba.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/thumb/Tether.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png',
};

function extractTrendingTokens(
  headlines: Headline[],
): Array<{ ticker: string; mentions: number }> {
  const allText = headlines.map((h) => h.title).join(' ');
  return KNOWN_TOKENS.map(({ ticker, keywords }) => ({
    ticker,
    mentions: keywords.reduce((n, kw) => {
      const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return n + (allText.match(new RegExp(`\\b${esc}\\b`, 'gi'))?.length ?? 0);
    }, 0),
  }))
    .filter((t) => t.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 4);
}

// ─── Compact Summary Card ───

function CompactSummaryCard({ summary }: { summary: Summary }) {
  const [isOpen, setIsOpen] = useState(false);
  const isMorning = summary.scheduleType === 'morning';
  const label = isMorning ? 'MORNING SUMMARY' : 'EVENING SUMMARY';

  // ── TL;DR: first 3 bullet lines (lines starting with "• ") ──
  const bullets = summary.summaryText
    .split('\n')
    .filter((line) => line.startsWith('• '))
    .slice(0, 3)
    .map((line) => {
      const text = line.slice(2);
      return text.length > 150 ? text.slice(0, 147) + '…' : text;
    });

  // ── Trending tokens extracted from headline corpus ──
  const trending = extractTrendingTokens(summary.headlines);

  // ── Fear & Greed ──
  const fgIndex = summary.prices?.fearGreedIndex ?? 50;
  const fgLabel = summary.prices?.fearGreedLabel ?? 'Neutral';

  // ── Price lookup (only available for stored majors) ──
  const priceMap: Record<string, { price: number; change: number }> = {
    BTC:  { price: summary.prices?.btc?.price  ?? 0, change: summary.prices?.btc?.change24h  ?? 0 },
    ETH:  { price: summary.prices?.eth?.price  ?? 0, change: summary.prices?.eth?.change24h  ?? 0 },
    SOL:  { price: summary.prices?.sol?.price  ?? 0, change: summary.prices?.sol?.change24h  ?? 0 },
    HYPE: { price: summary.prices?.hype?.price ?? 0, change: summary.prices?.hype?.change24h ?? 0 },
  };

  // ── Sentinel color values for the F&G score bar ──
  const fgBarColor =
    fgIndex <= 25  ? '#f87171' :   // red-400
    fgIndex <= 45  ? '#fb923c' :   // orange-400
    fgIndex <= 55  ? '#facc15' :   // yellow-400
    fgIndex <= 75  ? '#34d399' :   // emerald-400 muted
                     '#10b981';    // emerald-500 vivid

  const fgTextColor =
    fgIndex <= 25  ? 'text-red-400' :
    fgIndex <= 45  ? 'text-orange-400' :
    fgIndex <= 55  ? 'text-yellow-400' :
    fgIndex <= 75  ? 'text-emerald-400/80' :
                     'text-emerald-400';

  return (
    <>
      {/* ── Intelligence Dispatch Card ── */}
      <div
        onClick={() => setIsOpen(true)}
        className="group relative w-full cursor-pointer overflow-hidden rounded-xl border bg-card/95 backdrop-blur-sm transition-all duration-300 hover:brightness-105"
        style={{
          borderColor: isMorning ? 'hsl(38 92% 62% / 0.18)' : 'hsl(199 89% 60% / 0.18)',
          boxShadow: isMorning
            ? '0 2px 12px hsl(0 0% 0%/0.22), 0 20px 48px -12px hsl(0 0% 0%/0.4), 0 0 0 1px hsl(38 92% 62% / 0.06)'
            : '0 2px 12px hsl(0 0% 0%/0.22), 0 20px 48px -12px hsl(0 0% 0%/0.4), 0 0 0 1px hsl(199 89% 60% / 0.06)',
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(true); }
        }}
        aria-label={`Open ${isMorning ? 'Morning' : 'Evening'} Summary`}
      >
        {/* Session top accent bar — full-width gradient fade */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '2px', zIndex: 1,
            background: isMorning
              ? 'linear-gradient(90deg, hsl(38 92% 62% / 0.90) 0%, hsl(38 92% 62% / 0.30) 55%, transparent 100%)'
              : 'linear-gradient(90deg, hsl(199 89% 60% / 0.90) 0%, hsl(199 89% 60% / 0.30) 55%, transparent 100%)',
          }}
        />

        <div style={{ padding: '16px' }} className="relative">

          {/* ══ HEADER ══ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>

            {/* Left: icon + title stack */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

              {/* Session icon — larger box to anchor the bigger title */}
              <div
                className={clsx(
                  'flex shrink-0 items-center justify-center rounded-xl border',
                  isMorning
                    ? 'border-orange-400/30 bg-orange-400/10 text-orange-400/80'
                    : 'border-sky-400/30 bg-sky-400/10 text-sky-400/80'
                )}
                style={{ width: '28px', height: '28px' }}
                aria-hidden="true"
              >
                {isMorning
                  ? <Sun style={{ width: '14px', height: '14px' }} />
                  : <Moon style={{ width: '14px', height: '14px' }} />}
              </div>

              {/* Title + date — both enlarged, both high contrast */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3
                    className="font-display group-hover:text-primary transition-colors duration-200"
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'hsl(var(--foreground) / 0.90)',
                      margin: 0,
                      lineHeight: 1,
                    }}
                  >
                    {isMorning ? 'Morning Briefing' : 'Evening Briefing'}
                  </h3>
                  <span
                    className="animate-pulse"
                    style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'hsl(var(--primary) / 0.55)', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                </div>

                {/* Date — bold, clearly legible */}
                <p
                  className="font-mono-data tabular-nums"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'hsl(var(--muted-foreground) / 0.70)',
                    margin: 0,
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                  }}
                >
                  {formatDateRich(summary.createdAt)}
                  <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
                  {formatTime(summary.createdAt)} UTC
                </p>
              </div>
            </div>

            {/* Right: article count pill */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                border: '1px solid hsl(var(--muted-foreground) / 0.22)',
                background: 'hsl(var(--muted-foreground) / 0.08)',
                borderRadius: '999px', padding: '5px 12px', flexShrink: 0,
              }}
            >
              <span
                className="font-mono-data tabular-nums"
                style={{ fontSize: '13px', fontWeight: 800, lineHeight: 1, color: isMorning ? 'hsl(38 92% 62% / 0.90)' : 'hsl(199 89% 60% / 0.90)' }}
              >
                {summary.articleCount}
              </span>
              <span
                className="font-mono-data"
                style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'hsl(var(--muted-foreground) / 0.55)', lineHeight: 1 }}
              >
                articles
              </span>
            </div>
          </div>

          {/* Header rule */}
          <div style={{ height: '1px', background: 'hsl(var(--border) / 0.25)', marginBottom: '10px' }} />

          {/* ══ BODY — 3fr editorial bullets | 2fr data sidebar ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', alignItems: 'stretch' }}>

            {/* ── LEFT COLUMN: Numbered editorial bullets ── */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {bullets.map((bullet, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  {/* Diamond bullet — session-tinted */}
                  <span
                    style={{
                      display: 'block',
                      width: '5px',
                      height: '5px',
                      borderRadius: '1px',
                      background: isMorning ? 'hsl(38 92% 62% / 0.55)' : 'hsl(199 89% 60% / 0.55)',
                      flexShrink: 0,
                      marginTop: '7px',
                      transform: 'rotate(45deg)',
                    }}
                    aria-hidden="true"
                  />

                  {/* Thai text — clamped to 2 lines to keep card compact */}
                  <p
                    lang="th"
                    className="font-thai group-hover:text-foreground transition-colors duration-200"
                    style={{
                      fontFamily: "'Anuphan', 'DM Sans', sans-serif",
                      fontSize: '13px',
                      lineHeight: '1.58',
                      color: 'hsl(var(--foreground) / 0.88)',
                      margin: 0,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {bullet}
                  </p>
                </div>
              ))}
            </div>

            {/* ── RIGHT COLUMN: F&G score + tickers ── */}
            <div style={{
              borderLeft: `1px solid ${isMorning ? 'hsl(38 92% 62% / 0.18)' : 'hsl(199 89% 60% / 0.18)'}`,
              paddingLeft: '16px',
            }}>

              {/* FEAR & GREED — typographic score, not a gauge */}
              <div style={{ marginBottom: '10px' }}>
                <span
                  className="font-mono-data"
                  style={{ display: 'block', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'hsl(var(--muted-foreground) / 0.50)', marginBottom: '6px' }}
                >
                  Fear &amp; Greed
                </span>

                {/* Score + label — score is the hero, label is the annotation */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px' }}>
                  <span
                    className={clsx('font-mono-data tabular-nums', fgTextColor)}
                    style={{ fontSize: '28px', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em' }}
                  >
                    {fgIndex}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '5px' }}>
                    <span
                      className={clsx('font-mono-data', fgTextColor)}
                      style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.2 }}
                    >
                      {fgLabel}
                    </span>
                    <span
                      className="font-mono-data"
                      style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground) / 0.28)', letterSpacing: '0.05em' }}
                    >
                      out of 100
                    </span>
                  </div>
                </div>

                {/* Gradient spectrum bar with score indicator */}
                <div style={{ position: 'relative', height: '4px', borderRadius: '2px', marginTop: '7px', background: 'linear-gradient(90deg, #ef4444 0%, #f97316 28%, #eab308 52%, #86efac 76%, #22c55e 100%)', opacity: 0.70 }}>
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${Math.min(Math.max(fgIndex, 4), 96)}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: fgBarColor,
                    boxShadow: `0 0 0 2px hsl(var(--card)), 0 0 5px ${fgBarColor}88`,
                    opacity: 1,
                    zIndex: 1,
                  }} />
                </div>
              </div>

              {/* Section rule */}
              <div style={{ height: '1px', background: 'hsl(var(--border) / 0.18)', marginBottom: '8px' }} />

              {/* IN THE NEWS — ticker table */}
              <div>
                <span
                  className="font-mono-data"
                  style={{ display: 'block', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'hsl(var(--muted-foreground) / 0.48)', marginBottom: '5px' }}
                >
                  In the News
                </span>

                {/* Rows: [asset flex] [change 58px] [mentions 30px] */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(trending.length > 0
                    ? trending
                    : [{ ticker: 'BTC', mentions: 0 }, { ticker: 'ETH', mentions: 0 }, { ticker: 'SOL', mentions: 0 }]
                  ).slice(0, 4).map(({ ticker, mentions }, rowIdx) => {
                    const p = priceMap[ticker];
                    const hasPrice = p && p.price > 0;
                    const neg = hasPrice && p.change < 0;
                    const logoUrl = TOKEN_IMAGES[ticker];
                    return (
                      <div
                        key={ticker}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 58px 30px', alignItems: 'center',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          background: rowIdx % 2 === 0 ? 'hsl(var(--surface) / 0.18)' : 'transparent',
                        }}
                      >
                        {/* Asset: logo + ticker */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logoUrl}
                              alt={ticker}
                              style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <span
                              style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'hsl(var(--muted-foreground) / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                              <span className="font-mono-data" style={{ fontSize: '7px', color: 'hsl(var(--muted-foreground) / 0.6)' }}>{ticker[0]}</span>
                            </span>
                          )}
                          <span
                            className="font-mono-data"
                            style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'hsl(var(--foreground) / 0.68)', textTransform: 'uppercase' }}
                          >
                            {ticker}
                          </span>
                        </div>

                        {/* Change % — left-aligned so +/- stack perfectly */}
                        <span
                          className={clsx('font-mono-data tabular-nums', hasPrice ? neg ? 'text-red-400/75' : 'text-emerald-400' : 'text-muted-foreground/30')}
                          style={{ fontSize: '11px', fontWeight: 700, textAlign: 'left' }}
                        >
                          {hasPrice ? formatChange(p.change) : '—'}
                        </span>

                        {/* Mentions — right-aligned to column edge */}
                        <span
                          className="font-mono-data tabular-nums"
                          style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground) / 0.52)', textAlign: 'right' }}
                        >
                          {mentions > 0 ? `${mentions}×` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* Bottom rule */}
          <div style={{ height: '1px', background: 'hsl(var(--border) / 0.2)', margin: '10px 0 0' }} />

          {/* ══ FOOTER ══ */}
          <div style={{ paddingTop: '6px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
              className={clsx(
                'group/cta w-full inline-flex items-center justify-between',
                'font-mono-data text-[10px] font-bold uppercase tracking-[0.16em]',
                'rounded border px-4 py-[7px]',
                isMorning
                  ? 'border-orange-400/35 text-orange-300/60 bg-orange-400/5 hover:border-orange-400/60 hover:text-orange-300/95 hover:bg-orange-400/10'
                  : 'border-sky-400/35 text-sky-300/60 bg-sky-400/5 hover:border-sky-400/60 hover:text-sky-300/95 hover:bg-sky-400/10',
                'transition-all duration-150 focus-ring'
              )}
            >
              Read Full Analysis
              <ExternalLink
                className="h-[11px] w-[11px] transition-transform duration-150 group-hover/cta:translate-x-[2px] group-hover/cta:-translate-y-[2px]"
                aria-hidden="true"
              />
            </button>
          </div>

        </div>
      </div>

      <SummaryModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={label}
        date={formatDateImpact(summary.createdAt)}
      >
        <FullSummaryContent summary={summary} />
      </SummaryModal>
    </>
  );
}

function FullSummaryContent({ summary }: { summary: Summary }) {
  const isMorning = summary.scheduleType === 'morning';
  const { data: liveMarket } = useQuery({
    queryKey: ['market-overview'],
    queryFn: async () => {
      const res = await fetch('/api/market-overview');
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ fearGreedIndex: number; fearGreedLabel: string }>;
    },
    refetchInterval: 60_000,
  });
  const { data: livePrices } = useQuery({
    queryKey: ['prices'],
    queryFn: async () => {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error('Failed to fetch prices');
      return res.json() as Promise<LivePricesResponse>;
    },
    refetchInterval: 60_000,
  });

  const { prices } = summary;
  const liveFG = liveMarket?.fearGreedIndex ?? prices.fearGreedIndex;
  const liveFGLabel = liveMarket?.fearGreedLabel ?? prices.fearGreedLabel;
  const moodTone =
    liveFG >= 55 ? 'BULLISH' : liveFG <= 45 ? 'BEARISH' : 'NEUTRAL';
  const globalMCap = livePrices?.global.totalMcap ?? prices.totalMarketCap;
  const globalVolume = livePrices?.global.totalVolume ?? 0;
  const btcDom = livePrices?.global.btcDominance ?? 0;
  const globalChange = livePrices?.global.avgChange24h ?? prices.marketCapChange24h;
  const liveAsOf = livePrices?.asOf ? formatTime(livePrices.asOf) : null;

  const majors = livePrices?.majors?.length
    ? livePrices.majors
        .filter((coin) => ['BTC', 'ETH', 'XRP', 'SOL', 'HYPE'].includes(coin.symbol))
        .sort((a, b) => ['BTC', 'ETH', 'XRP', 'SOL', 'HYPE'].indexOf(a.symbol) - ['BTC', 'ETH', 'XRP', 'SOL', 'HYPE'].indexOf(b.symbol))
    : [
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', image: null, priceUsd: prices.btc.price, changePercent24Hr: prices.btc.change24h },
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', image: null, priceUsd: prices.eth.price, changePercent24Hr: prices.eth.change24h },
        { id: 'xrp', symbol: 'XRP', name: 'XRP', image: null, priceUsd: 0, changePercent24Hr: 0 },
        { id: 'sol', symbol: 'SOL', name: 'Solana', image: null, priceUsd: prices.sol.price, changePercent24Hr: prices.sol.change24h },
        { id: 'hype', symbol: 'HYPE', name: 'Hyperliquid', image: null, priceUsd: prices.hype.price, changePercent24Hr: prices.hype.change24h },
      ];

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-unit-3 lg:grid-cols-12 lg:gap-unit-4">
      <section className="lg:col-span-4 flex min-h-0 flex-col rounded-xl border border-border/35 bg-[linear-gradient(to_bottom,hsl(var(--surface)/0.5),hsl(var(--surface)/0.22))] p-unit-3">
        <div className="mb-unit-3 flex items-center justify-between">
          <h4 className="font-mono-data text-small font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Market Desk
          </h4>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono-data text-small uppercase tracking-[0.1em] text-primary/90">
            {liveAsOf ? `Live ${liveAsOf}` : 'Live'}
          </span>
        </div>

        <div className="mb-unit-3 rounded-xl border border-border/25 bg-card/45 px-unit-3 py-unit-3 shadow-inner">
          <MiniMoodGauge value={liveFG} label={liveFGLabel} />
          <p className="mt-2 text-center font-mono-data text-small uppercase tracking-[0.12em] text-muted-foreground/80">
            {moodTone} • {liveFG}/100
          </p>
        </div>

        <div className="mb-unit-3 rounded-xl border border-border/25 bg-card/25 p-unit-2">
          <div className="mb-unit-2 flex items-center justify-between">
            <h4 className="font-mono-data text-small font-bold uppercase tracking-[0.14em] text-muted-foreground/85">
              News Sources
            </h4>
            <span className="font-mono-data text-small uppercase tracking-[0.1em] text-muted-foreground/70">
              {summary.articleCount}
            </span>
          </div>
          <div className="custom-scrollbar max-h-[28dvh] space-y-1.5 overflow-y-auto pr-0.5">
            {summary.headlines.map((headline, idx) => (
              <a
                key={idx}
                href={headline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border border-border/30 bg-surface/24 p-unit-2 transition-colors duration-fast hover:border-primary/35 hover:bg-card/65 focus-ring"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono-data text-small font-semibold uppercase tracking-[0.1em] text-primary/85">
                    #{(idx + 1).toString().padStart(2, '0')}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/35 transition-colors duration-fast group-hover:text-primary/80" aria-hidden="true" />
                </div>
                <p className="line-clamp-2 font-thai text-small leading-snug text-foreground/90">
                  {headline.title}
                </p>
                <p className="mt-1 font-mono-data text-caption uppercase tracking-[0.1em] text-muted-foreground/75">
                  {headline.source}
                </p>
              </a>
            ))}
          </div>
        </div>

        <div className="mb-unit-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/25 bg-card/40 px-unit-2 py-unit-2">
            <p className="font-mono-data text-caption uppercase tracking-[0.1em] text-muted-foreground/75">MCap</p>
            <p className="mt-1 font-mono-data text-body font-bold text-foreground">{formatMarketCap(globalMCap)}</p>
            <p className={clsx('font-mono-data text-small font-semibold flex items-center gap-0.5', globalChange >= 0 ? 'text-bullish' : 'text-bearish')}>
              {globalChange >= 0 ? <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" /> : <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />}
              {formatChange(globalChange)}
            </p>
          </div>
          <div className="rounded-lg border border-border/25 bg-card/40 px-unit-2 py-unit-2">
            <p className="font-mono-data text-caption uppercase tracking-[0.1em] text-muted-foreground/75">Volume</p>
            <p className="mt-1 font-mono-data text-body font-bold text-foreground">
              {globalVolume > 0 ? formatCompactCurrency(globalVolume) : 'N/A'}
            </p>
            <p className="font-mono-data text-small text-muted-foreground/70">24h</p>
          </div>
          <div className="rounded-lg border border-border/25 bg-card/40 px-unit-2 py-unit-2">
            <p className="font-mono-data text-caption uppercase tracking-[0.1em] text-muted-foreground/75">BTC Dom</p>
            <p className="mt-1 font-mono-data text-body font-bold text-foreground">
              {btcDom > 0 ? `${btcDom.toFixed(1)}%` : 'N/A'}
            </p>
            <p className="font-mono-data text-small text-muted-foreground/70">Dominance</p>
          </div>
          <div className="rounded-lg border border-border/25 bg-card/40 px-unit-2 py-unit-2">
            <p className="font-mono-data text-caption uppercase tracking-[0.1em] text-muted-foreground/75">Coverage</p>
            <p className="mt-1 font-mono-data text-body font-bold text-foreground">{summary.articleCount}</p>
            <p className="font-mono-data text-small text-muted-foreground/70">Articles</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 rounded-xl border border-border/25 bg-card/25 p-unit-2">
          <div className="mb-unit-2 flex items-center justify-between">
            <p className="font-mono-data text-caption font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
              Majors
            </p>
            <span className="font-mono-data text-caption uppercase tracking-[0.1em] text-muted-foreground/65">24h</span>
          </div>
          <div className="custom-scrollbar h-full space-y-1.5 overflow-y-auto pr-0.5" role="list" aria-label="Major cryptocurrencies">
            {majors.map((coin) => {
              const positive = coin.changePercent24Hr >= 0;
              return (
                <div key={coin.id} className="flex items-center justify-between rounded-md border border-border/25 bg-surface/20 px-unit-2 py-1.5" role="listitem">
                  <div className="flex min-w-0 items-center gap-2">
                    {coin.image ? (
                      <Image src={coin.image} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded-full" />
                    ) : (
                      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface/70 font-mono-data text-micro text-muted-foreground">
                        {coin.symbol[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-body text-body font-semibold uppercase tracking-[0.06em] text-foreground">{coin.symbol}</p>
                      <p className="truncate font-mono-data text-caption uppercase tracking-[0.08em] text-muted-foreground/70">
                        {coin.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-data text-body font-semibold text-foreground">
                      {coin.priceUsd > 0 ? formatPrice(coin.priceUsd) : 'N/A'}
                    </p>
                    <p className={clsx('font-mono-data text-small font-semibold', positive ? 'text-bullish' : 'text-bearish')}>
                      {formatChange(coin.changePercent24Hr)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lg:col-span-8 grid min-h-0 grid-cols-1 gap-unit-3">
        <article className="min-h-0 rounded-xl border border-border/35 bg-[linear-gradient(to_bottom,hsl(var(--surface)/0.42),hsl(var(--surface)/0.22))] p-unit-3">
          <div className="mb-unit-3 flex items-center justify-between">
            <h4 className="font-mono-data text-small font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Analysis
            </h4>
            <span className="rounded-full border border-border/35 bg-card/50 px-2 py-0.5 font-mono-data text-small uppercase tracking-[0.1em] text-muted-foreground/75">
              {isMorning ? 'Morning Edition' : 'Evening Edition'}
            </span>
          </div>
          <div className="custom-scrollbar max-h-[65dvh] overflow-y-auto pr-1">
            <div className="font-thai text-subhead leading-relaxed text-foreground/92">
              <FormattedSummary text={summary.summaryText} />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

export function BiDailySummary() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummaries() {
      try {
        const res = await fetch('/api/summaries');
        if (res.ok) {
          const data = await res.json();
          setSummaries(data.slice(0, 1));
        }
      } catch (error) {
        console.error('Failed to fetch summaries:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSummaries();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/90 p-4 md:p-5 space-y-4"
        style={{ boxShadow: '0 -1px 0 0 hsl(var(--primary)/0.1), 0 8px 24px -6px hsl(0 0% 0%/0.3)' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-5 rounded bg-surface/50 animate-shimmer" />
            <div className="space-y-1.5">
              <div className="h-2.5 w-28 rounded-full bg-surface/50 animate-shimmer" />
              <div className="h-2 w-20 rounded-full bg-surface/30 animate-shimmer" />
            </div>
          </div>
          <div className="h-7 w-20 rounded-full bg-surface/40 animate-shimmer" />
        </div>
        {/* Body */}
        <div className="flex gap-4">
          <div className="flex-[3] space-y-2.5">
            {[100, 88, 76].map((w) => (
              <div key={w} className="flex gap-2 items-start">
                <div className="h-2 w-2 mt-1 rounded-full bg-surface/50 animate-shimmer shrink-0" />
                <div className={`h-3.5 rounded bg-surface/40 animate-shimmer`} style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="w-px bg-border/15 shrink-0" />
          <div className="flex-[2] space-y-2">
            <div className="h-2 w-16 rounded-full bg-surface/30 animate-shimmer" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-[5px] w-[5px] rounded-full bg-surface/50 animate-shimmer shrink-0" />
                <div className="h-3 w-8 rounded-full bg-surface/50 animate-shimmer" />
                <div className="h-3 w-12 rounded-full bg-surface/40 animate-shimmer" />
                <div className="h-2.5 w-5 rounded-full bg-surface/30 animate-shimmer ml-auto" />
              </div>
            ))}
          </div>
        </div>
        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-border/15">
          <div className="h-3 w-32 rounded-full bg-surface/30 animate-shimmer" />
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {summaries.map((summary) => (
        <CompactSummaryCard key={summary.id} summary={summary} />
      ))}
    </div>
  );
}
