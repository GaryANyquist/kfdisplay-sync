/*
 * Wix menus on the PC (register 2.9.11, Gary 2026-10-26): KFIDisplay can show one menu on the board. The registers
 * send every Wix menu whole (entity menus): each menu, its categories in order, and its items.
 * Lets register_sync write them and kfidisplay_read read them.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.18+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\19-menus.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.menus', N'U') IS NULL
    CREATE TABLE dbo.menus (
        id          nvarchar(64)   NOT NULL PRIMARY KEY,
        name        nvarchar(200)  NOT NULL,
        visible     int            NOT NULL DEFAULT 1,
        sort_order  int            NOT NULL DEFAULT 0,
        synced_at   datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
GO

IF OBJECT_ID(N'dbo.menu_categories', N'U') IS NULL
    CREATE TABLE dbo.menu_categories (
        menu_id      nvarchar(64)  NOT NULL,
        category_id  nvarchar(64)  NOT NULL,
        sort_order   int           NOT NULL DEFAULT 0,
        PRIMARY KEY (menu_id, category_id)
    );
GO

IF OBJECT_ID(N'dbo.menu_items', N'U') IS NULL
    CREATE TABLE dbo.menu_items (
        menu_id  nvarchar(64)  NOT NULL,
        item_id  nvarchar(64)  NOT NULL,
        PRIMARY KEY (menu_id, item_id)
    );
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.menus TO register_sync;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.menu_categories TO register_sync;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.menu_items TO register_sync;
END
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
BEGIN
    GRANT SELECT ON dbo.menus TO kfidisplay_read;
    GRANT SELECT ON dbo.menu_categories TO kfidisplay_read;
    GRANT SELECT ON dbo.menu_items TO kfidisplay_read;
END
GO

PRINT N'menus, menu_categories and menu_items are there.';
