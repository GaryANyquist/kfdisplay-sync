/*
 * Drivers and servers (register 2.10.0, Gary 2026-10-27).
 *   servers            who logs in to a register with a PIN (only its hash), shared between registers like customers
 *                      (deleted ones marked with deleted_at; POST /v1/servers)
 *   drivers            delivery drivers as the Wix site keeps them (the site signs them in; no passwords here)
 *   driver_deliveries  who delivered each order (from the Wix site's driver page), for the driver report
 *   orders             server_id/server_name (who rang the sale up) and driver_id/driver_name/delivered_at
 * Lets register_sync write them and kfidisplay_read read them.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.23+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\21-drivers-servers.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.servers', N'U') IS NULL
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
GO

IF OBJECT_ID(N'dbo.drivers', N'U') IS NULL
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
GO

IF OBJECT_ID(N'dbo.driver_deliveries', N'U') IS NULL
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
GO

IF COL_LENGTH('dbo.orders', 'server_id') IS NULL
    ALTER TABLE dbo.orders ADD server_id nvarchar(64) NULL;
IF COL_LENGTH('dbo.orders', 'server_name') IS NULL
    ALTER TABLE dbo.orders ADD server_name nvarchar(200) NULL;
IF COL_LENGTH('dbo.orders', 'driver_id') IS NULL
    ALTER TABLE dbo.orders ADD driver_id nvarchar(64) NULL;
IF COL_LENGTH('dbo.orders', 'driver_name') IS NULL
    ALTER TABLE dbo.orders ADD driver_name nvarchar(200) NULL;
IF COL_LENGTH('dbo.orders', 'delivered_at') IS NULL
    ALTER TABLE dbo.orders ADD delivered_at datetime2(3) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.servers TO register_sync;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.drivers TO register_sync;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.driver_deliveries TO register_sync;
END
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
BEGIN
    GRANT SELECT ON dbo.drivers TO kfidisplay_read;
    GRANT SELECT ON dbo.driver_deliveries TO kfidisplay_read;
END
GO

PRINT N'servers, drivers, driver_deliveries and the server and driver columns on orders are there.';
