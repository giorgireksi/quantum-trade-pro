# TradingView visual spec → ChartLab implementation map

Sources: official TV help-center articles (research/raw/*.html), pixel analysis of official
screenshots (research/imgs/*.png, 2x DPR), tv-annotations.md report. TV publishes almost no
exact hex values; where silent, ChartLab uses TV's standard palette:
**#2962FF** (blue lines) · **#089981** (green) · **#F23645** (red) · **#FF9800** (orange).

## Palette (applied everywhere)
- All line tools default `#2962FF` (was #4c8dff): trendline, ray, extended, hline/hray,
  channel, fib, rect, ellipse, circle, triangle, polyline, brush, crossline, trendangle,
  regression, pitchfork/schiff, gannfan/gannbox, arrow, pricelabel, elliott.
- Down red `#F23645` (was #e4574f), up green `#2ebd85` kept (TV-adjacent).
- Note sticky `#ffcf6e` (TV yellow note), pin dot `#f7c948`; callout bubble `#1c2431` on dark.

## Gann fan (TV parity, 2 clicks)
- Click 1 = pivot (all lines emanate here). Click 2 = the **8/8 line**; lines 1/8..8/8 are
  k/8 of the P1→P2 slope (pixel-verified on the official screenshot: observed slopes 0.087 /
  0.164 / 0.253 / 0.421 fit k/8 with 8/8 ≈ 0.67; P2 rides the steepest line).
- Per-line default colors (light-theme screenshot measurement → TV palette):
  1/8 #f23645 · 2/8 #9c27b0 · 3/8 #2962ff · 4/8 #00bcd4 · 5/8 #089981 · 6/8 #ff9800 ·
  7/8 #26a69a · 8/8 #4caf50. "Use one color" switches all to the base color.
- Labels toggle: "1/8".."8/8" marking text at each line's right end, in line color.
- Background toggle + opacity: soft wedge between 1/8 and 8/8.
- Lines extend edge-to-edge (indefinitely, like TV).

## Gann box (TV parity, 2 clicks = two corners, data-space rect)
- 8 price levels + 8 time levels (7 internal lines each), per-line color cycle (same fan
  palette, reversed on the time axis for the "reverse" mirror).
- Labels on left + bottom edges: "1/8".."7/8" in level color.
- Angles = corner rays from the left corners through each grid column (mirrored with Reverse;
  default off — matches the subdued official screenshot).
- Background fill + opacity; "Use one color" for everything.

## Regression trend
- Linear regression of closes between anchors; extend right dashed preview default on.
- Std-dev channel slider 0–3 (default 1): ±kσ parallel dashed lines.
- "R value" toggle (default on): Pearson R chip near the right end.

## Arrow
- Arrowhead: default **end**; options end / both / none (TV per-end controls).
- Price tag at tip when enabled; "Always show stats" chip: price Δ (+%), bars, angle°.

## Callout (TV parity, 2 clicks)
- Click 1 = tail tip; click 2 = bubble position. Bubble = rounded rect + tail triangle to
  the tip. Text typed after both points. (Legacy 1-anchor callouts still render.)

## Note
- Yellow sticky offset right/up of the anchor; tail triangle + pin dot at the price anchor
  ("linked to the price level" per TV).

## Flat top / bottom
- Horizontal level, start bracket tick + "flat top"/"flat bottom" chip in line color.

## Pitchfork / Schiff
- Central TV blue; optional channel fill between the outer lines (right-extended).
- Standard: median P1→mid(P2,P3) + parallels through P2/P3. Schiff: median P2→mid(P1,P3)
  (StockCharts/TV convention).

## Polyline / Brush
- Polyline: click-to-add, Enter/dblclick/`close`-click finish; clicking the first point
  closes the shape (TV) + fill opacity option.
- Brush: round freehand + optional background fill opacity (TV "Background" toggle).

## Elliott
- TV blue; small vertex dots; wave labels 1..5 rendered beside each leg (colored, dark halo).

## Selection handles (TV style)
- White disc + colored ring (color = drawing color), 5.2px; hover glow shows the exact
  grab area; first touch always grabs the whole object.

## Documented approximations (TV silent / unverifiable)
- Fan/box per-line color order (measured set confirms the palette, exact k-order inferred).
- Gann fan "nine diagonal lines" (classic description) implemented as the 8 TV-style
  k/8 lines; the 16x1/1x8 extremes are extra-steep/shallow variants of 8/8 & 1/8.
- Regression default channel 1σ (TV's default may vary by saved settings).
