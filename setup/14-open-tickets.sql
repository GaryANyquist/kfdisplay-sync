/*
 * Pay later (register 2.6.0, Gary 2026-10-23): orders sent to the kitchen and paid later. Every register's open
 * tickets are kept here so any register can print the check and take payment. data is the register's JSON (lines,
 * discount, coupon, what the kitchen has had). Lets register_sync write them.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.13+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\14-open-tickets.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.open_tickets', N'U') IS NULL
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
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.open_tickets TO register_sync;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
    GRANT SELECT ON dbo.open_tickets TO kfidisplay_read;
GO

PRINT N'open_tickets is there.';
