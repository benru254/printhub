# PrintHub · Imposition · Digital printer

**Part 1:** Step & Repeat with live preview, cut marks, bleed detection, front/back, tutor tips, Advanced settings, PDF download.
**Part 2:** PDF + JPG/PNG upload, "Your file" screen (thumbnails, full-screen viewer, size facts, picture quality, tool chooser),
Print size / resizing (Fill, Fit, Stretch), sheets A6–A2 + Letter + custom sizes, portrait/landscape sheet, finished-pieces preview.
**Part 3:** Printer profiles (margins per side, sheets, default sheet, double-sided, book/calendar flip), margin test sheet,
"Save as my default" per product and printer, safe zone check (exact text check for PDFs + picture check for detail near the edge).
**Part 4:** Make bleed (Auto / Mirror / Stretch / Off): creates missing 3 mm bleed; the real design stays sharp vector inside the cut.
**Part 5:** Numbered books & tickets (cut & stack): numbering (start, count, digits, prefix, colour, style, drag to place, ticket stubs),
books of 25/50/100, duplicate/triplicate NCR copies (in sets or by colour), "pages in order" for many-page files, step-by-step stacking guide.
Also: smart gap — without bleed, pieces share cut lines when that fits more.

## Folders

| Folder | What lives here |
|---|---|
| `engine/core/` | Shared by every tool: sizes, printers, reading PDFs, pictures → PDF, fitting a design to a size, cut marks, safe zone, margin test sheet. |
| `engine/tools/cards/` | The Cards tool: layout, settings, plan, tips, PDF builder. |
| `engine/tools/cutstack/` | Numbered books & tickets: cut & stack order, numbering, plan, tips, PDF builder. |
| `engine/tests/` | Tests for the engine (`npm test`). |
| `frontend/src/screens/` | Start screen and "Your file" screen. |
| `frontend/src/tools/` | One folder per tool. `registry.js` lists all tools (ready / soon). |
| `frontend/src/printers/` | The Printers panel and printer editor. |
| `frontend/src/components/` | Pieces used by every screen (file picker, tips, viewer...). |
| `frontend/src/lib/` | Loading files, drawing PDF pages, saving small settings on the device. |
| `backend/` | Empty for now. API + PostgreSQL come later. |
| `samples/` | Test files (`npm run samples` recreates them). |

### Adding a new tool later
1. `engine/tools/<name>/` for the maths and PDF.
2. `frontend/src/tools/<name>/` for the screen.
3. Change its line in `frontend/src/tools/registry.js` from `soon` to `ready`, and add it in `App.jsx`.

## First run (Windows PowerShell)

```
cd printhub\tools\imposition\digital-printer
npm install
npm run dev
```

Open http://localhost:5180. On your phone (same Wi-Fi) open the "Network" address it prints.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Start the app (auto-reloads when you save a file) |
| `npm test` | Check the engine maths |
| `npm run samples` | Recreate the test files |
| `npm run build` | Build the final website into `dist/` |
