'use client';

import { useTheme } from './theme-provider';
import { Sun, Moon } from 'lucide-react';
import { useState, useCallback } from 'react';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const [bursting, setBursting] = useState(false);

    const handleToggle = useCallback(() => {
        setBursting(true);
        toggleTheme();
        setTimeout(() => setBursting(false), 600);
    }, [toggleTheme]);

    const isDark = theme === 'dark';

    return (
        <button
            onClick={handleToggle}
            className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface/60 transition-all duration-normal overflow-hidden md:h-9 md:w-9 focus-ring"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`${isDark ? 'Light' : 'Dark'} mode`}
        >
            {/* Burst ring animation */}
            {bursting && (
                <span className="absolute inset-0 pointer-events-none" aria-hidden="true">
                    <span className={`
                        absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                        w-3 h-3 rounded-full
                        animate-theme-burst
                        ${isDark
                            ? 'bg-indigo-400/40 shadow-[0_0_16px_hsl(230,60%,65%)]'
                            : 'bg-amber-300/40 shadow-[0_0_16px_hsl(45,90%,60%)]'
                        }
                    `} />
                </span>
            )}

            {/* Fixed-size icon container to prevent layout shift */}
            <div className="relative h-[18px] w-[18px]">
                <Sun
                    className={`absolute inset-0 h-[18px] w-[18px] transition-all duration-normal ${isDark
                        ? 'rotate-90 scale-0 opacity-0'
                        : 'rotate-0 scale-100 opacity-100'
                    }`}
                    aria-hidden="true"
                />
                <Moon
                    className={`absolute inset-0 h-[18px] w-[18px] transition-all duration-normal ${!isDark
                        ? '-rotate-90 scale-0 opacity-0'
                        : 'rotate-0 scale-100 opacity-100'
                    }`}
                    aria-hidden="true"
                />
            </div>
        </button>
    );
}
