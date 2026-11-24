# Dark Mode UI Patterns - Extraction for Charly's Corner Store

**Source:** Muzli "60+ Best Dark mode screen 2026 UI/UX Inspiration"  
**Extracted:** May 17, 2026

---

## Typography System

| Element | Font | Weight | Usage |
|---------|------|--------|-------|
| Primary UI | Poppins | 300-600 | All interface text |
| Accent/Display | Instrument Serif | 400 | Special headings, quotes |
| Monospace | SF Mono | 400 | Code, prices, data |

### Scale Pattern
- **Light (300)** - Subtle captions, metadata
- **Regular (400)** - Body text, descriptions  
- **Medium (500)** - Navigation, labels
- **Semibold (600)** - Headings, CTAs, prices

---

## Dark Mode Color Palette

### Base Colors
```
Background Primary:    #0a0a0f    (deepest black)
Background Secondary:  #12121a    (elevated surfaces)
Card/Surface:          rgba(28, 26, 22, 0.82)  (glass effect)
Border Subtle:         #2a2a35    (dividers)
Border Strong:         #3a3a45    (active borders)
```

### Text Hierarchy
```
Primary:      #f5f1e8    (warm white)
Secondary:    #aaa39a    (muted beige)
Muted:        #6b6560    (dimmed)
Accent:       #d8a657    (golden highlight)
```

### Neon Accent Colors
```
Hot Pink:        #ff00ff    #ff0080    #ff1493
Electric Cyan:   #00ffff
Electric Blue:   #0080ff
Acid Green:      #39ff14
Neon Purple:     #bf00ff
Neon Orange:     #ff6600    #ff6b35
Neon Yellow:     #ffff00
```

---

## Miami Vice / Synthwave Specific

### Signature Colors
```
Midnight Blue:    #0a0a1a
Deep Purple:      #1a0a2e
Sunset Pink:      #ff6b6b → #ff0080
Ocean Cyan:       #00ffff
Chrome Silver:    #c0c0c0
Grid Lines:       rgba(255,0,255,0.15)
```

### Gradient Patterns
```css
/* Sunset Fade */
linear-gradient(135deg, #ff0080 0%, #ff6b35 50%, #bf00ff 100%)

/* Cyber Horizon */
linear-gradient(90deg, #00ffff, #ff00ff)

/* Chrome Metallic */
linear-gradient(180deg, #e0e0e0 0%, #a0a0a0 50%, #e0e0e0 100%)

/* Neon Glow Background */
radial-gradient(circle at 50% 50%, rgba(255,0,255,0.2) 0%, transparent 70%)
```

---

## Spacing System (Tailwind-based)

| Token | Value | Usage |
|-------|-------|-------|
| xs | 0.25rem (4px) | Tight gaps |
| sm | 0.5rem (8px) | Related elements |
| md | 1rem (16px) | Standard padding |
| lg | 1.5rem (24px) | Card padding |
| xl | 2rem (32px) | Section elements |
| 2xl | 3rem (48px) | Major sections |
| 3xl | 4rem (64px) | Large gaps |
| 4xl | 5rem (80px) | Section breaks |
| 5xl | 6rem (96px) | Hero spacing |
| 6xl | 8rem (128px) | Page sections |

---

## Layout Patterns

### Grid Systems
```
1. Responsive Auto-Fit
   grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))
   → Product galleries, card layouts

2. Sidebar Layout
   grid-template-columns: 1fr 300px
   → Product detail with filter sidebar

3. Masonry Dense
   grid-auto-flow: row dense
   → Inspiration boards, galleries

4. Three-Column Centered
   grid-template-columns: 30px 1fr 30px
   → Focused content with side accents
```

### Container Widths
```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

---

## Component Patterns

### Cards (Glass Morphism)
```css
.card {
  background: rgba(28, 26, 22, 0.82);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.75rem;
  transition: box-shadow 0.3s ease;
}

.card:hover {
  box-shadow: 0 0 20px rgba(255,0,255,0.3),
              0 0 40px rgba(0,255,255,0.2);
}
```

### Neon Buttons
```css
.btn-primary {
  background: linear-gradient(90deg, #ff00ff, #00ffff);
  border: none;
  border-radius: 9999px;
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  color: #0a0a0f;
  text-shadow: none;
  box-shadow: 0 0 15px rgba(255,0,255,0.5);
}

.btn-primary:hover {
  box-shadow: 0 0 30px rgba(255,0,255,0.8),
              0 0 60px rgba(0,255,255,0.4);
  transform: translateY(-2px);
}
```

### Navigation (Sticky + Blur)
```css
.nav-sticky {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(10,10,15,0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
```

---

## Effects & Animations

### Neon Glows
```css
/* Text Glow */
text-shadow: 0 0 10px currentColor,
             0 0 20px currentColor,
             0 0 40px currentColor;

/* Box Glow */
box-shadow: 0 0 20px var(--neon-color),
            0 0 40px var(--neon-color),
            inset 0 0 20px rgba(255,255,255,0.1);

/* Drop Shadow Glow */
filter: drop-shadow(0 0 8px rgba(255,0,255,0.8));
```

### Transitions
```
Fast:   150ms ease  → micro-interactions
Normal: 300ms ease  → standard transitions
Slow:   500ms ease  → page transitions
```

---

## Recommendations for Charly's Corner Store

### Color Application
| Element | Recommended Style |
|---------|-------------------|
| Page Background | #0a0a0f with subtle gradient |
| Header | Sticky glass-morphism with neon border-bottom |
| Product Cards | Dark glass (#12121a) with neon glow on hover |
| Primary CTA | Hot pink (#ff0080) gradient pill button |
| Secondary CTA | Cyan outline with glow on hover |
| Prices | Neon yellow (#ffff00) or acid green |
| Text | Warm white (#f5f1e8) primary, muted beige secondary |

### Layout Structure
1. **Header** - Logo left, nav center (with neon underline active state), cart icon right
2. **Hero** - Full-width, centered gradient text headline, subtle retro grid background
3. **Products** - Auto-fit grid (300px min), glass cards with neon border hover
4. **Filters** - Collapsible sidebar with glass effect
5. **Footer** - Dark with neon accent links, palm tree silhouette optional

### Key Visual Motifs
- Retro perspective grid floor (subtle)
- Chrome/metallic text for headlines
- Neon outline text for special offers
- Palm tree silhouettes (brand-appropriate)
- Sunset gradient backgrounds for featured sections
