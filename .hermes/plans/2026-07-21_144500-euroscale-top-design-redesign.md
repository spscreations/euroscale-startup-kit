# EuroScale Top-Design Redesign

> **Goal:** Refactor EuroScale's landing page and dashboard to 10/10 Awwwards-level digital experience.
>
> **Architecture:** Two independent workstreams — (1) Landing page as a standalone static HTML file, (2) Dashboard as a Next.js app with Tailwind v4 + shadcn/ui. Both share the same brand system.
>
> **Tech Stack:** HTML/CSS/vanilla JS for landing (no framework). Next.js 16 + Tailwind v4 + shadcn/ui + Lenis for dashboard. Premium fonts via Google Fonts (Space Grotesk + Instrument Serif).

---

## Concept Phase (from top-design skill process)

```
BRAND ESSENCE: "Sovereign" — European data independence, trust, authority
VISUAL TENSION: Monumental typography vs intimate micro-details / Cold infrastructure vs warm human craft
SIGNATURE MOMENT: The hero — a viewport-filling "euroscale" wordmark in 180px Instrument Serif italic, with a glowing European data-center map beneath, then the CLI code window scrolls up into view
TECHNICAL AMBITION: Smooth 60fps scroll narrative with clip-path reveals, viewport-filling type, and zero layout shift
```

### Current Score (rubric)

