# PrintHub server (orders API)

One server for every PrintHub tool:
- Customers send orders (file + the settings they chose). They use a name and phone number, with no password.
- Customers track an order with its code and their phone number.
- Staff log in, check orders, change status, message the customer, add notes and files.
- Every change is saved with who made it (`order_events`, `staff_events`).

Stack: Node 20+, Express 5, PostgreSQL, and files kept in a folder (`UPLOAD_DIR`). Every package has an MIT or BSD licence.

## First-time setup (Windows)

1. **Install PostgreSQL 16** from https://www.postgresql.org/download/windows/ (the EDB installer).
   - Keep port **5432**.
   - Write down the password you choose for the `postgres` user.
   - You can skip Stack Builder.
2. **Create the databases.** Open *SQL Shell (psql)* from the Start menu, press Enter at each prompt, type the `postgres` password, then run:
   ```sql
   CREATE USER printhub WITH PASSWORD 'choose-a-strong-password';
   CREATE DATABASE printhub OWNER printhub;
   CREATE DATABASE printhub_test OWNER printhub;
   ```
3. **Settings.** In `server/`, copy `.env.example` to `.env`, then:
   - Put your password into `DATABASE_URL` and `TEST_DATABASE_URL`.
   - Set `JWT_SECRET` to a long random text. You can make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Run:
   ```
   cd server
   npm install
   npm run db:setup     # "Database is ready."
   npm test             # all pass (uses printhub_test, which it WIPES)
   npm run dev          # PrintHub API running on http://localhost:5181
   ```
5. In a second terminal, start the app:
   ```
   cd tools/imposition/digital-printer
   npm run dev
   ```
   Then open `http://localhost:5180/#/staff`. The first visit creates the **admin** account.

## Every day
- Start the server with `npm run dev` in `server/`. It restarts by itself when files change. After a `git pull` that changed `server/`, stop it (Ctrl+C) and start it again.
- `npm run dev` in the tool folder serves the app on port 5180 and passes `/api` on to port 5181.
- Phones on the same Wi-Fi: open `http://<PC-IP>:5180`.

## Backups (important)
The orders live in PostgreSQL, and the files live in `server/uploads/`. Back up **both**, at least weekly:
```
pg_dump -U printhub -F c printhub > printhub-YYYY-MM-DD.backup
```
Also copy the `uploads` folder to another disk or cloud drive.

## API
| Who | Method & path | What |
|---|---|---|
| anyone | `GET /api/health` | server is up |
| customer | `POST /api/orders` (multipart: name, phone, tool, title, quantity, notes, recipe, summary, file) | send an order → `{ code }` |
| customer | `GET /api/orders/track/:code?phone=` | order status and messages |
| anyone | `GET /api/setup` / `POST /api/setup` | create the first admin (only while there is no staff) |
| staff | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/password` | log in (token lasts 12 h) |
| staff | `GET /api/orders?status=open&q=` | list (status: open, all or one status) |
| staff | `GET /api/orders/:id`, `PATCH /api/orders/:id` | detail; change status / message / assignment / quantity |
| staff | `POST /api/orders/:id/notes` | staff-only note |
| staff | `POST /api/orders/:id/files`, `GET /api/orders/:id/files/:fileId` | add a fixed or print-ready file; download |
| staff | `GET /api/customers?q=`, `GET /api/customers/:id` | customers and their orders |
| admin | `GET/POST /api/staff`, `PATCH /api/staff/:id` | add staff, switch off, reset password, role |

## Rules for changing this code
- Each module has its own folder: `src/modules/<name>/<name>.service.js` (logic and SQL), `.controller.js` (HTTP) and `.routes.js`.
- Tables change **only by adding**: append `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `src/schema.js`. Never drop or rename.
- Specific routes go before `/:id` routes.
- Always use `$1, $2` placeholders in SQL. Never paste customer text into SQL.
