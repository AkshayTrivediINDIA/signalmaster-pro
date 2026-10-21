# Design system

The interface is built for sustained technical use, not for a landing page. The rules below are what keep it
consistent; deviate only with a reason.

## 1. Principles

1. **Data first.** Chrome is quiet: hairline borders, no large shadows, no decorative gradients, no marketing
   copy inside the application shell. Colour is reserved for state (ok / warn / error) and for series identity.
2. **Density over airiness.** This is a tool with many inputs and tables; rows are compact (28–34 px), the base
   type size is 13.5 px, and the working area is capped at 1440 px.
3. **One accent.** A single steel-blue accent marks interactive elements and selection. Charts use a separate,
   muted categorical palette so charts never read as "more UI".
4. **Everything is legible in both themes.** Tokens are duplicated per theme; there is no `dark:` variant
   sprinkled through components for colour (only for rare structural tweaks).
5. **Numbers are machine-like.** Tabular figures everywhere numbers update; the mono face is used for values,
   indexes and units, never for prose.

## 2. Colour tokens

Defined as RGB triplets in `src/styles/index.css` and mapped to Tailwind colours in `tailwind.config.js`
(`bg`, `surface`, `surface2`, `line`, `line-strong`, `ink`, `muted`, `brand`, `brand-soft`, `brand-ink`,
`ok`, `warn`, `err`).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#F4F5F7` | `#0D0F13` | Application canvas |
| `surface` | `#FFFFFF` | `#15181E` | Cards, sidebar, header, inputs |
| `surface2` | `#F3F4F6` | `#1B1F27` | Table heads, inset fields, hover |
| `line` | `#DFE2E6` | `#2A2F39` | Hairline borders (1 px, the default) |
| `line-strong` | `#CBD0D7` | `#3A414E` | Hover borders, scrollbars |
| `ink` | `#16191F` | `#E2E5EA` | Primary text |
| `muted` | `#606772` | `#949CA8` | Labels, secondary text, axes |
| `brand` | `#1D4E89` | `#7AA3D6` | Primary action, selection, focus ring |
| `brand-soft` | `#EAEFF6` | `#1E2939` | Selected row fill |
| `ok` / `warn` / `err` | `#157A54` / `#9E5A08` / `#B2261C` | `#4ABE8C` / `#D69E4A` / `#E27A70` | State only |

**Chart palette** (`src/components/plot/Plot.tsx`): `#1D4E89`, `#B45309`, `#0F766E`, `#6D28D9`, `#9F1239`,
`#0369A1`, `#4D7C0F` — evenly spaced hues, distinguishable in both themes and when printed in greyscale.
Colour is assigned **per series**, not per trace, so a stem's line and marker always match.

## 3. Typography

- **UI / prose:** Inter Variable (self-hosted, `src/assets/fonts`, SIL OFL). Base 13.5 px / 1.5.
- **Numeric / code:** JetBrains Mono Variable (self-hosted, SIL OFL), 11–12 px, `tabular-nums`.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Page title | 17 px | 600 | One per route, in `PageHeader` |
| Card title | 12.5 px | 600 | With optional 11 px muted subtitle |
| Eyebrow / section label | 10 px | 600 | Uppercase, `letter-spacing: 0.075em` |
| Body | 13.5 px | 400 | |
| Field label | 11 px | 500 | Muted |
| Hint / footnote | 10.5 px | 400 | Muted |
| Table header | 10.5 px | 600 | **Not** uppercased (headers carry units like `t (s)`) |
| Table cell | 11.5 px mono | 400 | |
| Metric value | 15 px mono | 500 | Boxed readouts use 13 px |

Headings have a very slight negative tracking (`-0.006em`); nothing else is tracked except eyebrows.

## 4. Geometry

- Radii: cards `6px`, controls `4px`, chips/kbd/switch `3px`. Nothing is a full pill except status dots.
- Borders: 1 px `line`. Shadows: `card` is a 1 px ambient hint; `pop` is used only for overlays.
- Spacing: 2 px steps inside controls, 8–14 px between groups, 3–4 px between stacked cards.
- Control height: 28–30 px (`btn`, `input`), 24 px for `btn-sm`.

## 5. Components

| Component | Rules |
| --- | --- |
| `Button` | `btn-primary` solid brand (one per view region), `btn-secondary` white with hairline, `btn-ghost` for icon-adjacent actions, `btn-icon` 28 px square. Never more than one primary in a card header. |
| `Field` | Label above, control, hint or error below. Errors are text + `aria-invalid` + red border, never a toast alone. Units are rendered inside the input's right edge, not in the label. |
| `Card` | Optional header strip with a 14 px muted icon, title, subtitle and right-aligned actions. Body padding 14–16 px. Cards are containers, not decoration — no nested cards. |
| `Metric` | Boxed inside panels (9.5 px uppercase label, 13 px mono value); `variant="plain"` when the caller supplies the frame (dashboard status strip). |
| `DataTable` | Sticky 10.5 px header on `surface2`, 11.5 px mono cells, right-aligned numerics, hover tint `brand/3.5%`. |
| `Notes` | `note` / `note-warn` / `note-err` / `note-ok` — 4 px radius, tinted border and 7 % fill of the state colour. |
| `summary` (details) | Native disclosure with the platform marker replaced by a quiet chevron; used for secondary detail ("Data description", "Method & assumptions"). |
| Lists that act as pickers | Left accent bar (`2px`) on the selected row instead of a filled rounded card. Used by learning topics, calculator presets, quick-start rows. |

## 6. Motion

150 ms colour/opacity transitions on interactive elements, 200 ms on the sidebar width/transform, one 180 ms
fade-in for overlays and toasts. No animation on data — a chart update is not celebrated. All motion is
disabled by the browser's reduced-motion setting where it matters (transitions are colour-only).

## 7. Accessibility

- Focus: 2 px solid `brand` with 1 px offset, visible on every interactive element.
- Contrast: body text and labels meet WCAG AA against their surfaces in both themes (muted text is
  `#606772` on white = 5.6:1; dark muted on `#15181E` = 6.1:1). State colours are never the only signal —
  they are always paired with an icon or text.
- Charts expose `aria-label` plus a text summary of what the trace shows.
- Hit targets: 28 px minimum in dense panels, 36 px in the top bar and on mobile.

## 8. Extending

Add a token to both themes in `index.css` and to `tailwind.config.js` before using it inline. If a component
needs a new visual pattern, add a class in the `@layer components` block rather than repeating utilities in
JSX; the existing classes (`card`, `btn*`, `input`, `table`, `note*`, `nav-link`, `seg`, `eyebrow`) are the
intended vocabulary.
