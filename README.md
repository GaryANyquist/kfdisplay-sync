# kfdisplay-sync

Receives sales and menu changes from the Comfortably Yum register tablet and
writes them into the **KFDisplay** database on the main PC.

The tablet keeps a queue (its `sync_outbox` table). Every sale, refund, pager
number and menu edit is queued at the moment it is saved, and sent here whenever
this PC answers. If the PC is off or out of Wi-Fi range, changes wait on the
tablet, through restarts, and go when it's back. Sending the same change twice
does no harm: every write is an upsert keyed by the tablet's id.

```
tablet (SQLite + outbox) --HTTP over local Wi-Fi--> this service --> SQL Server: KFDisplay
```

## Kitchen status (the other direction)

The Kitchen Display app (`C:\Source\KitchenDisplay`) writes `orders.order_up_at` (ready) and
`orders.completed_at` (bumped). The tablet asks for them: `POST /v1/kitchen-status` with `{ "ids": [...] }`
returns `{ "orders": [{ id, order_up_at, completed_at }] }` (ISO UTC, null when not set). The tablet calls it every
10 seconds for its orders of the last 24 hours and keeps the answer in its own `kitchen_status` table. The sync login
only needs SELECT on `orders` for this (it already has it). `apply.js` never writes these two columns, so a re-sync of
an order can't undo what the kitchen did.

Since register 2.4.11 the kitchen tablet (not the PC) marks orders ready and done, and the register sends those times
here as a `kitchen_status` change, which sets `orders.order_up_at` / `completed_at` (and nothing else).

## Every register's sales in the reports (this PC → registers)

Since register 2.4.15, Reports → Transactions, Sales Tax, Monthly Summary and Sales Summary (when "All registers" is
chosen) read every register's sales from here: `POST /v1/orders/search` with `{ since, until, limit }` (ISO times,
either may be null; limit 1-20000, default 500) returns `{ orders, lines, modifiers, registers }`, rows named as in the
tablet's schema, times ISO UTC. Each sale has `orders.register_id` (the register's own id; names are in
`register_settings`). A register can refund another register's sale; it sends entity `order_status` (only
`status`, `refunded_at`, `refund_reason` change), and the register that took the sale pulls it with
`POST /v1/order-status` `{ ids }`. A sale sent again by its own register never undoes a refund given here.
**Run `setup/11-register-on-orders.sql` before starting this version of the service** (KFIDisplay 2.0.10 does it too).

## Registers find this PC

The service announces itself on the local network with mDNS (`_annaware-sync._tcp`, "KFDisplay PC (<computer name>)",
`src/announce.js`), so a register's Settings → KFDisplay sync → **Find KFDisplay PC** fills in the address. It tells
only the name and port; the sync key is still needed. Windows must let node.exe receive UDP 5353: `install-startup.ps1`
adds the "KFDisplay sync (find)" firewall rule (run it again on a PC set up before 2026-10-22).

## Menu-board photos (tablet → this PC)

KFIDisplay shows each item's photo from `C:\images` on this PC, found by the file name in `items.image`. A photo
downloaded from Wix (or taken on the tablet) has a name like `it_160-wix-1791315247281.jpg` and exists only on the
tablet, so the tablet sends it: `POST /v1/photos/check` with `{ "names": [...] }` returns the ones this PC lacks, and
`POST /v1/photos` with `{ "name", "data" }` (base64) saves one. When a photo changes on Wix the tablet downloads it
under a new name, the PC lacks that name, and the tablet sends it, so KFIDisplay follows with no one copying files.
Only the tablet's menu-board items are checked. Files are only ever added, never replaced; the name must be a plain
`.jpg/.jpeg/.png/.gif` name and the bytes must really be an image (5 MB max). The folder is `PHOTO_DIR` in `.env`
(default `C:\images`). The service account needs write access to it (SYSTEM has it by default).

`GET /v1/photos` (the list) and `GET /v1/photos/<name>` (one photo) let KFIDisplay on another PC copy them; see below.

