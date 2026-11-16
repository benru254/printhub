# PrintHub server (orders API)

One server for every PrintHub tool:
- Customers send orders (file + the settings they chose). They use a name and phone number, with no password.
- Customers track an order with its code and their phone number.
- Staff log in, check orders, change status, message the customer, add notes and files.
- Every change is saved with who made it (`order_events`, `staff_events`).

Stack: Node 20+, Express 5, PostgreSQL, and files kept in a folder (`UPLOAD_DIR`). Every package has an MIT or BSD licence.

## Run it

The easy way, for testing on one computer: double-click `start-printhub.bat` in the
repository root. See [LOCAL-TEST.md](../LOCAL-TEST.md).

By hand (PowerShell, in this folder):

```powershell
npm install
npm start        # or: npm run dev   (restarts by itself when a file changes)
```

It prints the address to open. With the app built (`npm run build` in
`tools/imposition/digital-printer`) the server shows the app too, on the same address.

## Where orders are kept

| `DATABASE_URL` in `.env` | Database | Use it for |
|---|---|---|
| no line (or no `.env` file) | built-in (PGlite, real PostgreSQL inside the program), folder `data/db` | testing, one computer |
| `postgres://user:password@host:5432/printhub` | a PostgreSQL server | a hosted shop |

The SQL is the same for both. `npm run db:setup` creates the PostgreSQL user and databases
on a computer that has PostgreSQL installed (not needed for the built-in database).
Every setting is optional: see `.env.example`.

## Backups (important)

- Built-in database: stop the server, then copy the folders `data` and `uploads`.
- PostgreSQL: `pg_dump printhub > printhub-backup.sql` every day, and copy `uploads`.
  A hosted database usually does the `pg_dump` part for you: switch that on.

Losing these folders loses every order, payment and customer file.

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
| anyone | `GET /api/shop` | shop name, WhatsApp, price list, published printers |
| admin | `PUT /api/shop` (`shop`, `priceList`, `printers`) | change them (written to `staff_events`) |
| staff | `PUT /api/orders/:id/price` (`amount`, `note`) | set the final price (adds a ledger line for the difference) |
| staff | `POST /api/orders/:id/payments` (`kind` payment/refund, `amount`, `method`, `reference`) | record money in or out |
| staff | `GET /api/money/summary?from=&to=` | money received (by method) and what customers still owe |

## Part 10 addresses

| Address | Who | What |
|---|---|---|
| `POST /api/orders` with `product` = `{ id, choice, speed }` | customer, or staff (counter order) | Order a catalogue product. The server prices it. A file is only needed when `artwork` = `upload` |
| `GET /api/orders/track/:code?key=` or `?phone=` | customer | One order: status, money, proof, what has happened |
| `GET /api/orders/track/:code/proof` | customer | The proof file |
| `POST /api/orders/track/:code/proof` `{ action: approve or change, message }` | customer | Answer the proof |
| `POST /api/orders/track/:code/paid` `{ text }` | customer | "I have paid": M-Pesa code or the whole message |
| `POST /api/orders/track/:code/files` | customer | Send the design later, or one more file |
| `POST /api/orders/track/:code/reorder` `{ quantity }` | customer | Order again |
| `GET /api/me/orders`, `POST /api/me/login` `{ phone, code }` | customer | All their orders (customer token) |
| `POST /api/orders/:id/files` with `kind` = `proof` | staff | Send a proof: the order waits for the customer |
| `POST /api/orders/:id/claims/:claimId` `{ action: confirm or reject }` | staff | Confirm a customer's payment message |
| `POST /api/orders/:id/reorder` | staff | Order again for a customer |
| `GET /api/customers?filter=owing` or `quiet` | staff | Who owes, who has gone quiet |
| `PUT /api/shop` `{ catalogue }` | admin | Change the products |
| `GET /api/local` | staff | The addresses to open PrintHub from a phone |

## Money rules
- `order_ledger` is the only place money lives. Rows are **added, never edited or deleted**. A mistake is fixed with a new row.
- An order's price, paid amount and balance are always worked out from those rows (`modules/money/money.service.js`).
- The price of a new order is worked out **on the server** from the shop's price list, with the same code the app uses to show the price (`tools/imposition/digital-printer/engine/core/pricing.js`). Never trust a price sent by a phone.
- An M-Pesa code can be recorded only once across all orders.
- Sending an order twice with the same `clientKey` returns the first order (no duplicates).

## Offline app
`npm run build` in the tool folder writes `dist/sw.js`, which lets phones open the app with no internet.
Browsers only allow this on **https** (or on `localhost`). It starts working for customers once the app is hosted with https.

## Rules for changing this code
- Each module has its own folder: `src/modules/<name>/<name>.service.js` (logic and SQL), `.controller.js` (HTTP) and `.routes.js`.
- Tables change **only by adding**: append `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `src/schema.js`. Never drop or rename.
- Specific routes go before `/:id` routes.
- Always use `$1, $2` placeholders in SQL. Never paste customer text into SQL.
