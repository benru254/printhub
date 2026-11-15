# PrintHub

Customer-friendly print tools that don't sacrifice power: easy smart defaults for
customers, full control for trained print operators.

## Tools

| Tool | Folder | Status |
|---|---|---|
| Shop front: products with prices, ordering, proof approval, "I have paid", order again | `tools/imposition/digital-printer/frontend/src/products/`, `screens/` | Working (Part 10) |
| Imposition · Digital printer (cards, stickers & contour cut lines, numbered books, booklets, glued books, make bleed) | `tools/imposition/digital-printer/` | Working (Parts 1–10) |
| Large format (banners, roll-ups, vinyl, posters: hems, eyelets, parts, tiles) | `tools/imposition/digital-printer/engine/tools/largeformat/` | Working (Part 10) |
| Offset (price route, press sheets, work and turn, colour bar) | `engine/core/productPrice.js`, cards tool | Working (Part 10) |
| Orders server (orders, staff, products, prices, money ledger, production board) | `server/` | Working (Parts 8–10), see [server/README.md](server/README.md) |
| Canvas editor, editable templates, t-shirt printing… | `tools/…` | Planned |

Each tool is its own small app with a clear `engine/` (maths + PDF, no screen code),
`frontend/` (screens) and `backend/` (tool-specific server code, later). Orders, tracking and
staff are shared by every tool, so they live in one server: `server/` (Express + PostgreSQL).

## Run everything on your computer and phone

Double-click `start-printhub.bat`. Full steps and the test checklist: [LOCAL-TEST.md](LOCAL-TEST.md).

## Work on the app's code (Windows PowerShell)

Clone the repository once, then install and run the tool:

```powershell
git clone https://github.com/benru254/printhub.git
cd printhub\tools\imposition\digital-printer
npm install
npm test
npm run dev
```

Open http://localhost:5180. On a phone on the same Wi-Fi, open the "Network" address it prints.

To start the app again later, open PowerShell in the repository and run:

```powershell
cd tools\imposition\digital-printer
npm run dev
```

## Push changes to GitHub (Windows PowerShell)

Create a separate branch for each change, then push it and open a pull request. Run these commands from the repository root, replacing `feature/my-change` and the commit message with names that describe your work:

```powershell
git switch main
git pull
git switch -c feature/my-change
git status
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

After the push, open the pull request link printed by Git or visit `https://github.com/benru254/printhub/pulls`. Review the changes and merge the pull request when they are ready.

### GitHub sign-in

Git for Windows includes Git Credential Manager. On the first push, Git may open a browser window for GitHub sign-in and authorization; finish that flow in the browser. Do not put a GitHub password or access token in a Git command or commit it to the repository.

Check that the credential helper is configured with:

```powershell
git config --global --get credential.helper
```

If it prints nothing and Git Credential Manager is installed, configure it with:

```powershell
git config --global credential.helper manager
```

Git also needs your author name and email to create commits. Set these once if Git asks for them:

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Rules for Copilot: see `.github/copilot-instructions.md`.
