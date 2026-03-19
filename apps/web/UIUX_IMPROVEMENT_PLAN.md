# noon Feed — UI/UX Improvement Plan

> Analysis performed Feb 12, 2026 using the **frontend-design** skill.
> Aesthetic direction: **Editorial Intelligence Dashboard** — refined, editorial, data-rich.

---

## Current State Assessment

### What's Working Well ✅

| Area | Notes |
|------|-------|
| **Brand identity** | "noon" wordmark is bold and distinctive. Sage-green palette is unusual and memorable — avoids the generic purple-gradient trap. |
| **Light/dark mode** | Dual-theme system works smoothly with localStorage persistence and FOUC prevention. Color palette is genuinely different between modes, not just an inversion. |
| **Information density** | The 4-column layout delivers maximum intelligence at a glance. Correct for the "crypto analyst terminal" use case. |
| **Market Mood gauge** | The semicircle Fear & Greed SVG is a strong visual anchor — immediately scannable. |
| **Scrolling ticker** | Creates a Bloomberg Terminal vibe. Data-dense but not noisy. |
| **Typography separation** | Sora (display) + DM Sans (body) + JetBrains Mono (data) — good 3-tier hierarchy. |

---

### Issues & Opportunities 🔍

#### 1. LAYOUT & SPATIAL COMPOSITION

**Problem: Column proportions feel unbalanced**
- The "Latest Intel" column (Col 1) is too narrow — headlines are cramped and wrap excessively. Source name + timestamp + sentiment badge all fight for a single row.
- The "Morning Briefing" (Col 2) is the widest column but contains only a single text stream — lots of horizontal wasted space.
- "Market Mood" (Col 3) and "My Posts" (Col 4) are roughly the same width but Col 4 is empty most of the time — it's a permanent dead zone.

**Fix: Rethink the grid**
- Consider a **3-column layout** where "My Posts" sits *below* the Market column (stacked), not as its own 4th column. This gives Latest Intel and Briefing more room.
- Alternative: Make Col 4 a collapsible sidebar that can be toggled open/closed.

**Problem: No visual breathing room**
- All 4 columns start at the same y-position and have the same rounded-2xl treatment. The result is a "wall of identical boxes" — nothing has visual hierarchy.

**Fix: Vary card elevation and spacing**
- Give the Briefing column slightly more vertical offset or a subtle shadow to make it feel like the "hero" content.
- Use asymmetric padding or stagger the column tops slightly.

---

#### 2. HEADER & NAVIGATION

**Problem: Navigation tabs are non-functional**
- "Latest Intel", "Briefing", "Markets", "Data" tabs exist but do nothing. This erodes user trust.

**Fix: Either wire them up or remove them**
- If they're aspirational, replace with a subtle "Coming soon" tooltip on hover.
- Consider making the active tab drive scroll-to-column behavior.

**Problem: Logo + nav + toggle are too spread out**
- On wide screens (1920px+), the header has huge empty gaps between the left logo, center nav, and right controls.

**Fix: Constrain header content width**
- Max-width the header inner content or use a denser layout with logo and nav closer together.

---

#### 3. NEWS FEED (LATEST INTEL)

**Problem: All cards look identical**
- Every news card has the same visual weight regardless of sentiment or impact. "HIGH" impact articles with "BULLISH" sentiment look exactly like "LOW" impact "NEUTRAL" ones — only a tiny dot and text label distinguish them.

**Fix: Visual differentiation by importance**
- HIGH impact cards should have a left accent border (e.g., `border-l-2 border-orange-500`).
- BULLISH/BEARISH sentiment should influence the hover color or background tint.
- Consider a "BREAKING" treatment for very recent HIGH-impact articles — a subtle pulse or highlight.

**Problem: Tag filter pills are cut off**
- The filter row shows "Filter, Briefing, Reports, Marks, BTC, E..." — the last item is truncated. No scroll hint or overflow indicator.

**Fix: Horizontal scroll with fade-out mask**
- Add a CSS gradient mask on the right edge to indicate more content.
- Or use a chip carousel with subtle left/right scroll arrows.

**Problem: Source names use monospace uppercase**
- "COINDESK", "COINTELEGRAPH" in tiny monospace caps is very hard to scan. They all blur together.

**Fix: Add source favicons or color-coded dots**
- Each source gets a tiny colored circle (CoinDesk = blue, CoinTelegraph = gold, etc.) for instant visual recognition.

---

#### 4. MORNING BRIEFING

**Problem: Massive text block with no visual breaks**
- The summary is a single giant wall of Thai text. No paragraphs, no pull-quotes, no visual anchors.

**Fix: Editorial formatting**
- Add paragraph spacing (currently appears as one continuous block).
- Pull out key numbers as inline highlights (e.g., wrap percentages in `<span class="text-primary font-semibold">`).
- Add a TL;DR / key takeaway box at the top before the full text.

**Problem: No market snapshot in the briefing**
- The briefing has price data in its API response (`btc`, `eth`, `sol` prices + changes) but doesn't display them. This data is only shown in the Market column.

**Fix: Add a mini price strip at the top of the briefing**
- Show BTC/ETH/SOL as inline chips with % change right below the headline — this gives the briefing visual structure and data at a glance.

**Problem: Date/time display is minimal**
- "12 ก.พ." (12 Feb) is easily missed. No year, no day-of-week context.

