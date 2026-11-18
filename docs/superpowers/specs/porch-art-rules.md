# Porch art rules

The binding rules for every sprite, scene and pixel-styled panel in the porch redesign. Read them before drawing. They were synthesised from Saint11 (Pedro Medeiros), Lospec and Slynyrd tutorials and from the ProkStudio pixel-art-fundamentals and game-UI skills, then adapted to this project.

## Grid and scale

1. There is one logical pixel grid. The scene is 320×180 (landscape) or 180×320 (portrait) scene pixels, drawn at an integer scale (`--px`). Sprites, in-scene text, panel borders and icons all use the same pixel size. Never scale a sprite by a non-integer factor, and never mix pixel densities.
2. Set `imageSmoothingEnabled = false` on every context, and `image-rendering: pixelated` on every scaled canvas.
3. Positions are whole scene pixels. Animated objects move in whole pixels; for slow motion, step less often rather than moving fractionally.

## Palette (`src/scene/palette.ts`)

4. Lock the palette first and draw only with named palette colours. Aim for about 40–56 colours in total, organised as ramps: sky, sea, sun/glow, wood, paper/cream, foliage, stone/metal, flame, skin/fur and UI accents.
5. Build ramps with hue shifting. Shadows shift toward purple and blue (the sunset's ambient light), and highlights shift toward warm yellow and orange (the sun's key light). Every step in a ramp also changes value clearly, so two neighbouring steps never read the same.
6. Light comes from the setting sun, low and to the right of the horizon. Faces turned toward the sun are warm and bright; faces turned away are cool purple. Keep this consistent across every object.

## Form

7. Silhouette first: each object must read as itself in a single flat colour at native size. Block in the big value masses before adding any texture.
8. Use outlines selectively. Objects get a dark outline drawn from their own darkest ramp step, never pure black. Interior lines use a step lighter than the outline. Where a light edge meets the sky, drop the outline and let the value contrast do the work.
9. Curves follow regular step patterns (for example 3-2-1-1-2-3). Remove jaggies, double-pixel bumps, banding (parallel staircases of colour) and pillow shading (shading that follows the outline instead of the light).
10. Anti-aliasing is sparse and deliberate: one intermediate pixel at a contour step where it smooths a curve. Never blur or apply soft edges.
11. Use clusters, not noise. Avoid stray single pixels unless they are intentional accents: a star, a glint, a spark.

## Texture and atmosphere

12. Dither only in gradients that need it: the sky bands, the sun glow, the water's horizon haze. Use ordered patterns (checker or 2×2) at band seams, and never animate dithering (it crawls).
13. Water: horizontal broken streaks in two or three sea tones, with a sun reflection column of short warm dashes that narrows toward the horizon. Animate by shifting streak phases every few frames, not by redrawing at random.
14. Wood: plank seams and grain run with the board, with knots as two- or three-pixel clusters. Use the warm highlight on sun-facing edges.
15. Atmospheric perspective: distant things (the island, the lighthouse, far waves) have lower contrast and shift toward the sky colour.

## Animation

16. Ambient motion runs at about 12 fps and is subtle: water shimmer, flame flicker, sun glow pulse, cat breathing, lantern flicker. Large forms move first; small details follow or stay still.
17. Anything drawable is still. Flames may flicker; the easel body never moves while it can be painted on.

## UI panels and text

18. Panels are painted wood (frames, signs) or paper (cards, notes) with a hard one-step pixel shadow, borders that are whole multiples of `--px`, and a 9-slice structure (corners, edges, fill). No rounded CSS corners or soft shadows.
19. Every control has distinct hover, focus, pressed and disabled states. The focus ring is a high-contrast pixel outline. Meaning never rests on colour alone: pair it with an icon, a label or a shape.
20. Text sits on solid paper or wood fills, never directly on busy scene art, and meets WCAG AA contrast. Use the pixel font at integer sizes only.
21. Hotspot labels look like small wooden tags or paper tickets: always readable, never covering the object they label.

## Review checklist (before reporting)

- Look at every screenshot at 100%. Does each object read as itself? Is any pixel uneven in size? Is there stray noise, banding or pillow shading?
- Do the colours all come from `palette.ts`? Is the light direction consistent?
- Is anything moving under the cursor while you draw?
