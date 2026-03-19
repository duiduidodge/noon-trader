'use client';

interface RankSparklineProps {
  data: number[] | null;
  inverted?: boolean; // true for ranks (lower = better), false for contributions (higher = better)
}

export function RankSparkline({ data, inverted = true }: RankSparklineProps) {
  if (!data || data.length < 2) return null;

  const W = 48;
  const H = 18;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (W - 2 * pad),
    y: inverted
      ? pad + ((v - min) / range) * (H - 2 * pad) // higher rank = higher y = worse
      : H - pad - ((v - min) / range) * (H - 2 * pad), // higher value = lower y = better
  }));

  const isImproving = inverted
    ? data[data.length - 1] < data[0] // rank decreased = improved
    : data[data.length - 1] > data[0]; // contribution increased = improved

  const strokeColor = isImproving ? 'hsl(var(--bullish))' : 'hsl(var(--bearish))';
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden="true">
      <polyline
        points={line}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill={strokeColor} />
    </svg>
  );
}
