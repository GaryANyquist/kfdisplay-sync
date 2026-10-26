/*
 * Customers shared between registers (register 2.9.2, Gary 2026-10-26): a customer deleted on one register is marked
 * with deleted_at instead of being removed, so the other registers drop it too when they read the list
 * (POST /v1/customers).
 *
 * Run BEFORE starting the updated sync service (after 17). KFIDisplay 2.0.17+ does the same by itself when it starts
 * on the SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\18-shared-customers.sql
 */
USE [KFDisplay];
GO

IF COL_LENGTH('dbo.customers', 'deleted_at') IS NULL
    ALTER TABLE dbo.customers ADD deleted_at nvarchar(200) NULL;
GO

PRINT N'customers.deleted_at is there.';
