import { clsx } from 'clsx';

interface WidgetCardProps {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function WidgetCard({ title, headerRight, children, className }: WidgetCardProps) {
  return (
    <div
      className={clsx(
        'rounded-2xl overflow-hidden border border-border/45 bg-card/75 backdrop-blur-sm shadow-sm',
        className
      )}
    >
      {/* Accent Top Gradient */}
      <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent opacity-80" />

      <div className="flex items-center justify-between border-b border-border/30 bg-surface/18 px-5 py-4">
        <h2 className="font-display text-sm font-bold tracking-widest text-foreground uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          {title}
        </h2>
        {headerRight}
      </div>
      <div className="bg-surface/[0.08]">{children}</div>
    </div>
  );
}
