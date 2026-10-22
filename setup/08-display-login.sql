/*
 * Optional, only when KFIDisplay (the menu board) runs on a different PC from SQL Server
 * (Gary, 2026-10-22). The SQL login KFIDisplay uses from that PC.
 *
 * It can only READ what the menu board shows: the menu, today's automatic discounts and the drawers
 * (for prepaid events). No sales, no writing anything. When KFIDisplay runs on this PC it keeps using
 * Windows sign-in and doesn't need this.
 *
 * Before running: replace CHANGE_ME below with a strong password (it goes in C:\KFDisplay\display.ini
 * on the KFIDisplay PC as SqlPassword, nowhere else). Run in SSMS as an administrator, after step 2.
 * Safe to run again (it updates the password).
 */

USE [master];
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'kfidisplay_read')
    CREATE LOGIN kfidisplay_read WITH PASSWORD = N'CHANGE_ME', CHECK_POLICY = ON, DEFAULT_DATABASE = [KFDisplay];
ELSE
    ALTER LOGIN kfidisplay_read WITH PASSWORD = N'CHANGE_ME';
GO

USE [KFDisplay];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kfidisplay_read')
    CREATE USER kfidisplay_read FOR LOGIN kfidisplay_read;
GO

GRANT SELECT ON dbo.categories            TO kfidisplay_read;
GRANT SELECT ON dbo.items                 TO kfidisplay_read;
GRANT SELECT ON dbo.modifier_groups       TO kfidisplay_read;
GRANT SELECT ON dbo.modifier_options      TO kfidisplay_read;
GRANT SELECT ON dbo.item_modifier_groups  TO kfidisplay_read;
GRANT SELECT ON dbo.auto_discounts        TO kfidisplay_read;
GRANT SELECT ON dbo.auto_discount_targets TO kfidisplay_read;
GRANT SELECT ON dbo.shifts                TO kfidisplay_read;
GO

PRINT N'kfidisplay_read can now read the menu board''s tables, and nothing else.';
