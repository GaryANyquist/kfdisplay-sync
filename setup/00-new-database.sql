/*
 * A NEW system (Gary, 2026-10-22): makes the KFDisplay database from nothing, with every table the register sends
 * (sales, menu with sizes, settings, Wix links, kitchen times) and the register_sync login the sync service uses.
 * For a PC that already has the old KFDisplay database use 01-03 (and 04-07, 10) instead; for one that already has
 * this schema there is nothing to do (it is safe to run again: only what is missing is created).
 *
 * KFIDisplay 2.0.8+ does the same by itself when it starts on this PC; this is for a system without KFIDisplay.
 * The tables are generated from KFIDisplay's DatabaseSetup.vb, so both always make the same ones.
 *
 * Before running: replace CHANGE_ME below with a strong password (it goes in the sync service's .env as
 * KFDISPLAY_PASSWORD, nowhere else). Run in SSMS as an administrator, or:
 *   sqlcmd -S .\SQLEXPRESS -E -b -i C:\Source\kfdisplay-sync\setup\00-new-database.sql
 * SQL Server must accept SQL logins (setup\09-allow-remote-display.ps1 turns that on, with TCP port 1433).
 */
USE [master];
IF DB_ID(N'KFDisplay') IS NULL
    CREATE DATABASE [KFDisplay];
GO

USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.categories (
        id          nvarchar(64)  NOT NULL PRIMARY KEY,
        name        nvarchar(200) NOT NULL,
        color       nvarchar(20)  NOT NULL,
        sort_order  int           NOT NULL DEFAULT 0,
        synced_at   datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.items', N'U') IS NULL
BEGIN
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
        description         nvarchar(1000) NULL,
        hide_on_kiosk       int           NOT NULL DEFAULT 0,
        allow_modifier_split int          NOT NULL DEFAULT 0,
        synced_at           datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX idx_items_category ON dbo.items(category_id);
END
GO

IF OBJECT_ID(N'dbo.item_variants', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_variants (
        id          nvarchar(128) NOT NULL PRIMARY KEY,
        item_id     nvarchar(64)  NOT NULL,
        name        nvarchar(200) NOT NULL,
        price       int           NOT NULL,
        sort_order  int           NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_item_variants_item ON dbo.item_variants(item_id);
END
GO

IF OBJECT_ID(N'dbo.modifier_groups', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.modifier_groups (
        id            nvarchar(64)  NOT NULL PRIMARY KEY,
        name          nvarchar(200) NOT NULL,
        required      int           NOT NULL DEFAULT 0,
        multi_select  int           NOT NULL DEFAULT 1,
        sort_order    int           NOT NULL DEFAULT 0,
        min_select    int           NOT NULL DEFAULT 0,
        max_select    int           NOT NULL DEFAULT 0,
        synced_at     datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.modifier_options', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.modifier_options (
        id           nvarchar(64)  NOT NULL PRIMARY KEY,
        group_id     nvarchar(64)  NOT NULL,
        name         nvarchar(200) NOT NULL,
        price_delta  int           NOT NULL DEFAULT 0,
        sort_order   int           NOT NULL DEFAULT 0,
        default_on   int           NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_options_group ON dbo.modifier_options(group_id);
END
GO

IF OBJECT_ID(N'dbo.item_modifier_groups', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.item_modifier_groups (
        item_id     nvarchar(64) NOT NULL,
        group_id    nvarchar(64) NOT NULL,
        sort_order  int          NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, group_id)
    );
END
GO

IF OBJECT_ID(N'dbo.discounts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.discounts (
        id         nvarchar(64)  NOT NULL PRIMARY KEY,
        name       nvarchar(200) NOT NULL,
        type       nvarchar(10)  NOT NULL CHECK (type IN (N'percent', N'amount')),
        value      float         NOT NULL DEFAULT 0,
        starts_on  nvarchar(10)  NULL,
        ends_on    nvarchar(10)  NULL,
        synced_at  datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.auto_discounts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.auto_discounts (
        id          nvarchar(64)  NOT NULL PRIMARY KEY,
        name        nvarchar(200) NOT NULL,
        type        nvarchar(10)  NOT NULL CHECK (type IN (N'percent', N'amount')),
        value       float         NOT NULL DEFAULT 0,
        active      int           NOT NULL DEFAULT 1,
        sort_order  int           NOT NULL DEFAULT 0,
        starts_on   nvarchar(10)  NULL,
        ends_on     nvarchar(10)  NULL,
        sale_price  int           NULL,
        schedule    nvarchar(max) NULL,
        conditions  nvarchar(max) NULL,
        synced_at   datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.auto_discount_targets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.auto_discount_targets (
        discount_id  nvarchar(64) NOT NULL,
        target_type  nvarchar(10) NOT NULL CHECK (target_type IN (N'item', N'category')),
        target_id    nvarchar(64) NOT NULL,
        PRIMARY KEY (discount_id, target_type, target_id)
    );
END
GO

IF OBJECT_ID(N'dbo.shifts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.shifts (
        id             nvarchar(64)   NOT NULL PRIMARY KEY,
        opened_at      datetime2(3)   NOT NULL,
        starting_cash  int            NOT NULL DEFAULT 0,
        closed_at      datetime2(3)   NULL,
        counted_cash   int            NULL,
        over_short     int            NULL,
        note           nvarchar(1000) NULL,
        prepaid        int            NOT NULL DEFAULT 0,
        synced_at      datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
BEGIN
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
        register_id      nvarchar(64)   NULL,
        delivery_fee     int            NOT NULL DEFAULT 0,
        customer_id      nvarchar(64)   NULL,
        delivery_phone   nvarchar(200)  NULL,
        delivery_address nvarchar(1000) NULL,
        delivery_notes   nvarchar(1000) NULL,
        server_id        nvarchar(64)   NULL,
        server_name      nvarchar(200)  NULL,
        driver_id        nvarchar(64)   NULL,
        driver_name      nvarchar(200)  NULL,
        delivered_at     datetime2(3)   NULL,
        order_up_at      datetime2(3)   NULL,
        paged_at         datetime2(3)   NULL,
        completed_at     datetime2(3)   NULL,
        synced_at        datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX idx_orders_created ON dbo.orders(created_at);
END
GO

IF OBJECT_ID(N'dbo.order_lines', N'U') IS NULL
BEGIN
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
END
GO

IF OBJECT_ID(N'dbo.order_line_modifiers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.order_line_modifiers (
        id           int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        line_uid     nvarchar(64)  NOT NULL REFERENCES dbo.order_lines(uid) ON DELETE CASCADE,
        group_id     nvarchar(64)  NOT NULL,
        group_name   nvarchar(200) NOT NULL,
        option_id    nvarchar(64)  NOT NULL,
        option_name  nvarchar(200) NOT NULL,
        price_delta  int           NOT NULL DEFAULT 0,
        half         int           NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_linemods_line ON dbo.order_line_modifiers(line_uid);
END
GO

IF OBJECT_ID(N'dbo.register_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.register_settings (
        register_id    nvarchar(64)  NOT NULL PRIMARY KEY,
        register_name  nvarchar(50)  NULL,
        settings       nvarchar(max) NOT NULL,
        synced_at      datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.register_wix_links', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.register_wix_links (
        id           int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        register_id  nvarchar(64)   NOT NULL,
        kind         nvarchar(20)   NOT NULL,
        wix_id       nvarchar(200)  NOT NULL,
        local_id     nvarchar(64)   NOT NULL,
        image_url    nvarchar(1000) NULL
    );
    CREATE INDEX idx_wix_links_register ON dbo.register_wix_links(register_id);
END
GO

IF OBJECT_ID(N'dbo.menus', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.menus (
        id          nvarchar(64)   NOT NULL PRIMARY KEY,
        name        nvarchar(200)  NOT NULL,
        visible     int            NOT NULL DEFAULT 1,
        sort_order  int            NOT NULL DEFAULT 0,
        synced_at   datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.menu_categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.menu_categories (
        menu_id      nvarchar(64)  NOT NULL,
        category_id  nvarchar(64)  NOT NULL,
        sort_order   int           NOT NULL DEFAULT 0,
        PRIMARY KEY (menu_id, category_id)
    );
END
GO

IF OBJECT_ID(N'dbo.menu_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.menu_items (
        menu_id  nvarchar(64)  NOT NULL,
        item_id  nvarchar(64)  NOT NULL,
        PRIMARY KEY (menu_id, item_id)
    );
END
GO

IF OBJECT_ID(N'dbo.board_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.board_settings (
        name        nvarchar(64)   NOT NULL PRIMARY KEY,
        value       nvarchar(max)  NULL,
        updated_at  datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.servers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.servers (
        id          nvarchar(64)   NOT NULL PRIMARY KEY,
        name        nvarchar(200)  NOT NULL,
        pin_hash    nvarchar(200)  NOT NULL,
        active      int            NOT NULL DEFAULT 1,
        created_at  nvarchar(200)  NULL,
        updated_at  nvarchar(200)  NULL,
        deleted_at  nvarchar(200)  NULL,
        synced_at   datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.drivers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.drivers (
        id            nvarchar(64)   NOT NULL PRIMARY KEY,
        name          nvarchar(200)  NOT NULL,
        email         nvarchar(200)  NULL,
        phone         nvarchar(200)  NULL,
        active        int            NOT NULL DEFAULT 1,
        has_password  int            NOT NULL DEFAULT 0,
        created_at    nvarchar(200)  NULL,
        updated_at    nvarchar(200)  NULL,
        synced_at     datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.driver_deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.driver_deliveries (
        id             nvarchar(64)   NOT NULL PRIMARY KEY,
        wix_number     nvarchar(200)  NULL,
        order_id       nvarchar(64)   NULL,
        driver_id      nvarchar(64)   NOT NULL,
        driver_name    nvarchar(200)  NULL,
        delivered_at   datetime2(3)   NULL,
        customer_name  nvarchar(200)  NULL,
        address        nvarchar(1000) NULL,
        total          int            NOT NULL DEFAULT 0,
        tip            int            NOT NULL DEFAULT 0,
        miles          float          NULL,
        synced_at      datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.customers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.customers (
        id          nvarchar(64)   NOT NULL PRIMARY KEY,
        name        nvarchar(200)  NOT NULL,
        phone       nvarchar(200)  NULL,
        address     nvarchar(1000) NULL,
        notes       nvarchar(1000) NULL,
        created_at  nvarchar(200)  NULL,
        updated_at  nvarchar(200)  NULL,
        deleted_at  nvarchar(200)  NULL,
        synced_at   datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.open_tickets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.open_tickets (
        id             nvarchar(64)   NOT NULL PRIMARY KEY,
        number         int            NOT NULL,
        table_no       nvarchar(200)  NULL,
        created_at     datetime2(3)   NOT NULL,
        updated_at     datetime2(3)   NOT NULL,
        register_id    nvarchar(64)   NOT NULL,
        shift_id       nvarchar(64)   NOT NULL,
        customer_name  nvarchar(200)  NULL,
        data           nvarchar(max)  NOT NULL,
        status         nvarchar(200)  NOT NULL DEFAULT 'open'
    );
END
GO

IF OBJECT_ID(N'dbo.order_payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.order_payments (
        order_id       nvarchar(64)  NOT NULL,
        seq            int           NOT NULL,
        tender         nvarchar(200) NOT NULL,
        amount         int           NOT NULL,
        tip            int           NOT NULL DEFAULT 0,
        tendered       int           NULL,
        change_due     int           NULL,
        card_brand     nvarchar(200) NULL,
        last4          nvarchar(200) NULL,
        processor      nvarchar(200) NULL,
        processor_ref  nvarchar(200) NULL,
        reference_id   nvarchar(200) NULL,
        PRIMARY KEY (order_id, seq)
    );
END
GO

IF OBJECT_ID(N'dbo.coupons', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.coupons (
        id            nvarchar(64)  NOT NULL PRIMARY KEY,
        code          nvarchar(200) NOT NULL,
        name          nvarchar(200) NOT NULL,
        type          nvarchar(200) NOT NULL,
        value         float         NOT NULL DEFAULT 0,
        buy_qty       int           NULL,
        get_qty       int           NULL,
        min_subtotal  int           NULL,
        one_item      int           NOT NULL DEFAULT 0,
        starts_on     nvarchar(200) NULL,
        ends_on       nvarchar(200) NULL,
        active        int           NOT NULL DEFAULT 1,
        sort_order    int           NOT NULL DEFAULT 0,
        synced_at     datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID(N'dbo.coupon_targets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.coupon_targets (
        coupon_id    nvarchar(64)  NOT NULL,
        target_type  nvarchar(200) NOT NULL,
        target_id    nvarchar(64)  NOT NULL,
        PRIMARY KEY (coupon_id, target_type, target_id)
    );
END
GO

USE [master];
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'register_sync')
    CREATE LOGIN register_sync WITH PASSWORD = N'CHANGE_ME', CHECK_POLICY = ON, DEFAULT_DATABASE = [KFDisplay];
GO

USE [KFDisplay];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    CREATE USER register_sync FOR LOGIN register_sync;
GO

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.categories TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.items TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.item_variants TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.modifier_groups TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.modifier_options TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.item_modifier_groups TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.discounts TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.auto_discounts TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.auto_discount_targets TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.shifts TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.orders TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.order_lines TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.order_line_modifiers TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.register_settings TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.register_wix_links TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.open_tickets TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.order_payments TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.coupons TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.coupon_targets TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.customers TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.menus TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.menu_categories TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.menu_items TO register_sync;
GRANT SELECT, INSERT, UPDATE ON dbo.board_settings TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.servers TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.drivers TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.driver_deliveries TO register_sync;
GO

PRINT N'KFDisplay is ready: 27 tables, and register_sync can read and write them (nothing else).';
