import { cn } from '@/lib/utils';

interface PanelShellProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  variant?: 'primary' | 'secondary';
}

/**
 * Outer box for the LlamaFeed-style panel layout.
 * `primary` — center column, elevated shadow for visual dominance.
 * `secondary` — side columns, flatter and more recessive.
 */
export function PanelShell({ children, className, id, variant = 'secondary' }: PanelShellProps) {
  return (
    <div
      id={id}
      className={cn(
        'flex flex-col min-h-0',
        'rounded-2xl',
        'bg-card/72 backdrop-blur-sm',
        variant === 'primary' ? 'panel-primary' : 'panel-secondary',
        className
      )}
    >
      {children}
    </div>
  );
}
