# Working rules for GitHub Copilot in PrintHub

The owner, Reuben, tests the running app and gives feedback. Claude designs features
and pushes them on branches. Copilot does the file and terminal work on Reuben's PC.

## The project
- Root: `printhub/`. Tools live in `tools/<group>/<tool>/`.
- Imposition tool: `tools/imposition/digital-printer/`
  - `engine/` = all maths and PDF building. Pure JavaScript, no React, no browser-only code
    except where a file says so. It will also run on the server and in WhatsApp/Telegram bots.
  - `frontend/` = React + Vite screens. They import the engine only via `@engine`.
  - `backend/` = tool-specific server code (later).
- Shared server: `server/` (Express 5 + PostgreSQL + files in `server/uploads/`). Setup: `server/README.md`.
  - Modules: `server/src/modules/<name>/<name>.service.js | .controller.js | .routes.js`.
  - Database changes: ONLY add to `server/src/schema.js` (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
  - After pulling server changes: stop and restart `npm run dev` in `server/`.
  - Never commit `server/.env` or `server/uploads/`. `npm test` in `server/` wipes TEST_DATABASE_URL only.
- Plain JavaScript (no TypeScript). Node 20+.

## Every task
1. `git pull` first. Claude's work arrives on branches named `claude/<feature>`.
2. In `tools/imposition/digital-printer/`: `npm install` (only if package.json changed),
   then `npm test` (all tests must pass), then `npm run dev`.
3. Tell Reuben exactly what to test and what he should see.
4. Commit with a clear message. Push. Never force-push. Never rewrite history on `main`.
5. Merge a `claude/...` branch into `main` only after Reuben says it works.

## Do
- Keep files small and in their folders. New features get new files.
- Give every text, input, select and button an explicit `color` AND `background`
  (Reuben uses dark mode; unstyled elements become invisible).
- Use plain, friendly words in the app. Tips explain *why*, and never block the user.
- If something fails, report the exact error output to Reuben (and Claude).

## Don't
- Don't rename, move or "tidy up" files, and don't reformat code you didn't change.
- Don't add or upgrade packages without asking.
- Don't change engine maths just to make a test pass. A failing test means something is wrong: report it.
- Don't commit `node_modules/`, `dist/` or `.env` files.
- Don't use AGPL libraries (e.g. MuPDF, Ghostscript) without asking: they can force the
  whole product to become open source. MIT/Apache libraries (pdf-lib, PDF.js, Konva) are fine.

## Added in Part 9 (keep these rules)
- Prices: ONE module, `tools/imposition/digital-printer/engine/core/pricing.js`. The app and the server both import it. Do not copy price maths anywhere else.
- Money: only ADD rows to `order_ledger` (see `server/src/modules/money/`). Never UPDATE or DELETE a ledger row, and never store a price or balance on the order.
- Simple / Pro: customers see Simple. Anything about sheets, margins, printers or bleed goes behind `ctx.pro` in the tool, and its tutor note id goes in `PRO_ONLY_NOTES` (`frontend/src/lib/mode.js`).
- Every tool shows `<OrderPanel>` (paper, finish, price, send / save to order). A new tool must pass it a `spec` (sheets, sides, cut, binding) and `outputs`.
- Screens change with `go(screen, tool)` in `App.jsx` so the phone's Back button works. Do not call `setScreen` directly.
- `frontend/sw.template.js` + the `offlineApp` plugin in `vite.config.js` make the offline app. `/api` must never be cached.

## Added in Part 10 (keep these rules)
- To run everything: `start-printhub.bat` in the repository root (installs, builds, starts). With no `server/.env` the server uses its built-in database (PGlite) in `server/data`. Do not install PostgreSQL unless Reuben asks. See `LOCAL-TEST.md`.
- Products: the catalogue is ONE module, `engine/core/catalogue.js`, and product prices are ONE module, `engine/core/productPrice.js`. The phone only sends WHICH product and WHAT was chosen; the server works out price, tool, settings and ready date (`server/src/modules/orders/orders.service.js`, `fromProduct`). Never trust a price, title or quantity sent with a product order.
- A choice always goes through `cleanChoice(product, raw)` before it is priced or saved.
- Customers have no password. `track_key` (in the tracking link) or phone number opens one order; the customer token opens "my orders". `requireStaff` must keep refusing customer tokens.
- A proof sets `orders.proof_state`. Printing while it is `sent`, and handing over an unpaid order, are refused with 409 `{ needs }` until staff confirm on purpose (`useOrderMove.jsx`). Do not remove these checks.
- "I have paid" is a row in `payment_claims`, NOT money. Only confirming it adds a ledger payment (through `addMoney`, so a code is never used twice).
- Papers for printing (job ticket, receipt) are drawn into `#print-root` with `<PrintSheet>` (`frontend/src/lib/print.jsx`).
- Every SQL statement must work on PostgreSQL AND the built-in database: `npm test` in `server/` runs on the built-in one; CI also runs it on PostgreSQL.