## What ends up in KFDisplay

Everything the register keeps (Gary, 2026-10-22), in its own schema (see `setup/02-replace-schema.sql` and
`setup/10-sync-everything.sql`):
`categories`, `items`, `item_variants` (sizes, each with its own price), `modifier_groups`, `modifier_options`,
`item_modifier_groups`, `discounts`, `auto_discounts`, `auto_discount_targets`,
`shifts` (drawers), `orders`, `order_lines`, `order_line_modifiers`, and per register (by its own id, since several
registers can send here) `register_settings` (its settings as JSON; keys and passwords never leave the tablet) and
`register_wix_links` (which tablet id is which Wix id). Only the tablet's own bookkeeping stays on the tablet: its send
queues and its cached ticket.

- **Kiosk and half-and-half:** `items.hide_on_kiosk`, `items.allow_modifier_split`; an option on one half of an item has
  `order_line_modifiers.half` = 1 or 2 (0 = the whole item).
- **Option limits:** `modifier_groups.min_select` / `max_select` (0 = no limit).

- **Item descriptions:** `items.description` is for the KFDisplay app (menu
  board). It is edited on the tablet (Items → Edit item) and synced; the
  register itself doesn't show it.
- **Prepaid events:** `shifts.prepaid = 1` marks a drawer opened as a prepaid
  event. Join a sale to its drawer with `orders.shift_id = shifts.id`. Prepaid
  sales also have `orders.tender = 'prepaid'`.

- Money is **integer cents** (`price = 1100` is $11.00). Flags are 0/1.
- `*_at` columns are **UTC**. Convert for display, e.g.
  `DATEADD(minute, DATEDIFF(minute, GETUTCDATE(), GETDATE()), created_at)`.
- `orders.order_up_at`, `paged_at` and `completed_at` are for the kitchen and
  pager apps. The tablet never writes them, so they survive every re-sync.
- The menu is owned by the tablet. A menu edit made directly in SQL Server is
  overwritten the next time the tablet sends that item or the whole menu.
- Sales are never deleted here. "Clear sales history" on the tablet only clears
  the tablet.

## KFIDisplay on its own PC (optional)

KFIDisplay (the menu board) can run on a different Windows PC from SQL Server and this service. This PC (SQL Server +
this service) keeps receiving everything from the registers; the KFIDisplay PC only reads the menu and copies photos.

On **this PC** (once):
1. In SSMS, run `setup/08-display-login.sql` (set its password first) and `setup/10-sync-everything.sql`.
2. In PowerShell as Administrator: `powershell -ExecutionPolicy Bypass -File setup\09-allow-remote-display.ps1`
   (SQL Server on TCP 1433 with SQL logins allowed, and firewall rules for 1433 and 8787 on the local network).
3. Make a display key with `npm run make-key` and add it to `.env` as `DISPLAY_KEY=...` (not the same as SYNC_KEY;
   it can only list and download photos). Restart this service.

On the **KFIDisplay PC**: create `C:\KFDisplay\display.ini`:

```
SqlServer=SQLPC,1433
SqlUser=kfidisplay_read
SqlPassword=<the password from setup 08>
SyncAddress=http://SQLPC:8787
DisplayKey=<the DISPLAY_KEY>
```

