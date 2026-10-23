/*
 * Split payments (register 2.5.1, Gary 2026-10-23): a sale paid several ways has orders.tender = 'split' and one row
 * here per payment, in the order taken. Lets register_sync write them.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.12+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\13-split-payments.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.order_payments', N'U') IS NULL
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
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.order_payments TO register_sync;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
    GRANT SELECT ON dbo.order_payments TO kfidisplay_read;
GO

PRINT N'order_payments is there.';