- **Typography:** 5/10 (Inter is competent but not premium)
- **Composition:** 7/10 (good glass cards, code window, but safe grid)
- **Motion:** 3/10 (basic fade-in, some shimmer — no custom easing, no scroll narrative)
- **Color:** 6/10 (navy+purple works but uses pure #000/#fff, generic AI-gradient hero)
- **Details:** 4/10 (no branded selection, basic hover states, no focus states)
- **Total:** (5×0.25)+(7×0.25)+(3×0.20)+(6×0.15)+(4×0.15) = **5.15/10** → "Competent"

### Target Score After Redesign

- Typography: 9/10 (premium typefaces, dramatic scale, variable font hover)
- Composition: 8/10 (asymmetric, intentional grid breaks, breathing room)
- Motion: 9/10 (custom easing, choreographed scroll, pinned sections)
- Color: 8/10 (warm variants, contextual shifts, functional hierarchy)
- Details: 8/10 (branded selection, magnetic buttons, focus states, micro-details)
- **Target Total: ~8.5/10** → "Exceptional"

---

## Task 1: Landing Page — Hero & Typography

**Files:**
- Rewrite: `/home/spyros/Desktop/euroscale-landing-pro.html` (entire file)

**Design decisions:**
- Replace Inter → **Space Grotesk** (display, weights 300-700) + **Instrument Serif** (hero/accents, italic)
- Viewport-filling hero wordmark "euroscale" in 180px Instrument Serif italic, negative tracking -0.03em
- Staggered page-load choreography (top-design timing):
  - Structure (0-200ms): nav, background
  - Hero word (200-600ms): "euroscale" fades up word-by-word
  - Subtitle (400-800ms): "The European PlanetScale Alternative"
  - CTA buttons + code window (600-900ms)
- Custom easing: `cubic-bezier(0.16, 1, 0.3, 1)` — expo out
- Variable font weight animation on nav hover (Space Grotesk weight shift)
- Control every line break on hero headline
- Minimum 10:1 display-to-body scale ratio
- Body text: 16px / line-height 1.6 / measure 45-75 chars

**Verification:** Open in browser, check hero loads in sequence, font renders correctly, no CLS.

---

## Task 2: Landing Page — Scroll Story & Composition

**Files:**
- Modify: `/home/spyros/Desktop/euroscale-landing-pro.html`

**Design decisions:**
- Add **Lenis** smooth scroll via CDN
- Composition principles:
  - Asymmetric hero: wordmark left-aligned at 33%, code window right at 66% with bleed
  - Stats bar: full-width glass card offset vertically -24px over hero section
  - Feature sections alternate: full-width → contained → offset
  - Intentional grid breaks: images/code windows bleed right by -5vw
  - Vary density: dense feature cards with tight spacing, then full-width breathing sections
- Scroll reveals:
  - Sections enter via `clip-path: inset(0 0 100% 0)` → `inset(0 0 0 0)` over 1s with expo-out
  - Stagger children within sections (cards reveal left-to-right or top-to-bottom)
  - Stats bar: counter animation when scrolled into view
  - Parallax on decorative glow elements only (never on text)
- Pinned storytelling section: pin a section while content transforms within (features explanation)
- Markets/closing CTA: horizontal scroll gallery for case studies

**Import Lenis via:** `<script src="https://unpkg.com/lenis@1.1.18/dist/lenis.min.js"></script>`

**Verification:** Scroll through entire landing — smooth scroll, reveals trigger on enter, no jank, 60fps.

---

## Task 3: Landing Page — Color, Atmosphere & Micro-details

**Files:**
- Modify: `/home/spyros/Desktop/euroscale-landing-pro.html`

**Design decisions:**
- Replace pure black `#070b1a` → `#080912` (warm navy)
- Replace pure white `#ffffff` → `#f7f5f0` (warm off-white for text on dark)
- Replace current purple/cyan "AI gradient" → monochromatic tension:
  - 95% navy family + 5% accent (indigo `#6366f1` spark)
  - Signature accent: `#818cf8` (indigo-400) — used only on CTAs, links, one detail
  - Contextual section shifts: alternating `#080912` → `#0b0f1a` → `#080912`
- Functional color hierarchy:
  - `--color-text-primary: #e8e6e1` (warm off-white)
  - `--color-text-secondary: rgba(232,230,225,0.6)`
  - `--color-text-tertiary: rgba(232,230,225,0.35)`
  - `--color-surface: #0e1118`
  - `--color-border: rgba(99,102,241,0.08)`
  - `--color-accent: #818cf8`
- Branded `::selection` — background: `#818cf8` at 30%, color: inherit
- Focus states: 2px `#818cf8` outline with 2px offset
- Magnetic buttons: on hover, button subtly follows cursor (JS-powered)
- Loading state for images: `aspect-ratio` containers with skeleton pulse
- All hover transforms use `transform` + `opacity` only (GPU)
- `text-wrap: balance` on headlines
- No orphans on headings
- Smart quotes throughout

**Verification:** Check page in dark mode only (no light mode — dev-tool aesthetic). Test keyboard navigation for visible focus rings.

---

## Task 4: Dashboard — Design System Refresh

**Files:**
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/app/globals.css`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/app/layout.tsx`

**Design decisions:**
- Import Space Grotesk (headings/display) alongside Inter (body) in layout
- Update `@theme inline` in globals.css:
  - Add `--font-display: "Space Grotesk", sans-serif`
  - Update color tokens to match landing:
    - `--color-background: 240 6% 5%` → `#0c0c0e`
    - `--color-foreground: 40 10% 92%` → `#ebe8e0`
    - `--color-card: 240 4% 8%` → `#141417`
    - `--color-primary: 239 84% 67%` → keep `#6366f1` as accent
    - Add warm variants instead of cold tints
  - Custom easing token: `--ease-expo-out: cubic-bezier(0.16, 1, 0.3, 1)`
  - Custom animate tokens:
    - `--animate-choreographed-enter: choreographed-enter 0.8s var(--ease-expo-out) both`
- Add `@keyframes choreographed-enter` (translateY 12px + opacity 0→1)
- Add `@keyframes scale-in` (transform: scale(0.95) → scale(1) + opacity 0→1)
- Branded `::selection` — `#818cf8` at 30%
- Custom scrollbar thinner, with accent thumb color on hover
- Skeleton pulse: use `var(--ease-expo-out)` for smoother perceived motion

**Verification:** `cd dashboard && npm run dev` — check dashboard loads new font, tokens applied correctly.

---

## Task 5: Dashboard — Layout, Sidebar & Navigation

**Files:**
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/app/dashboard/layout.tsx`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/Sidebar.tsx`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/app/dashboard/page.tsx`

**Design decisions:**
- Sidebar:
  - Logo area: larger (40x40), subtle pulse animation on load
  - Nav items: stagger reveal on page enter (each item +50ms delay)
  - Active state: left border accent instead of background fill, or subtle gradient background
  - Hover: subtle scale 1.02 + brightness shift
  - Bottom user section: avatar gets subtle glow on hover
- Dashboard layout:
  - Top bar: reduced height (h-10), smaller text, tighter
  - Main content: max-w-7xl mx-auto for breathing room
  - Asymmetric card grid: first card larger (2 cols), remaining in 2-col grid
  - Stats cards: staggered entrance animation (card 1: 0ms, card 2: 100ms, card 3: 200ms, card 4: 300ms)
- Mobile bottom nav:
  - Active indicator: small top dot/border instead of text color change only
  - Tap: subtle scale bounce via `transition: transform 0.15s var(--ease-expo-out)`

**Verification:** Navigate dashboard pages — sidebar animates in, nav items highlight correctly, mobile bottom nav functional.

---

## Task 6: Dashboard — Motion, States & Polish

**Files:**
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/app/dashboard/page.tsx`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/DatabaseCard.tsx`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/StatsCards.tsx`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/TierCard.tsx`
- Modify: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/CreateDBForm.tsx`
- Check: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/BranchManager.tsx`
- Check: `/home/spyros/Desktop/euroscale_startup_kit/dashboard/src/components/ConnectionInfo.tsx`

**Design decisions:**
- Page content reveal:
  - TierCard fades up first (0ms)
  - StatsCards stagger (150ms, 250ms, 300ms, 350ms)
  - Database cards stagger in grid order (each +50ms)
  - Use IntersectionObserver with the choreographed-enter animation
- Database cards:
  - Hover: subtle scale 1.02 + border accent glow + shadow lift
  - Delete: scale-out animation before DOM removal
  - Status badge: pulse animation for "creating", "ready" is steady
- Dialogs (create, delete):
  - Overlay: fade in 200ms expo-out
  - Dialog content: scale-in + fade up over 300ms expo-out
- Empty state:
  - Subtle floating animation on the Database icon SVG
  - CTA button: magnetic hover (follow cursor)
- Error state:
  - Gentle shake animation on icon
  - Retry button: pulse attention-grabber on first render, stops after 2s
- Magentic buttons:
  - Small JS on CTA buttons: on mousemove, button subtly translates towards cursor (max 3px)
  - On mouseleave, spring back with easing
- Loading skeletons:
  - Use the `--animate-choreographed-enter` with staggered delays
  - Pulse via opacity with expo easing (smoother than linear pulse)
- `text-wrap: balance` on all section headers
- No orphans in card titles
- `::selection` color applied globally

**Verification:** Full e2e flow — login, create database, view list, delete. All animations play smoothly. No layout shift. Keyboard navigation works with visible focus rings.

---

## Dependencies

```
Task 1 (Hero & Type) → Task 2 (Scroll & Composition) → Task 3 (Color, Micro-details)
Task 4 (Design System) → Task 5 (Layout) → Task 6 (Motion & Polish)
```

Tasks 1-3 are the landing workstream, 4-6 are the dashboard workstream. They share the same brand decisions (typeface, colors) but are file-independent. Run Task 1 + Task 4 in parallel as they set the foundation for each workstream.

---

## Risks & Open Questions

- Lenis CDN may conflict with any existing scroll handlers — test on load
- Space Grotesk + Instrument Serif from Google Fonts: check subset loading for perf
- Magnetic buttons on dashboard: keep minimal to not overload the dev-tool aesthetic
- The existing landing is 2158 lines in a single file — careful with large replacements
- Dashboard is a real app with react-query, auth, dialogs — motion must not interfere with state transitions
