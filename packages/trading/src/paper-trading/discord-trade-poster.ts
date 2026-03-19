/**
 * Discord Trade Notifications — Embeds for trade events
 */

import type { PaperPosition, PaperAccountState, ExitReason } from './types.js';

const COLORS = {
  long: 0x00c853,
  short: 0xe53935,
  tp: 0x00e5ff,
  sl: 0xff6d00,
  info: 0x7c4dff,
  alert: 0xffd740,
};

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

function fmtPrice(price: number): string {
  if (price >= 10000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function fmtPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${pnl.toFixed(2)}`;
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// ── Trade Opened ─────────────────────────────────────────────────────────────

export function buildTradeOpenedEmbed(pos: PaperPosition): DiscordEmbed {
  const isLong = pos.direction === 'LONG';
  const icon = isLong ? '🟢' : '🔴';
  const slPct = Math.abs(pos.entryPrice - pos.slPrice) / pos.entryPrice * 100;

  return {
    title: `${icon} Paper ${pos.direction} — ${pos.asset}/USDT`,
    color: isLong ? COLORS.long : COLORS.short,
    fields: [
      { name: 'Entry', value: fmtPrice(pos.entryPrice), inline: true },
      { name: 'Size', value: `$${pos.sizeUsd.toFixed(0)} (${pos.leverage}x)`, inline: true },
      { name: 'Risk', value: `${pos.riskPct}%`, inline: true },
      { name: 'Stop Loss', value: `${fmtPrice(pos.slPrice)} (${slPct.toFixed(1)}%)`, inline: true },
      { name: 'TP1 (50%)', value: fmtPrice(pos.tp1Price), inline: true },
      { name: 'TP2', value: fmtPrice(pos.tp2Price), inline: true },
      { name: 'R:R', value: `${pos.rrRatio}`, inline: true },
    ],
    footer: { text: 'SMC Paper Trading • Simulated' },
    timestamp: pos.openedAt,
  };
}

// ── Trade Closed ─────────────────────────────────────────────────────────────

function exitReasonLabel(reason: ExitReason): string {
  switch (reason) {
    case 'SL_HIT': return '⛔ Stop Loss Hit';
    case 'TP1_HIT': return '🎯 TP1 Partial Close';
    case 'TP2_HIT': return '🏆 TP2 Full Close';
    case 'STRUCTURE_INVALIDATED': return '🔄 Structure Invalidated';
    case 'EC_FORCE_CLOSE': return '⚡ E&C Force Close';
    case 'TIME_EXIT': return '⏰ Time Exit';
    case 'DRAWDOWN_BREAKER': return '🛑 Drawdown Breaker';
    case 'MANUAL': return '✋ Manual Close';
    default: return reason;
  }
}

export function buildTradeClosedEmbed(pos: PaperPosition): DiscordEmbed {
  const pnl = pos.realisedPnl ?? 0;
  const isWin = pnl > 0;
  const pnlPct = (pnl / pos.sizeUsd) * 100;
  const duration = pos.closedAt
    ? formatDuration(new Date(pos.openedAt).getTime(), new Date(pos.closedAt).getTime())
    : '—';

  return {
    title: `${isWin ? '✅' : '❌'} Paper ${pos.direction} Closed — ${pos.asset}/USDT`,
    color: isWin ? COLORS.tp : COLORS.sl,
    fields: [
      { name: 'Entry', value: fmtPrice(pos.entryPrice), inline: true },
      { name: 'Exit', value: fmtPrice(pos.currentPrice), inline: true },
      { name: 'P&L', value: `${fmtPnl(pnl)} (${fmtPct(pnlPct)})`, inline: true },
      { name: 'Reason', value: exitReasonLabel(pos.exitReason!), inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Size', value: `$${pos.sizeUsd.toFixed(0)}`, inline: true },
    ],
    footer: { text: 'SMC Paper Trading • Simulated' },
    timestamp: pos.closedAt,
  };
}

// ── TP1 Partial Close ────────────────────────────────────────────────────────

export function buildTp1HitEmbed(pos: PaperPosition, partialPnl: number): DiscordEmbed {
  return {
    title: `🎯 TP1 Hit — ${pos.asset}/USDT ${pos.direction}`,
    description: `50% closed at ${fmtPrice(pos.tp1Price)}. SL moved to breakeven (${fmtPrice(pos.entryPrice)}).`,
    color: COLORS.tp,
    fields: [
      { name: 'Partial P&L', value: fmtPnl(partialPnl), inline: true },
      { name: 'Remaining', value: `$${pos.remainingSizeUsd.toFixed(0)}`, inline: true },
      { name: 'TP2 Target', value: fmtPrice(pos.tp2Price), inline: true },
    ],
    footer: { text: 'SMC Paper Trading • Simulated' },
    timestamp: new Date().toISOString(),
  };
}

// ── Daily Summary ────────────────────────────────────────────────────────────

export function buildDailySummaryEmbed(
  account: PaperAccountState,
  todayTrades: number,
  todayWins: number,
): DiscordEmbed {
  const winRate = account.totalTrades > 0
    ? ((account.winCount / account.totalTrades) * 100).toFixed(1)
    : '—';

  return {
    title: '📊 Paper Trading Daily Summary',
    color: account.dailyPnlUsd >= 0 ? COLORS.long : COLORS.short,
    fields: [
      { name: 'Equity', value: `$${account.equity.toFixed(2)}`, inline: true },
      { name: 'Daily P&L', value: fmtPnl(account.dailyPnlUsd), inline: true },
      { name: 'Total P&L', value: fmtPnl(account.totalPnlUsd), inline: true },
      { name: 'Today', value: `${todayTrades} trades (${todayWins}W)`, inline: true },
      { name: 'All Time', value: `${account.totalTrades} trades (${winRate}% WR)`, inline: true },
      { name: 'Drawdown', value: `${account.drawdownPct.toFixed(1)}%`, inline: true },
    ],
    footer: { text: account.isHalted ? '🛑 HALTED' : 'SMC Paper Trading • Simulated' },
    timestamp: new Date().toISOString(),
  };
}

// ── Drawdown Alert ───────────────────────────────────────────────────────────

export function buildDrawdownAlertEmbed(account: PaperAccountState): DiscordEmbed {
  return {
    title: '🛑 Paper Trading HALTED — Drawdown Breaker',
    description: `Account drawdown reached ${account.drawdownPct.toFixed(1)}%. New trades blocked for 24h.`,
    color: COLORS.alert,
    fields: [
      { name: 'Equity', value: `$${account.equity.toFixed(2)}`, inline: true },
      { name: 'Peak', value: `$${account.peakEquity.toFixed(2)}`, inline: true },
      { name: 'Drawdown', value: `${account.drawdownPct.toFixed(1)}%`, inline: true },
    ],
    footer: { text: 'SMC Paper Trading • Simulated' },
    timestamp: new Date().toISOString(),
  };
}

// ── Webhook Sender ───────────────────────────────────────────────────────────

export async function sendTradeWebhook(
  webhookUrl: string,
  embed: DiscordEmbed,
): Promise<void> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!resp.ok) {
      console.error(`[paper-trading] Discord webhook failed: ${resp.status}`);
    }
  } catch (err) {
    console.error('[paper-trading] Discord webhook error:', err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(startMs: number, endMs: number): string {
  const diffMs = endMs - startMs;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
