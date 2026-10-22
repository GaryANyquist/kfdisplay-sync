/*
 * Everything the register keeps (Gary, 2026-10-22: "the sync service should be syncing everything on the cash
 * register's database"). Adds what the tablet gained after setup 02-07:
 *
 *   items.hide_on_kiosk, items.allow_modifier_split      (Kiosk mode, half-and-half items)
 *   modifier_groups.min_select / max_select               (how many options may be chosen)
 *   order_line_modifiers.half                             (1st / 2nd half; 0 = the whole item)
 *   item_variants                                         (sizes, each with its own price)
 *   register_settings                                     (each register's settings, as JSON; never keys)
 *   register_wix_links                                    (each register's tablet id <-> Wix id records)
 * and lets register_sync write them. Kitchen ready/done times go into orders.order_up_at / completed_at, which
 * register_sync can already write.
 *
 * KFIDisplay 2.0.8+ does the same by itself when it starts on the SQL Server PC; run this in SSMS when KFIDisplay
 * runs on another PC (or to do it now). Safe to run again: it only adds what is missing.
 */
USE [KFDisplay];
GO

IF COL_LENGTH('dbo.items', 'hide_on_kiosk') IS NULL
    ALTER TABLE dbo.items ADD hide_on_kiosk int NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.items', 'allow_modifier_split') IS NULL
    ALTER TABLE dbo.items ADD allow_modifier_split int NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.modifier_groups', 'min_select') IS NULL
    ALTER TABLE dbo.modifier_groups ADD min_select int NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.modifier_groups', 'max_select') IS NULL
    ALTER TABLE dbo.modifier_groups ADD max_select int NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.order_line_modifiers', 'half') IS NULL
    ALTER TABLE dbo.order_line_modifiers ADD half int NOT NULL DEFAULT 0;
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
IF OBJECT_ID(N'dbo.register_settings', N'U') IS NULL
    CREATE TABLE dbo.register_settings (
        register_id    nvarchar(64)  NOT NULL PRIMARY KEY,
        register_name  nvarchar(50)  NULL,
        settings       nvarchar(max) NOT NULL,
        synced_at      datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );
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

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.item_variants      TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.register_settings  TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.register_wix_links TO register_sync;
-- The menu board's read-only login (setup 08), if it has been made: sizes for the second price.
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
    GRANT SELECT ON dbo.item_variants TO kfidisplay_read;
GO

PRINT N'KFDisplay now has room for everything the register sends.';
