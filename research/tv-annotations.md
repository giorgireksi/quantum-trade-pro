# TradingView annotation / pattern drawing tools — visuals & behavior research

**Date:** 2026-02 (fetched live from TradingView Help Center)
**Scope:** Arrow, Note, Callout, Pin, Flag mark, Elliott waves (impulse + the other 4 wave tools), plus Text, Price label, Price note, Arrow marks (cheap extras).
**Method:** Direct HTTP fetches of official TradingView Help Center articles (taxonomy page → per-tool articles), TradingView blog + in-app idea post, charting-library docs, and 2 secondary text sources (financialtechwiz.com, elliottwavetheorypro.com). Screenshot-based verification was explicitly NOT used (no vision). Exact hex values are NOT stated anywhere in the official articles; wherever a hex is given it is the author's inference from TradingView's standard UI palette and is flagged **UNCERTAIN:**.

## Official sources used
- Taxonomy: https://www.tradingview.com/support/solutions/43000703396-drawing-tools-available-on-tradingview/
- Arrow: /support/solutions/43000518134-arrow/ · Arrow marks: 43000518087 · Note: 43000737571 · Callout: 43000516978 · Text: 43000516983 · Price label: 43000518083 · Flag mark: 43000518085 · Elliott: 43000653212 · folder index: /support/folders/43000547459
- Blog "New note tool added": https://www.tradingview.com/blog/en/new-note-tool-47007/ (Oct 3, 2024)
- Price Note announcement (official TV chart/idea): https://www.tradingview.com/chart/TSLA/ySKnw1kN-Meet-Our-New-Drawing-Tool-Price-Note/
- Charting-library docs Drawings List: https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/Drawings-List

> Key context discovered: **"Pin" is the old "Note" tool, renamed on Oct 3, 2024** when a brand-new "Note" tool was added. Quote (blog): *"First, our drawing tool Note has been renamed to "Pin". The functionality and location are the same, but there was a good reason for the name change — because we've just added a brand-new note tool."* So there are effectively TWO different tools with confusing names; both are covered below.

---

