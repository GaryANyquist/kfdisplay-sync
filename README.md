# kfdisplay-sync

Receives sales and menu changes from the Comfortably Yum register tablet and
writes them into the **KFDisplay** database on the truck PC.

The tablet keeps a queue (its `sync_outbox` table). Every sale, refund, pager
number and menu edit is queued at the moment it is saved, and sent here whenever
this PC answers. If the PC is off or out of Wi-Fi range, changes wait on the
tablet, through restarts, and go when it's back. Sending the same change twice
does no harm: every write is an upsert keyed by the tablet's id.

```
tablet (SQLite + outbox) --HTTP over truck Wi-Fi--> this service --> SQL Server: KFDisplay
```

## What ends up in KFDisplay

The tablet's own schema (see `setup/02-replace-schema.sql`):
`categories`, `items`, `modifier_groups`, `modifier_options`,
`item_modifier_groups`, `discounts`, `auto_discounts`, `auto_discount_targets`,
`shifts` (drawers), `orders`, `order_lines`, `order_line_modifiers`.

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

## One-time setup

Do these in order, in SQL Server Management Studio (connected to
`.\SQLEXPRESS` as an administrator) unless noted.

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
6. **Allow the tablet in**: in an administrator terminal:
   ```
   netsh advfirewall firewall add rule name="KFDisplay sync" dir=in action=allow protocol=TCP localport=8787 profile=private
   ```
   The truck Wi-Fi must be a **Private** network in Windows (Settings →
   Network → Wi-Fi → the network → Private).
7. **Give the PC a fixed address** on the Starlink router (DHCP reservation),
   or the tablet loses track of it after a restart. `ipconfig` shows the
   current IPv4 address.
8. **Start it**: `npm start`. It should print `KFDisplay sync listening on ...`.
9. **Tablet**: Settings → KFDisplay sync. Enter the PC's address
   (e.g. `192.168.1.20`) and the sync key, then tap **Test connection**. The
   first sync sends the whole menu and every sale already on the tablet.

### Run at startup

From an administrator terminal:

```
schtasks /Create /TN "KFDisplay sync" /TR "C:\Source\kfdisplay-sync\start-sync.cmd" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
```

Output goes to `logs\sync.log`: one line per batch, with counts and any
refused change. Sale contents are never logged.

## Security

- The tablet must send the shared key (`Authorization: Bearer <SYNC_KEY>`).
  Anything else gets 401.
- Traffic is plain HTTP on the truck's own Wi-Fi (WPA2). Don't forward port
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
