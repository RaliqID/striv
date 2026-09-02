---
name: Striv Intelligence System
colors:
  surface: '#fdf8f8'
  surface-dim: '#ddd9d8'
  surface-bright: '#fdf8f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3f2'
  surface-container: '#f1edec'
  surface-container-high: '#ebe7e6'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#444748'
  inverse-surface: '#313030'
  inverse-on-surface: '#f4f0ef'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c1b1a'
  on-tertiary-container: '#868381'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#e6e1df'
  tertiary-fixed-dim: '#cac6c3'
  on-tertiary-fixed: '#1c1b1a'
  on-tertiary-fixed-variant: '#484645'
  background: '#fdf8f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  metric-display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  metric-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
  container-max: 1200px
---

## Brand & Style

The design system is rooted in **Minimalism** and **Precision**. It is engineered for a premium AI-powered fitness experience where data clarity is the highest priority. The aesthetic draws from high-end productivity tools, utilizing expansive whitespace, a restrained color palette, and rhythmic typography to create a sense of "visual confidence."

The UI should feel like a professional-grade instrument—calm, intelligent, and unobtrusive. It avoids the aggressive, high-energy tropes of traditional fitness apps in favor of a sophisticated "studio" feel. Motion and interaction should be functional and purposeful, reflecting the accuracy of the AI-driven insights.

## Colors

The palette is anchored by a deep charcoal primary and a surgical off-white background. In Light Mode, surfaces use subtle shifts in gray to define hierarchy rather than heavy shadows. In Dark Mode, the background recedes into pure black to maximize the legibility of high-contrast metrics.

- **Primary (#121212):** Used for typography, primary actions, and structural elements.
- **AI Insight (#8B5CF6):** A sophisticated violet used sparingly to denote intelligence-driven features and data analysis.
- **Success/Warning:** Muted, desaturated versions of emerald and amber are used for performance trends to maintain a professional, non-alarming tone.

## Typography

This design system utilizes **Inter** for its systematic clarity and **Geist** for technical, data-heavy labels. 

- **Numerical Precision:** All metric displays must use tabular figures (`tnum`) to ensure alignment in data-heavy views. 
- **Hierarchy:** High contrast in weight is preferred over high contrast in size for smaller labels.
- **Metric Display:** Used for primary workout data (e.g., Heart Rate, Weight). It should be the most prominent element on the screen during active sessions.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** with generous margins. Spacing is strictly based on a 4px baseline grid to ensure mathematical alignment across all components.

- **Whitespace:** Elements should be given significant room to "breathe." Content density should remain low to minimize cognitive load during physical activity.
- **Grid:** A 12-column grid is used for desktop, collapsing to 4 columns on mobile. 
- **Safe Zones:** High-interactivity elements (inputs, start buttons) must maintain a minimum 48px tap target and 24px clearance from screen edges.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Low-Contrast Outlines** rather than traditional shadows.

- **Light Mode:** Use `1px` solid borders in a soft gray (`#E5E5E5`) to define cards. On hover or interaction, transition to a subtle ambient shadow (4% opacity black).
- **Dark Mode:** Use subtle background tinting (e.g., `#1A1A1A` surfaces on a `#0A0A0A` background) to signify elevation.
- **Glassmorphism:** Reserved exclusively for persistent navigation bars and modal overlays to maintain context of the underlying data.

## Shapes

The design system uses a **Soft (0.25rem)** roundedness approach. This creates a balanced look that is modern and approachable while maintaining the "precise" and "professional" edge required for a premium intelligence platform. 

- **Primary Buttons:** Use `rounded-lg` (0.5rem) to distinguish them as actionable.
- **Data Cards:** Use `rounded-lg` (0.5rem) to containerize complex information clusters.
- **Input Fields:** Use standard `rounded` (0.25rem) for a crisp, technical appearance.

## Components

### Buttons
Primary buttons are high-contrast (Black in light mode, White in dark mode) with no gradients. Secondary buttons use ghost styling with a 1px border.

### Minimalist Cards
Cards feature no visible shadows in their resting state; they are defined by a 1px border. Padding inside cards is generous (24px default) to emphasize the "Whitespace as a first-class citizen" principle.

### Precision Inputs
Designed for use in the gym. Steppers (plus/minus) must have large tap targets. Input fields should auto-focus and use numeric keyboards by default.

### Data-Driven Charts
Charts use thin stroke weights (1.5px) for lines. Fill gradients under lines should be minimal (max 10% opacity). Use the `accent_ai` violet for AI-predicted trends vs. the `primary` color for historical data.

### AI Indicators
AI insights are marked by a subtle "Glow" or a small 4px violet dot icon. Avoid robotic or mascot-based imagery. The intelligence is represented through superior data presentation and refined typography.