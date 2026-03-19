'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { NewsCard, type FeedArticle } from './news-card';

interface NewsFeedProps {
  initialArticles: FeedArticle[];
}

async function fetchArticles(tag: string | null, cursor: string | null) {
  const params = new URLSearchParams();
  if (tag) params.set('tag', tag);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '20');

  const res = await fetch(`/api/articles?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch articles');
  return res.json() as Promise<{
    articles: FeedArticle[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
}

export function NewsFeed({ initialArticles }: NewsFeedProps) {
  const [loadedPages, setLoadedPages] = useState<FeedArticle[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['feed-articles'],
    queryFn: () => fetchArticles(null, null),
    refetchInterval: 2 * 60 * 1000,
  });

  const handleLoadMore = async () => {
    const lastArticle = allArticles[allArticles.length - 1];
    if (!lastArticle || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await fetchArticles(null, lastArticle.id);
      setLoadedPages((prev) => [...prev, ...result.articles]);
      setHasMore(result.hasMore);
    } catch (error) {
      setLoadMoreError('Could not load more articles. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const baseArticles = !data ? initialArticles : data?.articles || [];
  const allArticles = [...baseArticles, ...loadedPages];

  useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          void handleLoadMore();
        }
      },
      {
        root,
        rootMargin: '120px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, allArticles.length]);

  return (
    <div className="flex h-full min-h-0 flex-col space-y-0">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/35 bg-card/90 px-4 py-3 backdrop-blur-lg transition-all duration-normal md:px-5">
        <h2 className="font-display text-[11px] font-bold tracking-[0.2em] text-foreground/70 uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          Latest Intel
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono-data text-[11px] font-semibold text-muted-foreground/55">
            {allArticles.length} <span className="font-normal opacity-75">articles</span>
          </span>
          {dataUpdatedAt > 0 && (
            <span className="hidden sm:block font-mono-data text-[11px] text-muted-foreground/40">
              {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto custom-scrollbar scroll-smooth" role="feed" aria-label="News articles" aria-live="polite">
        {isLoading ? (
          <div className="divide-y divide-border/15">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-[9px] md:px-5 pl-7">
                <div className="mb-[5px] flex items-center gap-2">
                  <div className="h-[5px] w-[5px] animate-shimmer rounded-full" />
                  <div className="h-2.5 w-20 animate-shimmer rounded-full" />
                  <div className="ml-auto h-2 w-10 animate-shimmer rounded-full" />
                </div>
                <div className="h-3.5 w-[88%] animate-shimmer rounded mb-1.5" />
                <div className="h-3.5 w-[65%] animate-shimmer rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="font-mono-data text-[10px] uppercase tracking-wider text-bearish/70 mb-3">
              Feed unavailable
            </p>
            <button
              onClick={() => void refetch()}
              className="rounded border border-border/50 px-3 py-1.5 font-mono-data text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors duration-fast focus-ring"
            >
              Retry
            </button>
          </div>
        ) : allArticles.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="font-mono-data text-[10px] text-muted-foreground/45 uppercase tracking-wider">
              No intel found
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/15">
              {allArticles.map((article, i) => (
                <NewsCard key={article.id} article={article} index={i} />
              ))}
            </div>

            {hasMore && allArticles.length > 0 && (
              <div className="px-4 py-4 flex flex-col items-center gap-2">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  aria-busy={isLoadingMore}
                  className="font-mono-data text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 hover:text-primary/80 transition-colors duration-fast disabled:opacity-40 focus-ring rounded px-3 py-1.5"
                >
                  {isLoadingMore ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    '+ Load More'
                  )}
                </button>
                {loadMoreError && (
                  <p className="font-mono-data text-[10px] text-bearish">{loadMoreError}</p>
                )}
              </div>
            )}
            <div
              ref={sentinelRef}
              className="h-4 w-full"
              aria-hidden="true"
              aria-label={isLoadingMore ? 'Loading more articles' : undefined}
            />
            {!hasMore && allArticles.length > 0 && (
              <div className="px-4 py-5 text-center border-t border-border/15">
                <p className="font-mono-data text-[10px] uppercase tracking-[0.2em] text-muted-foreground/35">
                  End of Stream
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
