# Run PrintHub on your computer and your phone

This is the test run before hosting. Everything stays on your computer: nothing is on the
internet, and no customer can reach it.

## 1. Start it (Windows)

You need Node.js 20 or newer (https://nodejs.org, the LTS button). You do **not** need
PostgreSQL: with no `server/.env` file PrintHub keeps its orders in its own built-in
database, in the folder `server/data`.

1. Get the newest code (`git pull`, or ask Copilot to pull the branch).
2. In the `printhub` folder, double-click **`start-printhub.bat`**
   (or in PowerShell: `.\start-printhub.bat`).
3. Wait for:

   ```
   PrintHub is running.
     On this computer:         http://localhost:5181
     On a phone (same Wi-Fi):  http://192.168.x.x:5181
   ```

4. Leave that window open. Closing it stops PrintHub. To stop it: Ctrl+C.

The first start takes a few minutes. Run the same file again after every `git pull`.

If you made a `server/.env` file earlier with a `DATABASE_URL=postgres://...` line and
PostgreSQL is not installed, the start stops with "Cannot connect to PostgreSQL".
Delete that line (or the whole `server/.env` file) and start again.

## 2. Open it on your phone

1. Put the phone on the **same Wi-Fi** as the computer.
2. In the phone's browser type the "On a phone" address from the window, exactly
   (it starts with `http://`, not `https://`).
3. If it does not open: Windows Firewall is blocking it. When Windows asks about
   "Node.js", tick **Private networks** and Allow. If it never asked: Start menu →
   "Allow an app through Windows Firewall" → find Node.js → tick Private.

The same address is shown inside the app under Staff → Shop & prices → "Open PrintHub on a phone".

Things that only work after hosting (they need https): installing the app to the home
screen, working offline, and tracking links that open for customers outside your Wi-Fi.

## 3. First-time setup (5 minutes, on the computer)

1. Open `http://localhost:5181/#/staff`. The first person to open it becomes the owner:
   type your name, a username and a password.
2. **Shop & prices** → fill in the shop name, WhatsApp number, where customers collect,
   and **How customers pay** (your Till / Paybill / Pochi number and the deposit %). Save.
3. Still in Shop & prices: the price list holds EXAMPLE prices. Put in yours and save.
   Switch "We take offset jobs" off if you never do offset.
4. **Products** → switch off what you do not sell. Open a product to change its sizes and
   quantities. If the worked-out price is not what you charge, use "Pin a price"
   (for example 100 = 500, 500 = 1,500, 1,000 = 2,500).
5. Printer button (top right, in Pro) → set your printer's real margins and sheets. Then
   Shop & prices → "Publish this computer's printers to customers".

## 4. Test checklist

Use the phone as the customer and the computer as the shop.

**A. A customer orders (phone)**

1. Open the phone address. You see "What do you want to print?" with products and prices.
2. Tap Business cards. Tap 500: the price at the bottom changes. Choose Matt lamination: it changes again.
3. Under "Your design" choose a PDF or two photos. You see a small picture and a green line saying if the size is right.
4. Type a name and a phone number. Tap **Send order**. You get an order code, what happens next, and how to pay (your Till number).
5. Tap **Track my order**.

**B. The shop works on it (computer, `#/staff`)**

6. The order is on the **Board** under "To check", soonest-needed first. Tap **Start checking**, then **Open: fix, send proof**.
7. Tap **Open in Cards, labels & stickers**. The customer's size and quantity are already set. Tap **Save print-ready PDF to order**, then **Send a proof to ... to approve**.
8. Back on the order, try the status **Printing**: PrintHub stops you, because the customer has not approved. Tap "No, wait for the customer".

**C. Proof and payment (phone)**

9. The tracking page now shows **Check your proof** with the picture. Tap **Something needs to change**, type a change, send.
10. On the computer the order shows the change in a box. Send a new proof (the green "Send a new proof" button takes any picture or PDF).
11. On the phone tap **Approve — print it**.
12. Tap **I have paid** and paste an M-Pesa message, for example:
    `UKB7XY12QP Confirmed. Ksh250.00 sent to MY SHOP on 16/11/26 at 10:02 AM.`
    It reads the code and the amount.

**D. Money and hand-over (computer)**

13. The order shows "says they paid — check". Tap **It came in**. Paid goes up, and the same code can never be used again.
14. Board: **Start printing**, then **Done — ready**, then **Collected**. Because a balance is left, PrintHub asks: record the payment, or hand over and the customer owes.
15. **Customers** shows what each customer has paid and owes. "Time to restock" lists regulars who have gone quiet, with a WhatsApp message ready.
16. On an order: **Print job ticket** and **Print invoice / receipt**.

**E. Buying again (phone)**

17. Go back to the first screen. Your order and an **Order again** card are at the top. Tap it, choose a quantity, tap Order: a new order with the same design, at today's price.
18. Tap **My orders**: every order, with what needs you.

**F. The other kinds of order**

19. Banners → Other size → type 1.5 × 4 metres → "I'll send it later" → Send. On the tracking page, send the design. In the shop, open it in **Banners, posters & large prints**: hem, eyelets, and parts when it is wider than the roll.
20. Flyers → 5,000: the price drops and says it is printed on the offset press (if offset is on).
21. Receipt & invoice books: choose duplicate, 50 per book, numbers start at 1. Order again later: the numbers carry on.
22. On the computer tap **+ New order for a customer**: the same screens, for a walk-in or WhatsApp customer. Typing part of a phone number finds customers you already have.
23. Business cards → "Design it for me": the design fee is added and no file is needed.

If anything fails, tell Claude the step number and what you saw.

## 5. Where your data is

- Orders, customers, payments: the folder `server/data`.
- Customer files: the folder `server/uploads`.

To back up: stop PrintHub, copy both folders somewhere safe. To start again from nothing
(after testing): stop PrintHub and delete both folders.

When you host PrintHub for real customers, use a PostgreSQL database (set `DATABASE_URL`
in `server/.env`) with automatic backups. The built-in database is for testing and for a
single computer.
