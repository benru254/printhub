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

## Set up the imposition tool (Windows PowerShell)

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
