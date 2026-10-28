# Basil Draw: feature spec

Basil Draw is a clean-room rebuild of the *behaviour* of Micrografx Windows Draw 5 (1990s) as an Electron app.
Nothing from the original program is copied: no code, icons, artwork, clip art, help text or file templates.
This spec was written by watching the original run under Windows XP in UTM.

Status key: ✅ in Phase 1 (built) · 🔜 Phase 2 · 🧊 Phase 3 / later

---

## Main window (as observed)

- Title bar, then a classic in-window **menu bar**: File, Edit, View, Insert, Format, Tools, Draw, Window, Help.
- **Standard toolbar**: New, Open, Save | Print, Print Preview, Spelling | Cut, Copy, Paste, Pick up/Apply style (brush) | Undo, Redo | Object Properties, Grid toggle, Page setup | Zoom tool, Zoom dropdown ("Page") | Context help.
- **Format toolbar**: Font, Size | Bold, Italic, Underline | Justification, Label position | Text colour, Fill colour, Shadow colour, Line colour | Line thickness, Line style, Line ends.
- **Toolbox** (left, vertical): Select · Rotate/Slant · Edit points · Text · Clip Art · Picture · Lines ▸ · Connector Lines ▸ · Shapes ▸ · CoolShapes ▸ · Borders ▸ · ArrowShapes ▸
  (▸ = click-and-hold flyout grid; the chosen item becomes the button's face).
- **Document window** with page on a grey pasteboard, grid dots, scroll bars, **layer tabs** at bottom left ("Layer1").
- **Status bar**: current tool/hint | line & fill swatch | selected object type ("Rectangle", "No Objects Selected") | cursor position (cm) | selection size (cm).
- Drawing tools stay active after drawing, with a small floating palette ("Rectangle [Finished]"). Clicking *Finished* or pressing Esc returns to Select.
- Startup **Welcome** dialog: Start with Project Wizard / Start with Blank Page / Learn about Draw / Open File; Recent Documents; Tip of the Day.

> Basil Draw keeps the original's menus, tools and behaviour but uses a modern visual style (since v0.2).

## Menus

### File
| Item | Shortcut | Status |
|---|---|---|
| New | Ctrl+N | ✅ |
| New Project… (wizard) | | ✅ 9 project types × 4 styles |
| Open… | Ctrl+O | ✅ |
| Close | Ctrl+W | ✅ |
| Close All | | ✅ |
| Save | Ctrl+S | ✅ |
| Save As… | | ✅ |
| Save As Template… | | 🔜 |
| Save Selection… | | ✅ |
| Send… (email) | | 🧊 |
| Page Setup… | | ✅ |
| Page Background… | | ✅ |
| Print Preview | | ✅ (export to PDF and open) |
| Print… | Ctrl+P | ✅ |
| Recent files | | ✅ |
| Exit | | ✅ |

Basil Draw also adds **Export** (PNG / SVG / PDF).

### Edit
Undo Ctrl+Z ✅ · Redo Ctrl+Y ✅ · Cut Ctrl+X ✅ · Copy Ctrl+C ✅ · Paste Ctrl+V ✅ · Paste Special… 🧊 · Paste as New Drawing ✅ · Delete Del ✅ · Select All Ctrl+A / F2 ✅ · Deselect All Ctrl+F2 ✅ · Select Mode ✅ · Rotate/Slant ✅ · Object (OLE) 🧊

### View
Zoom In PgUp ✅ · Zoom Out PgDn ✅ · Zoom Area ✅ · Page Home ✅ · Page Width ✅ · Selection Shift+Home ✅ · Actual Size Ctrl+Home ✅ · Previous End ✅ · Redraw F3 ✅ · Proof Mode ✅ · Toolbars… ✅ (show/hide) · Status Bar ✅ · Project Help Bar 🔜 · Rulers ✅

### Insert
- Picture… ✅ · Clip Art… 🔜 (needs our own clip art library) · Object ▸ 🧊 · Scanner Image ▸ 🧊
- Text ▸ Text Ctrl+T ✅, Text File… ✅
- Field From Address List ▸ 🧊
- Lines ▸ Straight, Polyline, Right-Angle, Arc, Curve, Freehand ✅
- Connector Lines ▸ (same six, but ends stay glued to objects) 🔜 (Phase 1 draws them as ordinary lines)
- Shapes ▸ Square, Rectangle, Polygon, Circle, Rounded Square, Rounded Rectangle, Smoothed Polygon, Ellipse ✅
- CoolShapes ▸ Triangle, Pentagon, Hexagon, Star, Starburst, Arrow, Cube, Pyramid, Cylinder, Prism, Cone, Megagon, Curveygon ✅
- Borders ▸ Border Frame, Border Line ✅ (simple designs of our own)
- ArrowShapes ▸ One-way, One-way 3D, Two-way, Two-way 3D, Angled, Angled 3D, Curved, Curved 3D, Three-way, Four-way, Custom ✅ (Custom = notched arrow)

### Format
Fill… ✅ · Line… ✅ · Line Ends… ✅ · Shadow… ✅ · Text… ✅ · Object… Ctrl+D ✅ · Default Properties… ✅ · Paragraph… 🔜 · Label Position ▸ ✅ · Justification ▸ ✅ · Pick up Object Defaults ✅ · Apply to Object Defaults ✅

### Tools
Blend… ✅ · Spelling — removed (not wanted) · Image Effects… 🧊 · Group F5 ✅ · Ungroup Shift+F5 ✅ · Connect Closed F11 🔜 · Connect Open Ctrl+F11 🔜 · Disconnect Shift+F11 🔜 · Separate Label Text ✅ · Join Objects + 🔜 · Slice Object − 🧊 · Convert to Curves ✅ · Convert to Image… 🔜 · Address List… 🧊 · Wizard Defaults… ✅ · Options… F12 ✅

### Draw
Grid Options… ✅ · Snap to Grid Ctrl+G ✅ · Send to Back F9 ✅ · Bring to Front F10 ✅ · Send Backward Shift+F9 ✅ · Bring Forward Shift+F10 ✅
- Layers ▸ Layer Manager… ✅, Edit All Layers ✅, Add Layer… ✅, Move to Layer… ✅, Move Back One Layer Ctrl+F9 ✅, Move Forward One Layer Ctrl+F10 ✅
- Align Objects ▸ Left, Center, Right, Page Center, Top, Middle, Bottom, Page Middle ✅
- Space Objects ▸ Edges Horizontally/Vertically, Centers Horizontally/Vertically ✅
- Center ▸ Entire Drawing, Selected Objects ✅
- Move/Size… ✅ · Flip ▸ Horizontally F7, Vertically Shift+F7 ✅ · Rotate ▸ Left 90 F8, Right 90 Shift+F8, Angle…, Options… ✅

### Window
New Window 🧊 · Cascade / Tile 🧊 (each drawing is its own window instead) · list of open drawings ✅

### Help
Help (Basil Draw guide) ✅ · Keyboard shortcuts ✅ · About Basil Draw ✅

## Dialogs

**Object Properties** (tabs), with OK / Close / Apply / Help and a live Sample:
- *Fill*: No Fill / Solid / Pattern / Gradient. Solid → Color. Pattern → 25-swatch pattern grid, Foreground + Background colour. Gradient → 8 gradient styles, Start + End colour. ✅
- *Line*: No Line / Hairline / Wide Line / Outline; Thickness (pt); Style (solid, dash, dot, dash-dot, dash-dot-dot); Colour. ✅ ("Outline" multi-stroke 🔜)
- *Ends*: Start and End grids of 15 end styles, Both Same, Line End Size (small/medium/large). ✅
- *Shadow*: No Shadow / Simple / Block / Soft, Shadow colour. ✅
- *Text*: Font list, Size list, Bold/Italic/Underline/Strikeout, Text colour, Background colour (Transparent or colour). ✅
- *General*: Object Name; Location x/y (cm); Size x/y (cm) with Keep proportional; Layer of Object. ✅

**Colour drop-down**: 11 × 6 palette, Lighter, Darker, New Color… (system colour picker). ✅

**Page Setup**: Page Layout (Printer Sheet, Folded Sheet/Card, Banner, Labels, Business Cards, Post Cards, Poster, Screen, Standard Paper Size, Custom Page Size), options per layout (e.g. Screen → resolution), Orientation, Preview. ✅ for Screen, Standard Paper Size, Custom, Post Cards, Business Cards, Poster, Banner (as sizes); tiling/folding behaviour 🔜.

**Options** (F12), tabs: General (DRW-copy setting n/a, Show startup dialog ✅, Block select ✅, Undo levels ✅), Files (n/a), Editing (Text tool creates label text ✅), Drawing (Constraint angle ✅, Display "Finished" button ✅), Grid/Scaling (scale 🔜, Snap to grid ✅, Grid dots: Always / On When Snapping / Never ✅, Grid units ✅).

## Behaviour notes
- Units are centimetres throughout the UI.
- Shift constrains: squares/circles while drawing, lines and rotation to the constraint angle (default 15°).
- Selecting a shape and typing replaces/creates its **label** text (centred inside the shape).
- Double-clicking a text object edits it; double-clicking a shape edits its label.
- Undo depth defaults to 5 in the original; Basil Draw defaults to 100 (configurable).

## File formats
- Native: `.bdraw` (JSON). ✅
- Export: PNG, SVG, PDF. ✅
- Import original `.DRW` files: reverse-engineer the format from sample files for interoperability. 🧊 (needs sample drawings)

## Project Wizard (v0.2)
Three steps: choose a project → pick a style → type the words (with a live preview).
- Projects: Greeting Card, Invitation, Sign or Poster, Certificate, Business Card, Banner, Label, Post Card, Calendar (real month grid).
- Styles: Classic, Bright & Fun, Elegant, Modern.
- Tools > Wizard Defaults… stores your name, company, address, phone and email to pre-fill projects.
- The result is an ordinary drawing — everything can be edited afterwards.

## Blend (v0.2)
Select two shapes or lines → Tools > Blend…: number of steps, blend colours on/off, group the steps.
Outlines are sampled, lined up (direction and starting point) and interpolated; fill colour, line colour and
line thickness are blended too.
