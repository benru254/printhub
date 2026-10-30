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
