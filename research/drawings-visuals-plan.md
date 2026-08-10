# ChartLab — drawings visuals & hitbox upgrade plan

Status: hitbox fixes DONE (see below); visual upgrades prioritized P0→P2.
Basis: TradingView help-center research in tv-annotations.md (official defaults are mostly
UNVERIFIED hex-wise; where TV is silent the plan uses TV's standard palette:
blue #2962FF lines, green #089981 up, red #F23645 down, amber #ff9800/#ffcf6e notes).

## DONE (this session)
- Click vs drag: clicking a drawing now SELECTS it; only a real drag (>3px) moves it —
  nothing "flies around" from a plain click anymore (was: every pointerdown armed a drag).
- Hitboxes are now pixel-accurate to what is drawn:
  - note/text: measured text-size box (was hardcoded 160×60 / 90×24 — up to ~120px dead
    space to the right and ~44px above a 1-line note; part of multi-line notes was unreachable)
  - callout: bubble box + tail triangle (was one fixed box; bubble's left edge & tail missed)
  - pricelabel: measured mono label box (was fixed 90×24)
  - note/text/callout/pr label all share `boxMetrics()` with the renderers → can't drift again
- Hitboxes are now VISIBLE on hover (cross cursor): the exact grab area glows (faint blue
  fill + outline; lines get a wide translucent stroke) and the cursor becomes a grab hand.
- Escape now also cancels an armed/active drag; off-canvas release can't leave a stale drag.

## P0 — quick wins (small diffs, big feel)
1. Default palette → TV: model.ts lineTool defaults `#4c8dff` → `#2962FF` (trendline/ray/
   extended/arrow/trendangle/regression/crossline/gann*/pitchfork), hline/hray `#e4574f` →
   `#f23645`-family red, arrows keep blue, note bg `#ffcf6e` (TV yellow sticky), callout bg
   `#1c2431` keep (dark bubble), elliott `#35c4e8` → `#2962FF`.
2. Selection handles → TV style: 5.5px dots, white inner ring + colored outer ring (currently
   flat dark discs); draw a faint outline of the selected drawing's bounds (reuse paintHitArea
   at lower alpha) so the selected object reads instantly.
3. Note anchor affordance: draw a 1px connector/tail from the note body to the anchor price
   point + 3px dot at the anchor (TV note is visibly "linked to the price level").
4. Arrow visual pass: arrowhead length proportional to width (already), add optional price
   tag at the tip when showPrice on (uses existing priceTag()), and settings option for
   heads: `none | end | both` (TV has per-end arrowhead control).
5. Elliott wave: replace vertex-filled-circle labels with TV-style labels beside each segment:
   draw "1".."5" at 60% along each leg, offset 10px above/left of the line in amber mono,
   keep small vertex dots; label color/size follows settings (showLabels toggle already exists).
6. Dashes: TV dotted = [2,4] heavy dots (already), dashed [6,5] (already); make dashed lines
   use round caps so dashes look clean.

## P1 — medium
7. Per-drawing opacity setting (alpha slider in settings dialog; TV exposes opacity per
   element: line, fill, text) — requires Drawing.settings.alpha + setLine/text alpha support.
8. Price-tag chip styling: mono 10px, rounded chip, tag hides while selected-handle-dragging
   (small polish; priceTag() exists).
9. Ghost preview improvement: when a multi-click tool is mid-flow, show the ghost at full
   alpha but with "pending" markers on anchors (small outline circles) — clearer than 0.55 alpha.
10. Box-type drawings (rect/ellipse/circle/triangle/channel fill) get optional fill opacity
    slider in settings (fill already exists for shapes) — align slider range to 0..0.5.
11. Labels on line tools (showPrice): position option (start/end/center) for arrow/trendline
    text, mirroring TV's text-alignment dropdown.

## P2 — later (P3 tools + system)
12. Flag mark & Pin graphics when P3 lands: flag = blue pennant with pole tip at anchor
    (TV: blue, fixed size), pin = price-linked marker with tail (rename: old TV "Note").
13. Callout 2-anchor mode like TV: point 1 = tail tip on price, point 2 = bubble position
    (currently 1-click with auto-stacked tail).
14. Pattern tools (XABCD etc.): TV label letters above vertex dots, dashed pattern lines,
    per-leg colors; Elliott triangle/combo variants from tv-annotations.md labelsets.
15. Full settings-dialog parity: per-tool schema already close; add Visibility (per-timeframe)
    like TV — needs tf-flag storage.
16. Verify pass: eyeball screenshot diff chart→TV for each tool once visuals settle.

## Notes
- TV official sources never publish exact hex values; palette above = TV standard UI palette
  (also used by Lightweight Charts docs), treat as approximation until screenshot-verified.
- Keep hitTest ↔ paintHitArea ↔ draw* sharing one geometry source (boxMetrics/pathSegments);
  any new visual must extend all three, not add ad-hoc boxes.
