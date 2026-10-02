/*
 * Step 2 of 3: replace KFDisplay's menu and order tables with the register
 * tablet's schema.
 *
 * DESTRUCTIVE. It drops Categories, MenuItems, ModifierList, Modifier,
 * Discounts, Orders and OrderLines, with all their rows. KFIDisplay and
 * SquarePager read those tables and will stop working until they are pointed
 * at the new ones. Settings and Gallery are left alone.
 *
 * It refuses to run unless a full backup of KFDisplay finished in the last
 * 24 hours (run 01-backup-kfdisplay.sql first), and it runs in one
 * transaction: if anything fails, nothing changes.
 *
 * The new tables use the tablet's names and columns (see the CashRegister
 * repo, src/db/schema.ts):
 *   - ids are the tablet's text ids
 *   - money is integer cents (price 1100 = $11.00)
 *   - flags are 0/1 ints
 *   - *_at times are UTC
 * Three columns exist only here, for the kitchen and pager apps; the tablet
 * never writes them: orders.order_up_at, orders.paged_at, orders.completed_at.
 * synced_at is when the row last arrived from the tablet.
 *
 * Run in SSMS as an administrator, after step 1.
 */

USE [KFDisplay];
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM msdb.dbo.backupset
     WHERE database_name = N'KFDisplay' AND type = 'D'
       AND backup_finish_date > DATEADD(hour, -24, GETDATE())
)
BEGIN
    RAISERROR(N'No full backup of KFDisplay in the last 24 hours. Run 01-backup-kfdisplay.sql first. Nothing was changed.', 16, 1);
    SET NOEXEC ON;
END
GO

BEGIN TRANSACTION;

-- ---- the old KFDisplay tables -------------------------------------------
IF OBJECT_ID(N'dbo.OrderLines',   N'U') IS NOT NULL DROP TABLE dbo.OrderLines;
IF OBJECT_ID(N'dbo.Orders',       N'U') IS NOT NULL DROP TABLE dbo.Orders;
IF OBJECT_ID(N'dbo.Modifier',     N'U') IS NOT NULL DROP TABLE dbo.Modifier;
IF OBJECT_ID(N'dbo.ModifierList', N'U') IS NOT NULL DROP TABLE dbo.ModifierList;
IF OBJECT_ID(N'dbo.MenuItems',    N'U') IS NOT NULL DROP TABLE dbo.MenuItems;
IF OBJECT_ID(N'dbo.Categories',   N'U') IS NOT NULL DROP TABLE dbo.Categories;
IF OBJECT_ID(N'dbo.Discounts',    N'U') IS NOT NULL DROP TABLE dbo.Discounts;

