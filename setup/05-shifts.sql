/*
 * Drawers (shifts), including whether each was a prepaid event.
 *
 * Only needed if you ran 02-replace-schema.sql BEFORE this file existed.
 * A fresh setup (01, 02, 03) already has the shifts table; running this
 * anyway is harmless. No rows are changed.
 *
 * orders.shift_id points to shifts.id, so a sale's drawer, and whether it was
 * a prepaid event, is:
 *   SELECT o.*, s.prepaid FROM dbo.orders o LEFT JOIN dbo.shifts s ON s.id = o.shift_id;
 *
 * Run in SSMS as an administrator.
 */

USE [KFDisplay];

IF OBJECT_ID(N'dbo.shifts', N'U') IS NULL
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
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.shifts TO register_sync;
GO

PRINT N'Drawers (shifts) are ready in KFDisplay.';