**Fix: Richer temporal context**
- Show "Wednesday, February 12, 2026" or at minimum "Wed, 12 Feb" with the time.

---

#### 5. MARKET MOOD COLUMN

**Problem: Fear & Greed gauge arc is visually disconnected from its label**
- The gauge SVG, the "14" number, and "Extreme Fear" text are three separate visual elements that don't feel unified.

**Fix: Integrate them into one cohesive unit**
- Place the value ("14") inside the gauge arc center.
- Move "Extreme Fear" directly below the arc.
- Use color to reinforce the mood (red tint for fear, green for greed).

**Problem: Majors and Trending sections have no visual separation**
- They blend into one continuous list. The "TRENDING" label with its fire emoji is the only differentiator.

**Fix: Section dividers with personality**
- Add thin gradient dividers between sections.
- Consider a small sparkline chart next to each major (BTC, ETH) to show 24h trend direction — this is extremely high-value data density.

---

#### 6. MY POSTS COLUMN

**Problem: Empty state is uninspiring**
- "No posts yet" in tiny monospace text is a dead end. No CTA, no visual, no hint of what this column could look like.

**Fix: Engaging empty state**
- Add an illustration or icon (pen/quill + sparkle).
- CTA: "Create your first post" button linking to the content creation flow.
- Show example post preview as a ghost/skeleton to suggest what filled state looks like.

---

#### 7. MICRO-INTERACTIONS & MOTION

**Problem: Limited hover/interaction feedback**
- News cards have a basic bg-surface hover, but there's no hover state on market items, no transition on tag filters, and the theme toggle animation is functional but not delightful.

**Fix: Layered micro-interactions**
- Market coin rows: subtle glow on hover, price number momentarily scales up.
- Tag filter: active pill gets a subtle spring animation (slight overshoot on scale).
- Theme toggle: add a brief "sunburst" or "moonrise" burst animation on switch.
- News card: stagger a slight leftward shift + shadow on hover to create depth.

---

#### 8. DARK MODE SPECIFIC ISSUES

**Problem: Dark mode card borders are too subtle**
- `border-border/50` at `hsl(148 8% 22%)` on `hsl(148 12% 12%)` background = nearly invisible borders. Cards blend into each other.

**Fix: Increase border visibility in dark mode**
- Bump dark mode `--border` to `hsl(148 8% 28%)` or add a faint inner shadow.

**Problem: The paper texture overlay is too strong in dark mode**
- At `opacity: 0.04` it creates visible noise on dark surfaces.

**Fix: Reduce to `opacity: 0.02` in dark mode or disable entirely.

---

#### 9. TYPOGRAPHY REFINEMENTS

**Problem: Body text in the Briefing column lacks reading comfort**
- No paragraph indentation, tight line-height, and a large font size create a "textbook" feel rather than an editorial one.

**Fix:**
- `line-height: 1.75` (currently ~1.5) for the summary body text.
- Add first-line indent or drop cap for the first paragraph.
- Use `text-foreground/85` instead of full foreground to reduce glare on light backgrounds.

**Problem: Section headers ("LATEST INTEL", "MARKET MOOD") are all identical**
- Same font, size, weight, tracking. No visual hierarchy between major sections.

**Fix: Vary section header treatments**
- "LATEST INTEL" → Keep uppercase mono.
- "MORNING BRIEFING" → Large serif or heavy display.
- "MARKET MOOD" → Compact, geometric, with icon.
- This creates wayfinding through typography alone.

---

## Priority Action Items

### Phase 1 — Quick Wins (< 2 hours)
1. ☐ **Fix grid proportions** — Shift to `[minmax(0,1fr)_minmax(0,1.3fr)_minmax(240px,0.5fr)]` 3-col with My Posts stacked below Market
2. ☐ **Improve tag filter overflow** — Add horizontal scroll + gradient mask
3. ☐ **Enhance empty state** for My Posts — Icon + CTA button
4. ☐ **Increase dark mode border contrast** — Bump `--border` to `148 8% 26%`
5. ☐ **Add left accent border** on HIGH impact news cards

### Phase 2 — Polish (2-4 hours)
6. ☐ **Add source color indicators** to news cards
7. ☐ **Integrate price strip** at top of Morning Briefing
8. ☐ **Improve Fear & Greed gauge** — Value inside arc, colored by mood
9. ☐ **Add section dividers** with gradient lines in Market column
10. ☐ **Improve briefing typography** — line-height, paragraph spacing, inline highlights

### Phase 3 — Delight (4+ hours)
11. ☐ **Add sparkline charts** next to major coin prices
12. ☐ **Enhanced hover micro-interactions** across all interactive elements
13. ☐ **Theme toggle burst animation** (sunburst/moonrise)
14. ☐ **Collapsible My Posts sidebar** with smooth transition
15. ☐ **Wire up navigation tabs** to scroll-to-column behavior

---

## Design Principles to Maintain

1. **Editorial, not dashboard** — This is a newsroom, not a trading terminal. Lean toward magazine layouts over grid dashboards.
2. **Sage-green is the soul** — The palette is distinctive. Don't dilute it with too many accent colors.
3. **Data density with clarity** — Pack in information but give each piece enough breathing room.
4. **Motion with purpose** — Every animation should communicate state change or guide attention, not just "look cool".
5. **Typography does the heavy lifting** — In a text-heavy app, font choices and spacing matter more than colors or borders.
