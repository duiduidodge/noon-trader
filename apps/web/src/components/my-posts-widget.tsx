'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { PenLine, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { PostCard, type UserPostItem } from './post-card';

interface PostsResponse {
  posts: UserPostItem[];
}

async function fetchPosts(): Promise<PostsResponse> {
  const res = await fetch('/api/posts?limit=5');
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export function MyPostsWidget() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['my-posts'],
    queryFn: fetchPosts,
    refetchInterval: 2 * 60_000,
  });

  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <WidgetCard
      title="My Feed"
      headerRight={
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <div className="font-mono-data text-[9px] text-muted-foreground/40 hidden sm:block">
              UPDATED {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <button
            onClick={toggleCollapse}
            className="flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-all duration-200"
            aria-label={collapsed ? 'Expand posts' : 'Collapse posts'}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      }
    >
      <div
        className="transition-all duration-500 ease-in-out overflow-hidden"
        style={{
          maxHeight: collapsed ? '0px' : '600px',
          opacity: collapsed ? 0 : 1,
        }}
      >
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="space-y-3 px-4 py-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/30 bg-card/50 p-4">
                  <div className="mb-2 h-3 w-24 animate-shimmer rounded" />
                  <div className="mb-2 h-4 w-[82%] animate-shimmer rounded" />
                  <div className="h-3 w-[60%] animate-shimmer rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-5 py-10 text-center font-mono-data text-xs text-bearish/70 tracking-wider uppercase">
              Connection lost
            </div>
          ) : data?.posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="relative mb-5 group">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/15 shadow-inner backdrop-blur-sm">
                  <PenLine className="h-7 w-7 text-primary/70" />
                </div>
                <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-primary/60 animate-pulse" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground/90 mb-2">
                Start Your Coverage
              </h3>
              <p className="text-xs text-muted-foreground/70 mb-6 max-w-[220px] leading-relaxed">
                Transform market insights into engaging content. Your audience is waiting.
              </p>
              <button className="relative inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 hover:border-primary/40 transition-all duration-300 group overflow-hidden">
                <span className="relative z-10 flex items-center gap-2">
                  <PenLine className="h-3.5 w-3.5" />
                  Create First Post
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {data?.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
