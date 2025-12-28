# Design System Implementation Guide

This document explains how to use the design system in Mutter.

## Overview

The design system is based on **Dieter Rams' Ten Principles of Good Design** combined with **Ink & Switch Lab's** local-first, research-driven aesthetic. It emphasizes:

- **Honest, unobtrusive design** - Color only when needed
- **8px spacing system** - All spacing is multiples of 8px
- **IBM Plex typography** - Modern grotesque with humanist warmth
- **Dark mode first** - Default to #121212 background
- **Pacific Blue accent** - Used sparingly for critical states

## Typography

### Fonts
- **Primary**: IBM Plex Sans (300, 400, 500, 600, 700 weights)
- **Monospace**: IBM Plex Mono (400, 600 weights)

### Type Scale (1.250 Major Third Ratio)
```tsx
// Utility classes available:
<h1 className="text-h1">Heading 1</h1>      // 2.441rem, Bold
<h2 className="text-h2">Heading 2</h2>      // 1.953rem, SemiBold
<h3 className="text-h3">Heading 3</h3>      // 1.563rem, Medium
<p className="text-body">Body text</p>      // 1rem, Regular
<span className="text-caption">Caption</span> // 0.8rem, Light
<code className="text-mono">Code</code>     // IBM Plex Mono
```

### Text Opacity
```tsx
<p className="text-primary">Primary text</p>   // 90% opacity
<p className="text-secondary">Secondary</p>    // 70% opacity
<p className="text-disabled">Disabled</p>      // 50% opacity
```

## Colors

### Background & Surface
- **Background**: `bg-background` (#121212 dark / #FAFAFA light)
- **Surface**: `bg-surface` (#1E1E1E dark / #FFFFFF light)
- **Card**: `bg-card`

### Semantic Colors (Use Sparingly!)
- **Primary/Accent**: `text-primary bg-primary` - Pacific Blue (#00A0B4)
- **Success**: `text-success bg-success` - Lab Green (#00A868)
- **Warning**: `text-warning bg-warning` - Signal Yellow (#FFB800)
- **Error**: `text-destructive bg-destructive` - Deep Red (#D32F2F)

**Philosophy**: Color should be **absent until needed**. When it appears, it signals something critical (state change, sync conflict, recording active, user attention required).

## Spacing (8px Base Unit)

All spacing uses multiples of 8px:

```tsx
// Tailwind classes map to design system spacing:
p-1  = 8px   (var(--spacing-1))
p-2  = 16px  (var(--spacing-2))
p-3  = 24px  (var(--spacing-3))
p-4  = 32px  (var(--spacing-4))
p-6  = 48px  (var(--spacing-6))
p-8  = 64px  (var(--spacing-8))

// Special sizes:
w-32 = 256px  (Sidebar width)
w-48 = 384px  (Golden ratio sidebar)
w-96 = 768px
w-128 = 1024px (Max content width)
```

**Rule**: If something doesn't snap to the 8px grid, question whether it's necessary.

## Components

### Buttons

```tsx
// Default: Border-only (Rams style)
<button className="btn-rams">Action</button>

// Primary: Pacific Blue accent (use sparingly!)
<button className="btn-primary">Primary Action</button>
```

**Philosophy**:
- Default buttons are border-only with no fill
- Hover adds subtle 10% background
- Active state has slight inset (0.5px translateY) for tactile feel
- Focus ring is 2px Pacific Blue outline

### Cards & Surfaces

```tsx
<div className="surface-elevated p-4">
  Content with subtle border and elevation
</div>
```

### State Indicators

```tsx
// Only use color when state is meaningful!
<div className="state-recording">Recording...</div>  // Pacific Blue
<div className="state-success">Synced</div>         // Green
<div className="state-warning">Pending...</div>     // Yellow
<div className="state-error">Conflict!</div>        // Red
```

### Timeline Connectors

```tsx
// For chronological logs
<div className="timeline-connector">
  Daily log entry
</div>
```

### Tactile Feedback

```tsx
// Mechanical switch feel (subtle scale on hover/active)
<button className="tactile-hover">
  Interactive element
</button>
```

## Layout Patterns

### Mutter-Specific Layouts

#### Sidebar
```tsx
<aside className="w-32 bg-sidebar border-r border-sidebar-border">
  {/* 256px fixed width, chronological date list */}
</aside>
```

#### Main Canvas
```tsx
<main className="max-w-128 mx-auto p-6">
  {/* 1024px max width, centered, 24px vertical rhythm */}
</main>
```

#### Bottom Dock (Voice Controls)
```tsx
<footer className="fixed bottom-0 left-0 right-0 p-3 border-t border-border">
  <button className="btn-primary state-recording">
    {/* Pacific Blue border when recording */}
  </button>
</footer>
```

## Accessibility

- **Focus rings**: Always 2px Pacific Blue outline with 2px offset
- **Text contrast**: Meets WCAG AA standards
- **Keyboard navigation**: All interactive elements keyboard accessible

## Best Practices

### DO ✓
- Use color only for critical states (recording, conflicts, errors)
- Snap all spacing to 8px multiples
- Use border-only buttons by default
- Default to dark mode (#121212)
- Use IBM Plex Sans for UI, IBM Plex Mono for code/timestamps

### DON'T ✗
- Don't add color decoration "because it looks nice"
- Don't use arbitrary spacing values (must be multiples of 8px)
- Don't use filled buttons unless absolutely necessary
- Don't use more than 2-3 colors in a single view
- Don't mix font families beyond Sans + Mono

## Migration from Old Styles

If you're updating existing components:

1. Replace `font-sans` with IBM Plex Sans
2. Replace `font-mono` with IBM Plex Mono
3. Update spacing to 8px multiples (p-2, p-4, p-6, etc.)
4. Replace colored buttons with `btn-rams` or `btn-primary`
5. Use semantic state classes only where state is meaningful

## Example Component

```tsx
function DailyLog({ date, content }: { date: string; content: string }) {
  return (
    <article className="timeline-connector p-4 mb-4">
      {/* Date header: Large, bold, mono */}
      <time className="text-h2 text-mono block mb-3">
        {date}
      </time>

      {/* Body content: Regular weight, normal line height */}
      <div className="text-body prose">
        {content}
      </div>

      {/* Task count: Caption size, secondary opacity */}
      <footer className="text-caption text-secondary mt-3">
        3 tasks completed
      </footer>
    </article>
  );
}
```

## Resources

- [Design System Guide](/home/linuxdesktop/Notes/Sync/log/projects/design-system/design-system.md)
- [Dieter Rams: Ten Principles for Good Design](https://www.vitsoe.com/us/about/good-design)
- [Ink & Switch Research](https://www.inkandswitch.com/)
- [IBM Plex Typeface](https://www.ibm.com/plex/)

## Next Steps

To apply this design system to other apps in your suite:
1. Copy `/home/linuxdesktop/Code/mutter/src/styles/globals.css` to your app
2. Install `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`
3. Import the CSS in your app entry point
4. Use the same utility classes and component patterns
5. Maintain the same color philosophy (color = meaning, not decoration)
