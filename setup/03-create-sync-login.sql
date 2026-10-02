/*
 * Step 3 of 3: the SQL login the sync service uses.
 *
 * It can read and write the register tables only: no other tables, no DDL,
 * no dropping anything. The read-only kfdisplay_ro login Claude uses is not
 * touched.
 *
 * Before running: replace CHANGE_ME below with a strong password (it goes in
 * the sync service's .env as KFDISPLAY_PASSWORD, nowhere else). Run in SSMS as
 * an administrator, after step 2. Safe to run again (it updates the password).
 */

USE [master];
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'register_sync')
    CREATE LOGIN register_sync WITH PASSWORD = N'CHANGE_ME', CHECK_POLICY = ON, DEFAULT_DATABASE = [KFDisplay];
ELSE
    ALTER LOGIN register_sync WITH PASSWORD = N'CHANGE_ME';
GO

USE [KFDisplay];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
    CREATE USER register_sync FOR LOGIN register_sync;
GO

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.categories           TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.items                TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.modifier_groups      TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.modifier_options     TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.item_modifier_groups TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.discounts            TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.auto_discounts       TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.auto_discount_targets TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.orders               TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.order_lines          TO register_sync;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.order_line_modifiers TO register_sync;
GO

PRINT N'register_sync can now write the register tables, and nothing else.';
