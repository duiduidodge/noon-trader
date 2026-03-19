import { clsx } from 'clsx';
import { SentimentBadge } from './sentiment-badge';
import { formatTimeAgo } from '@/lib/utils';
import type { FeedArticle } from './news-card';

interface HeroArticleProps {
  article: FeedArticle;
}

const sentimentAccent: Record<string, string> = {
  BULLISH: 'border-bullish/30 shadow-[0_0_24px_hsl(var(--bullish)/0.08)]',
  BEARISH: 'border-bearish/30 shadow-[0_0_24px_hsl(var(--bearish)/0.08)]',
  NEUTRAL: 'border-accent/20 shadow-[0_0_24px_hsl(var(--accent)/0.06)]',
};

export function HeroArticle({ article }: HeroArticleProps) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'group relative block overflow-hidden rounded-lg border glass p-6 transition-all duration-300',
        'hover:-translate-y-[2px] hover:shadow-[0_0_32px_hsl(var(--accent)/0.12)]',
        sentimentAccent[article.sentiment] || sentimentAccent.NEUTRAL
      )}
    >
      {/* Top accent gradient */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Label */}
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono-data text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
          Breaking
        </span>
        <span className="h-[1px] w-6 bg-accent/30" />
        <span className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">
          {article.sourceName}
        </span>
        {article.publishedAt && (
          <>
            <span className="text-border">&middot;</span>
            <span className="font-mono-data text-[10px] text-muted-foreground/70">
              {formatTimeAgo(article.publishedAt)}
            </span>
          </>
        )}
        <div className="ml-auto">
          <SentimentBadge sentiment={article.sentiment} />
        </div>
      </div>

      {/* Title — large display */}
      <h2 className="mb-2 font-display text-xl font-bold leading-tight text-foreground group-hover:text-accent transition-colors duration-300 md:text-2xl">
        {article.title}
      </h2>

      {/* Snippet */}
      {article.snippet && (
        <p className="mb-4 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {article.snippet}
        </p>
      )}

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {article.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded border border-border/40 bg-secondary/60 px-2 py-0.5 font-mono-data text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
