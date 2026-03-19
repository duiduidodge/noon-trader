'use client';

import { formatTimeAgo } from '@/lib/utils';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface UserPostItem {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

interface PostCardProps {
  post: UserPostItem;
}

const FIXED_AVATAR_URL =
  'https://grleehzftxkszwherpma.supabase.co/storage/v1/object/public/posts/posts/1770636237169-r6948j.png';

export function PostCard({ post }: PostCardProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const previewText =
    post.content.length > 140 ? `${post.content.slice(0, 140).replace(/\s+\S*$/, '')}...` : post.content;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full relative border-b border-border/20 px-5 py-5 text-left transition-all duration-normal hover:bg-surface/50 overflow-hidden"
      >
        {/* Futuristic scanline hover */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-normal group-hover:opacity-100" />
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-primary to-transparent opacity-0 transition-opacity duration-normal group-hover:opacity-70" />

        <div className="flex items-start gap-4">
          {/* Avatar with cyber glow */}
          <div className="relative mt-0.5 h-11 w-11 shrink-0">
            <div className="absolute -inset-1 rounded-full bg-primary/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-normal" />
            <div className="relative h-full w-full overflow-hidden rounded-full border-[1.5px] border-primary/40 bg-background/80 shadow-[0_0_10px_rgba(var(--primary),0.2)] group-hover:border-primary transition-all duration-normal">
              <Image src={FIXED_AVATAR_URL} alt="Profile picture" fill className="object-cover grayscale group-hover:grayscale-0 transition-all duration-normal" />
            </div>
          </div>

          <div className="relative min-w-0 flex-1 flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-thai text-base font-bold text-foreground/85 group-hover:text-white transition-colors line-clamp-1">
                {post.title}
              </h4>
              <span className="shrink-0 font-mono-data text-micro text-muted-foreground/60 uppercase tracking-widest whitespace-nowrap bg-surface/40 px-2 py-0.5 rounded-sm border border-border/30">
                {formatTimeAgo(post.createdAt)}
              </span>
            </div>

            {/* Content Container */}
            <div className="relative rounded-xl border border-border/20 bg-background/40 px-4 py-3 backdrop-blur-md group-hover:bg-primary/5 group-hover:border-primary/30 transition-all duration-normal shadow-sm">

              {/* Decorative Corner */}
              <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />

              {post.imageUrl && (
                <div className="relative mb-3 overflow-hidden rounded-md border border-border/30 shadow-md group/image">
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent z-10 opacity-0 group-hover/image:opacity-100 transition-opacity duration-normal" />
                  <Image
                    src={post.imageUrl}
                    alt={post.title}
                    width={800}
                    height={360}
                    className="h-32 w-full object-cover transform scale-100 group-hover/image:scale-105 transition-transform duration-slow"
                  />
                  <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity duration-normal">
                    <div className="bg-background/60 backdrop-blur-md p-2 rounded-full text-primary border border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground/90 font-sans group-hover:text-foreground/90 transition-colors">
                {previewText}
              </p>
            </div>
          </div>
        </div>
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-background/80 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-border/40 bg-background/50 px-5 py-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-primary/20 bg-surface/70">
                  <Image src={FIXED_AVATAR_URL} alt="Profile picture" fill className="object-cover" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">You</span>
                  <span className="font-mono-data text-[10px] text-muted-foreground/70">
                    {formatTimeAgo(post.createdAt)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-surface/50 p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
                aria-label="Close post"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(85vh-70px)] overflow-y-auto custom-scrollbar bg-surface/20">
              <div className="p-6">
                <h3 className="font-display text-xl leading-snug font-bold tracking-tight text-foreground mb-4">
                  {post.title}
                </h3>

                {post.imageUrl && (
                  <div className="relative mb-6 overflow-hidden rounded-xl border border-border/30 shadow-md group">
                    <Image
                      src={post.imageUrl}
                      alt={post.title}
                      width={900}
                      height={500}
                      className="w-full object-cover max-h-[50vh]"
                    />
                  </div>
                )}

                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90 font-sans">
                    {post.content}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
