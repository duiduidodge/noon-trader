'use client';

import { clsx } from 'clsx';

const TAGS = [
  'Briefing', 'Reports', 'Marks',
  'BTC', 'ETH', 'DeFi', 'NFT', 'Memecoin', 'ETF', 'Macro',
  'Regulation', 'AI',
];

interface TagFilterProps {
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
}

export function TagFilter({ selectedTag, onTagSelect }: TagFilterProps) {
  return (
    <div className="relative border-b border-border/30">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-5 py-3 tag-scroll-mask" role="tablist" aria-label="Filter by tag">
        <TagButton
          active={!selectedTag}
          onClick={() => onTagSelect(null)}
        >
          Filter
        </TagButton>
        {TAGS.map((tag) => (
          <TagButton
            key={tag}
            active={selectedTag === tag}
            onClick={() => onTagSelect(selectedTag === tag ? null : tag)}
          >
            {tag}
          </TagButton>
        ))}
      </div>
    </div>
  );
}

function TagButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={clsx(
        'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 border',
        active
          ? 'bg-primary/12 text-primary border-primary/30 shadow-sm scale-[1.02]'
          : 'bg-transparent text-muted-foreground border-border/60 hover:border-primary/25 hover:text-foreground hover:bg-surface/50 active:scale-95'
      )}
    >
      {children}
    </button>
  );
}