-- ---- menu ---------------------------------------------------------------
CREATE TABLE dbo.categories (
    id          nvarchar(64)  NOT NULL PRIMARY KEY,
    name        nvarchar(200) NOT NULL,
    color       nvarchar(20)  NOT NULL,
    sort_order  int           NOT NULL DEFAULT 0,
    synced_at   datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.items (
    id                  nvarchar(64)  NOT NULL PRIMARY KEY,
    name                nvarchar(200) NOT NULL,
    price               int           NOT NULL,
    category_id         nvarchar(64)  NOT NULL,
    color               nvarchar(20)  NOT NULL,
    taxable             int           NOT NULL DEFAULT 1,
    archived            int           NOT NULL DEFAULT 0,
    sort_order          int           NOT NULL DEFAULT 0,
    source_key          nvarchar(200) NULL,
    image               nvarchar(1000) NULL,
    show_on_menu_board  int           NOT NULL DEFAULT 0,
    out_of_stock        int           NOT NULL DEFAULT 0,
    -- For the KFDisplay app (menu board); the register doesn't use it.
    description         nvarchar(1000) NULL,
    synced_at           datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX idx_items_category ON dbo.items(category_id);

CREATE TABLE dbo.modifier_groups (
    id            nvarchar(64)  NOT NULL PRIMARY KEY,
    name          nvarchar(200) NOT NULL,
    required      int           NOT NULL DEFAULT 0,
    multi_select  int           NOT NULL DEFAULT 1,
    sort_order    int           NOT NULL DEFAULT 0,
    synced_at     datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.modifier_options (
    id           nvarchar(64)  NOT NULL PRIMARY KEY,
    group_id     nvarchar(64)  NOT NULL,
    name         nvarchar(200) NOT NULL,
    price_delta  int           NOT NULL DEFAULT 0,
    sort_order   int           NOT NULL DEFAULT 0,
    default_on   int           NOT NULL DEFAULT 0
);
CREATE INDEX idx_options_group ON dbo.modifier_options(group_id);

CREATE TABLE dbo.item_modifier_groups (
    item_id     nvarchar(64) NOT NULL,
    group_id    nvarchar(64) NOT NULL,
    sort_order  int          NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, group_id)
);

CREATE TABLE dbo.discounts (
    id         nvarchar(64)  NOT NULL PRIMARY KEY,
    name       nvarchar(200) NOT NULL,
    type       nvarchar(10)  NOT NULL CHECK (type IN (N'percent', N'amount')),
    value      float         NOT NULL DEFAULT 0,
    starts_on  nvarchar(10)  NULL,
    ends_on    nvarchar(10)  NULL,
    synced_at  datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.auto_discounts (
    id          nvarchar(64)  NOT NULL PRIMARY KEY,
    name        nvarchar(200) NOT NULL,
    type        nvarchar(10)  NOT NULL CHECK (type IN (N'percent', N'amount')),
    value       float         NOT NULL DEFAULT 0,
    active      int           NOT NULL DEFAULT 1,
    sort_order  int           NOT NULL DEFAULT 0,
    starts_on   nvarchar(10)  NULL,
    ends_on     nvarchar(10)  NULL,
    synced_at   datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.auto_discount_targets (
    discount_id  nvarchar(64) NOT NULL,
    target_type  nvarchar(10) NOT NULL CHECK (target_type IN (N'item', N'category')),
    target_id    nvarchar(64) NOT NULL,
    PRIMARY KEY (discount_id, target_type, target_id)
);

-- ---- sales --------------------------------------------------------------
-- A drawer (shift). orders.shift_id points here; prepaid = 1 is a prepaid event.
CREATE TABLE dbo.shifts (
    id             nvarchar(64)   NOT NULL PRIMARY KEY,
    opened_at      datetime2(3)   NOT NULL,
    starting_cash  int            NOT NULL DEFAULT 0,
    closed_at      datetime2(3)   NULL,
    counted_cash   int            NULL,
    over_short     int            NULL,
    note           nvarchar(1000) NULL,
    -- 1 = prepaid event: menu items rang up at $0.00 on this drawer
    prepaid        int            NOT NULL DEFAULT 0,
    synced_at      datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.orders (
    id               nvarchar(64)   NOT NULL PRIMARY KEY,
    number           int            NOT NULL,
    created_at       datetime2(3)   NOT NULL,
    shift_id         nvarchar(64)   NOT NULL,
    customer_name    nvarchar(200)  NULL,
    discount_id      nvarchar(64)   NULL,
    discount_name    nvarchar(200)  NULL,
    discount_type    nvarchar(10)   NULL,
    discount_value   float          NULL,
    subtotal         int            NOT NULL,
    discount_amount  int            NOT NULL,
    tax              int            NOT NULL,
    tip              int            NOT NULL,
    total            int            NOT NULL,
    payment_type     nvarchar(10)   NOT NULL,
    payment_amount   int            NOT NULL,
    tendered         int            NULL,
    change_due       int            NULL,
    card_brand       nvarchar(40)   NULL,
    last4            nvarchar(8)    NULL,
    payment_note     nvarchar(1000) NULL,
    status           nvarchar(20)   NOT NULL DEFAULT N'completed',
    refunded_at      datetime2(3)   NULL,
    refund_reason    nvarchar(1000) NULL,
    pager_number     nvarchar(20)   NULL,
    tender           nvarchar(20)   NULL,
    processor        nvarchar(20)   NULL,
    processor_ref    nvarchar(200)  NULL,
    -- written by the kitchen / pager apps, never by the tablet
    order_up_at      datetime2(3)   NULL,
    paged_at         datetime2(3)   NULL,
    completed_at     datetime2(3)   NULL,
    synced_at        datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX idx_orders_created ON dbo.orders(created_at);

CREATE TABLE dbo.order_lines (
    uid         nvarchar(64)   NOT NULL PRIMARY KEY,
    order_id    nvarchar(64)   NOT NULL REFERENCES dbo.orders(id) ON DELETE CASCADE,
    item_id     nvarchar(64)   NOT NULL,
    name        nvarchar(200)  NOT NULL,
    base_price  int            NOT NULL,
    qty         int            NOT NULL,
    taxable     int            NOT NULL DEFAULT 1,
    note        nvarchar(1000) NULL,
    line_index  int            NOT NULL DEFAULT 0,
    auto_discount_id      nvarchar(64)  NULL,
    auto_discount_name    nvarchar(200) NULL,
    auto_discount_type    nvarchar(10)  NULL,
    auto_discount_value   float         NULL,
    auto_discount_amount  int           NOT NULL DEFAULT 0
);
CREATE INDEX idx_lines_order ON dbo.order_lines(order_id);

CREATE TABLE dbo.order_line_modifiers (
    id           int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    line_uid     nvarchar(64)  NOT NULL REFERENCES dbo.order_lines(uid) ON DELETE CASCADE,
    group_id     nvarchar(64)  NOT NULL,
    group_name   nvarchar(200) NOT NULL,
    option_id    nvarchar(64)  NOT NULL,
    option_name  nvarchar(200) NOT NULL,
    price_delta  int           NOT NULL DEFAULT 0
);
CREATE INDEX idx_linemods_line ON dbo.order_line_modifiers(line_uid);

COMMIT TRANSACTION;
PRINT N'KFDisplay now has the register schema. Run 03-create-sync-login.sql next.';
GO

SET NOEXEC OFF;