## 1. Arrow (straight arrow)
Source: official Arrow article. Placement in toolbar: Geometric shapes section ("Arrow and arrow marker").
- **Clicks/anchors:** 2 anchor points (the article's Coordinates panel exposes "Price 1" and "Price 2" = the arrow's first and second point). The article does not describe the gesture; standard TV behavior is press-drag-release OR two clicks. UNCERTAIN: exact gesture not stated in sources; no step-by-step in the article.
- **Curved arrow?** No. The Arrow tool is a straight line. The style panel lets you choose per end "an arrow-shaped end or a normal one" for left and right ends, so you can make double-headed straight arrows. Curved shapes are separate tools ("Curve", "Double curve" under Geometric shapes, no arrowheads).
- **Default color/width:** not stated in the article. UNCERTAIN: line tools in TV default to the standard blue (#2962FF) at full opacity, but no official per-tool hex. Line settings available: color, opacity ("thickness"?) — actually article says "Sets the color, opacity, thickness and style of an arrow's line".
- **Labels/default text:** none by default. Optional: "Price labels" toggle = "Toggles the visibility of price values of the arrow line's two points on the price axis". Optional user text via Text tab ("When the Text checkbox is active, a text may be entered in the text box to be displayed beside the arrow").
- **Anchor point vs graphic:** arrowheads at the line ends; the two anchor points are the arrow's endpoints. "Middle Point" toggle shows/hides "the arrow line's mid-point" (a draggable handle on the line).
- **Text-entry flow:** text is NOT opened automatically at placement; you must enable the Text checkbox in settings, type in the settings text box, or "edit the text of an arrow directly on the chart – you just need to click on the text field". Text alignment dropdown positions the text along the line.
- **Settings options:** Line (color, opacity, thickness, style, L/R end shapes), Middle Point, Price labels, STATS (checkboxes: Price range, Percent change, Change in pips, Bars range, Date/time range, Distance, Angle; "Stats position" dropdown; "Always show stats" — quote: *"If this checkbox is not selected, Stats will appear beside only when the arrow is selected by mouse click."*), Text (color, font size, bold/italic, alignment), Coordinates (Price 1/Price 2 by bar#+price), Visibility per timeframe, Alert (clock icon / right-click → crossing alert).
- **Quirk:** stats label is the most distinctive extra; both ends can carry arrowheads.

## 2. Note (the NEW note tool, since Oct 2024)
Source: official Note article (43000737571) + blog post.
- **What it is:** *"This tool allows you to conveniently place a comment directly on the chart with a link to the selected price level. You can find note in the annotation tools section on the left panel."*
- **Clicks/anchors:** one click sets the price level it is "linked" to. The article implies a single anchor (the selected price level); no second point mentioned. UNCERTAIN: exact placement mechanics (whether the note body appears above the click point with a tail down to the price) are not described in text sources.
- **Default color:** not stated. UNCERTAIN: the TV note renders as a yellow sticky-note style box in product screenshots; no authoritative hex found (blog screenshots were not analyzed — no vision model).
- **Folded corner:** not mentioned in any text source. UNCERTAIN (product screenshots show a folded-corner sticky; unverified).
- **Labels/default text:** none; the note body starts empty (no price automatically shown — article says it's a "comment ... with a link to the selected price level"; separate from Price note which always shows a price).
- **Text-entry flow:** *"As with all text tools, you can enter text directly on the chart for note – you just need to click on the text field, and you can type."* UNCERTAIN: whether the text field is in edit mode immediately after placement is NOT stated (article only describes click-to-edit afterwards).
- **Settings:** *"You can also set up the tool color and text style – you can open them by double-clicking on the drawn note or via the Settings button on the floating panel."* So: note color + text style (color/font/bold/italic presumably). No size/opacity options documented.
- **Quirks:** follows "linked price level" — moves with price; settings via double-click (not single click) or floating panel gear.

## 3. Callout (speech bubble)
Source: official Callout article.
- **What it is:** *"This tool is similar to a comment. The difference is that callout allows the user to extend its point from a specific location to a more customized placement."*
- **Clicks/anchors:** TWO points. *"To add a callout, set its two points on the chart and enter text for it."* Coordinates panel: "Price 1 = the callout's point" (the tail tip, the specific location) and "Price 2 = the callout's container" (the bubble position). So the tail tip (anchor) is at Price 1; the bubble body is at Price 2, some distance away.
- **Default colors:** not stated in the article (background & border colors are user-settable: Background: "color and opacity"; Border: "color, opacity, thickness and style"). UNCERTAIN exact default hex for bubble fill/text (product shows a light/yellow-ish bubble with dark text; unverified).
- **Labels/default text:** none — text is user-entered after the two points are set. Text Wrap is a toggle ("Enables/disables text wrap within the callout").
- **Text-entry flow:** you place the two points, then enter text ("enter text for it"). Afterwards, click the text field on the chart to edit inline. Text settings: text color, font size, bold/italic ("General Options"), Text Box (the text), Background, Border, Text Wrap.
- **Anchor point vs graphic:** the pointed tail end sits AT the marked price location (Price 1); the bubble container floats at Price 2.
- **Quirks:** the tail is what distinguishes it from Comment; positioning of bubble relative to tail is fully free (2 anchors), not auto-computed.

## 4. Pin (map-marker-ish; = the OLD Note tool)
Source: TradingView blog (renaming announcement). No dedicated Pin help article exists in the folder index (checked /support/folders/43000547459).
- **Identity:** Pin == old "Note" drawing tool, renamed Oct 3, 2024 for the new Note's arrival. *"The functionality and location are the same"* — still under Annotation tools.
- **Clicks/anchors:** the old Note was a single-click tool that places a small note marker at the clicked price point (a pin/flag-like note with an anchor at the price). UNCERTAIN: no current official article describes Pin's mechanics; the old Note article's text was largely reused for the new Note article ("place a comment directly on the chart with a link to the selected price level").
- **Default color:** UNCERTAIN (old Note rendered as a colored note tag — commonly yellow in product screenshots — plus optionally the price value; unverified by text).
- **Settings:** (inherited from old Note article's wording, now on the new Note article): tool color + text style, opened via double-click or floating-panel Settings.
- **In ChartLab terms:** if you want BOTH TV tools, Pin ≈ small anchored price-linked marker (rename candidate), Note ≈ new sticky-note comment box.

## 5. Flag mark (Flagmark)
Source: official Flag mark article. Placement: Annotation tools section ("Flagmark").
- **What it is:** *"Flag mark is a simple tool for marking points of significance on chart. For example, user can place flag marks at high/low price points of a trend."*
- **Clicks/anchors:** single click at the high/low point (Coordinates panel = one anchor: price + bar number). No second anchor.
- **Default color:** official: *"Flag mark has blue color by default and fixed size."* UNCERTAIN exact hex (TV standard blue #2962FF). "The size of the arrow marks is fixed" — for arrow marks the size is fixed; for flag mark the article says "fixed size" too.
- **Style options:** only the color can be changed in the Style dialog. No text option, no size option.
- **Anchor vs graphic:** a flag/pennant graphics sits with its pole tip at the anchor price point. UNCERTAIN geometrical details (which corner of the flag touches the point) unstated in text sources.
- **Visibility:** per-timeframe toggle.
- **Quirks:** minimal tool — color changes + coordinates + visibility only.

## 6. Elliott waves — Impulse (1·2·3·4·5) and the pattern family
Source: official "Elliott wave theory and tools" article (drawing-tools section) + elliottwavetheorypro.com tutorial.
- **The family (from Patterns > Elliott wave section, per official article):**
  - Elliott impulse wave (1·2·3·4·5) — "Draw a five-wave impulse pattern to identify the main direction of a trend."
  - Elliott correction wave (A·B·C) — "three-wave corrective pattern to mark a pullback"
  - Elliott triangle wave (A·B·C·D·E) — "five-leg triangle pattern"
  - Elliott double combo wave (W·X·Y) — "two connected corrections"
  - Elliott triple combo wave (W·X·Y·X·Z) — "three connected corrective patterns"
- **Clicks (impulse):** secondary tutorial: *"Click the Elliott Impulse Wave tool. Start at the beginning of Wave 1. Continue clicking to mark Waves 2 through 5. Double-click to finalize the wave structure."* ⇒ 5 clicks (wave-1 start + waves 2–5 endpoints) + double-click to finalize; same pattern with 3 clicks for ABC correction. UNCERTAIN whether the final wave point is placed by the double-click rather than a 5th click; official article does not describe the gesture.
- **Labels:** per-wave labels appear at the segments: 1,2,3,4,5 for impulse; A,B,C for correction; A,B,C,D,E for triangle; W,X,Y / W,X,Y,X,Z for combos — this matches the tool names "1·2·3·4·5" etc. UNCERTAIN exact label placement (typically at the end of each wave segment, beside the line; not described in text sources).
- **Line styling:** official article gives no color/width. UNCERTAIN default (TV pattern tools default to standard blue #2962FF family, width ~1-2px, solid; unverified). Settings in TV pattern tools generally include line color/opacity/thickness + label (text) color/size — but NO "show labels" toggle is documented in any official source for these tools.
- **Anchor behavior:** all wave vertices are draggable after placement ("You can then adjust wave points by dragging them into position" — elliottwavetheorypro).
- **Quirks:** after finalize, wave points stay adjustable; the tool is in "Patterns" menu, not Annotation/Geometric.

## 7. Text (cheap extra)
Source: official Text article.
- **Clicks/anchors:** one click places the text box, anchored to the clicked chart point (*"this standard text box is attached to a certain point on a chart and moves along with the chart as the user scrolls it into the past or future. This means that the text box may get out of view."*).
- **Text-entry flow (from financialtechwiz):** *"select the tool, click where you want to place the text, type, then press Enter or click outside the text box to finish."* — i.e., a text field IS active immediately after placement for this tool.
- **Settings:** General Options (text color, font size, bold/italic), Text Box (content), Background (visibility toggle, color, opacity), Border (visibility toggle, color), Text Wrap (on/off), Visibility per timeframe.
- **Default color/size:** not stated. UNCERTAIN (theme-dependent: dark text on light theme; no bg by default; small default font ~11-12px; unverified).

## 8. Price label (cheap extra)
Source: official Price label article.
- **What it is:** *"Price label tool includes a text box which contains price and a "point" to pinpoint exact location. Price label tool is very similar to the balloon and callout tools, with the difference that price label always contains price inside."*
- **Clicks/anchors:** one anchor ("point") at a price; text box shows the price. The Coordinates dialog sets the point's price + bar number. (Gesture: single click; UNCERTAIN — not stated.)
- **Default text:** always contains the price of the anchor level. Text of the label is NOT user-editable content (it's the price), only styled.
- **Style:** Text Color (color, font size, opacity), Background (color, opacity), Border (color, opacity) — no thickness option listed.
- **Anchor vs graphic:** pointed tip at the price; rounded-rect label floating near it.
- **Default colors:** not stated. UNCERTAIN (product default is dark label w/ light text, theme-dependent).

## 9. Price note (bonus; ChartLab also may want it)
Source: official TV chart/idea "Meet Our New Drawing Tool: Price Note" (Feb 2021).
- **Clicks/anchors:** TWO anchors: *"The first point sets the price, and the second one is the coordinates of the price label."* So it's a connector line from the price point to an arbitrary label position.
- **Text flow:** *"Add text to appear along the Price Note by opening the settings dialog by double-clicking on the note."* — text is NOT edited inline-first; you open settings. Line and text colors changeable there.
- **Keyboard quirks:** *"Press Ctrl ... while placing a point so that the point is drawn to the nearest symbol value"* (magnet); *"Press the Shift key while placing a point to set the slope of the line in multiples of 45 degrees."*

## 10. Arrow marks (bonus — informational)
Source: official Arrow marks article.
- Up arrow mark: green by default; down arrow mark: red by default; *"The size of the arrow marks is fixed and cannot be changed."* Only color is settable. Optional text note with color/opacity/font size/bold/italic. Coordinates: price + bar number. Anchor = the arrow tip at the marked point.

---

## Cross-cutting facts & quirks
- **Default palette (context):** TradingView's standard UI palette — blue #2962FF (lines), green #089981 (up/bullish), red #F23645 (down/bearish), yellow/orange #FF9800/#FFCC00 family — is used across TV products (including Lightweight Charts docs), but the help articles for these tools do NOT state per-tool hex values. Treat any hex above as UNCERTAIN for the specific tool.
- **Edit flows:** double-click on a drawing (or Settings on the floating toolbar) opens the style dialog for Note/Callout/Text/Price note; direct inline text editing by clicking the text field works for Arrow, Note, Text, Callout.
- **Settings dialog tabs across tools:** Style (colors, opacity, thickness, style), Text (content + formatting), Coordinates (bar#+price anchoring, exact placement), Visibility (show on which timeframes), sometimes Stats (arrow), Alert (arrow).
- **Anchor semantics:** price-linked tools (Note, Pin, Flag mark, Price label, Arrow marks) anchor via one point; container+point tools (Callout, Price note) have two anchors — a tail tip at the price and a free-floating label body.
- **"Keep drawing" / magnet / Shift snapping** are chart-level settings (magnet strong/weak; snap to indicators) that apply to all tools; Shift-snap to 45° documented for Price note.
- **Gaps:** exact default colors/widths, Note's folded corner, Note auto-edit-on-placement, Elliott line styling options are NOT documented in official text sources — marked UNCERTAIN above. If ChartLab needs pixel-exact truth, the only way is a vision-capable pass over product screenshots or the licensed charting-library package defaults.
