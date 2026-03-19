import { clsx } from 'clsx';

const sentimentConfig: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  BULLISH: {
    dot: 'bg-bullish',
    text: 'text-bullish',
    bg: 'bg-bullish/8 border-bullish/20',
    label: 'Bullish',
  },
  BEARISH: {
    dot: 'bg-bearish',
    text: 'text-bearish',
    bg: 'bg-bearish/8 border-bearish/20',
    label: 'Bearish',
  },
  NEUTRAL: {
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
    bg: 'bg-surface/60 border-border/50',
    label: 'Neutral',
  },
};

interface SentimentBadgeProps {
  sentiment: string;
}

export function SentimentBadge({ sentiment }: SentimentBadgeProps) {
  const config = sentimentConfig[sentiment] || sentimentConfig.NEUTRAL;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono-data font-medium',
        config.bg,
        config.text
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  );
}

const impactConfig: Record<string, { color: string; bg: string }> = {
  HIGH: { color: 'text-orange-600', bg: 'bg-orange-500/8 border-orange-500/20' },
  MEDIUM: { color: 'text-yellow-600', bg: 'bg-yellow-500/8 border-yellow-500/20' },
  LOW: { color: 'text-blue-500', bg: 'bg-blue-500/8 border-blue-500/20' },
};

interface ImpactBadgeProps {
  impact: string;
}

export function ImpactBadge({ impact }: ImpactBadgeProps) {
  const config = impactConfig[impact] || impactConfig.LOW;

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono-data font-medium',
        config.bg,
        config.color
      )}
    >
      {impact}
    </span>
  );
}
