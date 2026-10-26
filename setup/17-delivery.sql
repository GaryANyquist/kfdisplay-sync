/*
 * Delivery orders (register 2.9.0, Gary 2026-10-26): Settings → Register → Allow delivery. Saved delivery customers
 * (dbo.customers) and, on each delivery sale, where it went and its fee (not taxed; in total, not in subtotal).
 * Lets register_sync write customers.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.16+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\17-delivery.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.customers', N'U') IS NULL
    CREATE TABLE dbo.customers (
        id          nvarchar(64)   NOT NULL PRIMARY KEY,
        name        nvarchar(200)  NOT NULL,
        phone       nvarchar(200)  NULL,
        address     nvarchar(1000) NULL,
        notes       nvarchar(1000) NULL,
        created_at  nvarchar(200)  NULL,
        updated_at  nvarchar(200)  NULL,
        synced_at   datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
GO

IF COL_LENGTH('dbo.orders', 'delivery_fee') IS NULL
    ALTER TABLE dbo.orders ADD delivery_fee int NOT NULL CONSTRAINT df_orders_delivery_fee DEFAULT 0;
IF COL_LENGTH('dbo.orders', 'customer_id') IS NULL
    ALTER TABLE dbo.orders ADD customer_id nvarchar(64) NULL;
IF COL_LENGTH('dbo.orders', 'delivery_phone') IS NULL
    ALTER TABLE dbo.orders ADD delivery_phone nvarchar(200) NULL;
IF COL_LENGTH('dbo.orders', 'delivery_address') IS NULL
    ALTER TABLE dbo.orders ADD delivery_address nvarchar(1000) NULL;
IF COL_LENGTH('dbo.orders', 'delivery_notes') IS NULL
    ALTER TABLE dbo.orders ADD delivery_notes nvarchar(1000) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.customers TO register_sync;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
    GRANT SELECT ON dbo.customers TO kfidisplay_read;
GO

PRINT N'customers and the delivery columns on orders are there.';
