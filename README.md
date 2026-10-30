# PrintHub

Customer-friendly print tools that don't sacrifice power: easy smart defaults for
customers, full control for trained print operators.

## Tools

| Tool | Folder | Status |
|---|---|---|
| Imposition · Digital printer (cards, labels, stickers, resize, make bleed) | `tools/imposition/digital-printer/` | Working (Parts 1–4) |
| Canvas editor, t-shirt printing, booklets, numbered books… | `tools/…` | Planned |

Each tool is its own small app with a clear `engine/` (maths + PDF, no screen code),
`frontend/` (screens) and `backend/` (API, later with PostgreSQL).

## Run the imposition tool (Windows PowerShell)

```
cd tools\imposition\digital-printer
npm install
npm test
npm run dev
```

Open http://localhost:5180. On a phone on the same Wi-Fi, open the "Network" address it prints.

## How we work
- **Claude** designs features and pushes them to a branch named `claude/<feature>`.
- **Copilot** pulls, runs, fixes small local issues and merges to `main` after Reuben tests.
- **Reuben** tests the running app and gives feedback.

Rules for Copilot: see `.github/copilot-instructions.md`.
