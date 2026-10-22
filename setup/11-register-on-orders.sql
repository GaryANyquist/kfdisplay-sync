/*
 * Every register's sales in the reports (Gary, 2026-10-22; register 2.4.15, this service's /v1/orders/search).
 * Each sale says which register took it: orders.register_id (the register's own id, as in register_settings).
 * register_sync can already write orders.
 *
 * Run BEFORE starting the updated sync service: it writes register_id with every sale.
 * KFIDisplay 2.0.10+ does the same by itself when it starts on the SQL Server PC. Safe to run again.
 *   sqlcmd -S .\SQLEXPRESS -E -b -i C:\Source\kfdisplay-sync\setup\11-register-on-orders.sql
 */
USE [KFDisplay];
GO

IF COL_LENGTH('dbo.orders', 'register_id') IS NULL
    ALTER TABLE dbo.orders ADD register_id nvarchar(64) NULL;
GO

PRINT N'orders.register_id is there.';
