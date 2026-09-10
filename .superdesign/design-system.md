# StudyStudio UI Design System & Redesign Specification

## 1. Product Context & Goals

- **Product**: WSR Flash Card (Obsidian Flashcard Learning Plugin powered by FSRS algorithm).
- **Redesign Objective**: Complete overhaul of the plugin UI to address current dissatisfaction with outdated/flat look.
- **Core Aesthetic Direction**:
    - **Relatively Minimalist (not ultra-minimalist / not bare-bones)**: Clean, purposeful visual presentation without unnecessary ornamentation, yet visually rich enough with clear signifiers, micro-badges, and crisp icons.
    - **Relatively Compact**: High information density suitable for desktop and split-pane learning environments in Obsidian. Tight margins, well-scaled padding (4px–12px), compact headers, and space-efficient metadata badges.
    - **Rich Layering & Depth (层次感)**: Distinct elevation levels between background canvas, panels, and interactive cards. Use subtle multi-layered borders, delicate inner glows, semi-transparent frosted surfaces, and refined contrast to establish clear visual hierarchy.

## 2. Visual Foundation & Tokens

### Elevation & Surfaces

- **Canvas / Base Surface**: `var(--background-secondary)` or deep neutral tone (`#18191c` in dark mode, `#f6f7f9` in light mode).
- **Section / Container Panel**: Semi-elevated container with subtle 1px border (`rgba(255, 255, 255, 0.05)` in dark, `rgba(0, 0, 0, 0.05)` in light).
- **Interactive Card Surface**:
    - Background: Slightly brighter than canvas (`#202124` in dark, `#ffffff` in light).
    - Border: 1px subtle stroke (`rgba(255, 255, 255, 0.08)` in dark, `rgba(0, 0, 0, 0.08)` in light).
    - Shadow: Soft, refined drop shadow (`0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)`).
    - Hover: Subtle translateY(-1px) with border accent highlight and slightly elevated shadow (`0 6px 16px rgba(0, 0, 0, 0.1)`).

### Color Palette (Obsidian-Native Harmonized)

- **Primary Accent**: Obsidian Interactive Accent (`#7c3aed` / `#0891b2` / `#2563eb` dependent on theme).
- **Status / Review Intervals**:
    - Again (Red): `#ef4444` (Soft crimson)
    - Hard (Orange): `#f97316` (Warm amber)
    - Good (Blue): `#3b82f6` (Active azure)
    - Easy (Green): `#10b981` (Emerald green)
- **Text Levels**:
    - Primary text: High contrast (`var(--text-normal)`).
    - Secondary / Meta: Medium contrast (`var(--text-muted)`).
    - Muted / Faint: Low contrast (`var(--text-faint)`).

### Typography & Spacing

- **Font Stack**: System sans-serif / Obsidian font (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif`).
- **Scale**:
    - Display / Title: 18px / 16px, font-weight: 600
    - Section Header: 14px, font-weight: 600
    - Body Text: 13px, font-weight: 400
    - Caption / Badges: 11px, font-weight: 500
- **Compact Spacing Rhythm**: 4px, 8px, 12px, 16px. Avoid oversized empty gaps (>24px).

## 3. Key Pages & Layouts to Redesign

1. **Deck Home (卡组主面板)**:
    - Header with quick summary (Today Due total, streak count, search/filter, global actions: New Deck, Review All, Stats, Settings).
    - Deck Card Grid/List: Compact cards featuring deck title, breadcrumbs/tags, review count badges (New in Blue, Learning in Orange, Due in Green), and seamless hover action triggers.
2. **Card Review View (核心复习界面)**:
    - Floating centered review card with refined border & shadow.
    - Distinct divider between Front and Back (when revealed).
    - 4-Button rating group at bottom with clear time interval preview chips (e.g. "< 10m", "1d", "3d", "7d").
3. **Session Toolbar & Header**:
    - Slim top header (back button, progress bar, current card counter e.g. 12/45).
