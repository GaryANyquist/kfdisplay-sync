/*
 * Coupons (register 2.5.0, Gary 2026-10-23): made on a register or copied from Wix, with the items and categories
 * each covers. Lets register_sync write them. A sale keeps its coupon as its order discount, so orders need nothing.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.11+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\12-coupons.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.coupons', N'U') IS NULL
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
IF OBJECT_ID(N'dbo.coupon_targets', N'U') IS NULL
    CREATE TABLE dbo.coupon_targets (
        coupon_id    nvarchar(64)  NOT NULL,
        target_type  nvarchar(200) NOT NULL,
        target_id    nvarchar(64)  NOT NULL,
        PRIMARY KEY (coupon_id, target_type, target_id)
    );
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.coupons TO register_sync;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.coupon_targets TO register_sync;
END
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
BEGIN
    GRANT SELECT ON dbo.coupons TO kfidisplay_read;
    GRANT SELECT ON dbo.coupon_targets TO kfidisplay_read;
END
GO

PRINT N'Coupons tables are there.';
