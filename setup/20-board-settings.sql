/*
 * The menu board's settings on the PC (register 2.9.12, Gary 2026-10-26: change the board's menu from a register).
 * One row, name 'menu': the Wix menu (menus.id) KFIDisplay shows, or '' for all menus. The registers set it through the
 * sync service (POST /v1/board/menu); KFIDisplay reads it on every refresh. Lets register_sync read and write it and
 * kfidisplay_read read it.
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.19+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\20-board-settings.sql
 */
USE [KFDisplay];
GO

IF OBJECT_ID(N'dbo.board_settings', N'U') IS NULL
    CREATE TABLE dbo.board_settings (
        name        nvarchar(64)   NOT NULL PRIMARY KEY,
        value       nvarchar(max)  NULL,
        updated_at  datetime2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    GRANT SELECT, INSERT, UPDATE ON dbo.board_settings TO register_sync;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
    GRANT SELECT ON dbo.board_settings TO kfidisplay_read;
GO

PRINT N'board_settings is there.';