(`SQLPC` is this PC's name or address.) With that file KFIDisplay 2.0.8+ connects to SQL Server here with the
read-only login, skips creating the database and starting services (they run here), and copies new photos into its own
`C:\images` every minute. Without the file it works as before, all on one PC. Problems go to `C:\KFDisplay\log.txt`.
The registers keep pointing at **this** PC (Settings → KFDisplay sync).

## One-time setup

**A brand-new system** (no old KFDisplay database): run `setup/00-new-database.sql` instead of steps 1-3 below (set its
`CHANGE_ME` password first). It creates the database, every table and the `register_sync` login; then carry on from
step 4. The full walk-through for a new location is `INSTALL.md` in the CashRegister repo.

**Converting the old KFDisplay database** (Gary's original PC): do these in order, in SQL Server Management Studio
(connected to `.\SQLEXPRESS` as an administrator) unless noted.

1. **Back up**: run `setup/01-backup-kfdisplay.sql`. The Messages tab prints
   the backup path. Copy that `.bak` file off the PC as well.
2. **Replace the schema**: run `setup/02-replace-schema.sql`. It refuses to
   run without a backup from the last 24 hours, and it's all-or-nothing.
   **KFIDisplay and SquarePager stop working at this point** until they're
   pointed at the new tables.
3. **Sync login**: edit the password in `setup/03-create-sync-login.sql`, then
   run it. The `register_sync` login can read and write only the register
   tables.
4. **Install** (in a terminal):
   ```
   cd C:\Source\kfdisplay-sync
   npm install
   npm run make-key
   ```
5. **Configure**: copy `.env.example` to `.env`. Fill in `SYNC_KEY` (the key
   from step 4) and `KFDISPLAY_PASSWORD` (the password from step 3).
   It connects on port 1433; use `KFDISPLAY_INSTANCE` instead only if the SQL
   Server Browser service is running (it is disabled on Gary's PC).
6. **Allow the tablet in**: in an administrator terminal:
   ```
   netsh advfirewall firewall add rule name="KFDisplay sync" dir=in action=allow protocol=TCP localport=8787 profile=private,domain
   ```
   The business Wi-Fi must be a **Private** network in Windows (Settings →
   Network → Wi-Fi → the network → Private). On an office (domain) network
   the rule needs the domain profile too, which the command above includes.
   To fix an existing rule: `Set-NetFirewallRule -DisplayName "KFDisplay sync" -Profile Domain,Private`.
7. **Give the PC a fixed address** on the Starlink router (DHCP reservation),
   or the tablet loses track of it after a restart. `ipconfig` shows the
   current IPv4 address.
8. **Start it**: `npm start`. It should print `KFDisplay sync listening on ...`.
9. **Tablet**: Settings → KFDisplay sync. Enter the PC's address
   (e.g. `192.168.1.20`) and the sync key, then tap **Test connection**. The
   first sync sends the whole menu and every sale already on the tablet.

### Run at startup, and starting / stopping it

From an **administrator PowerShell**, once:

```
powershell -ExecutionPolicy Bypass -File C:\Source\kfdisplay-sync\setup\install-startup.ps1
```

It sets up the "KFDisplay sync" scheduled task (at boot, as SYSTEM, no 3-day time limit, restarted if the task fails)
and puts four shortcuts on the desktop: **Start**, **Stop** and **Restart KFDisplay sync**, and **KFDisplay sync status**
(they run `node tools/control.js start|stop|restart|status` and need no administrator rights). The service no longer
depends on KFIDisplay to start it.

`start-sync.cmd` starts the service again a few seconds after it stops (an update, a crash, a restart from the
register), unless it was stopped on purpose (Stop leaves `stop.flag`, which the script removes as it stops).
The register can restart it too: **Settings → KFDisplay sync → Restart sync service** (`POST /v1/restart`, sync key
only). Nothing can start it from the register once it is stopped; use the Start shortcut on this PC.

Output goes to `logs\sync.log`: one line per batch, with counts and any
refused change. Sale contents are never logged.

## Security

- The tablet must send the shared key (`Authorization: Bearer <SYNC_KEY>`).
  Anything else gets 401.
- Traffic is plain HTTP on the business's own Wi-Fi (WPA2). Don't forward port
  8787 on the router.
- Column names come only from `src/apply.js`, never from the request, and
  every value is a typed parameter.
- The `register_sync` login can't create, alter or drop anything.

## Tests

```
npm test
```

These run the write logic and the HTTP service against a fake database. The
real SQL is first exercised when the tablet syncs after setup.

## Undo

```sql
RESTORE DATABASE [KFDisplay] FROM DISK = N'<path printed by step 1>' WITH REPLACE;
```
