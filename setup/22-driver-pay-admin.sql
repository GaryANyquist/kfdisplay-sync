/*
 * Pay per driver and administrators (register 2.10.1, Gary 2026-10-27).
 *   drivers.pay_per_delivery, pay_per_mile (cents) and pay_tips: each driver's own pay (kept on the Wix site with them)
 *   servers.admin: an administrator sees Drivers, Servers and Settings on the registers
 *
 * Run BEFORE starting the updated sync service (after 21). KFIDisplay 2.0.24+ does the same by itself when it starts
 * on the SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\22-driver-pay-admin.sql
 */
USE [KFDisplay];
GO

IF COL_LENGTH('dbo.drivers', 'pay_per_delivery') IS NULL
    ALTER TABLE dbo.drivers ADD pay_per_delivery int NOT NULL CONSTRAINT df_drivers_pay_per_delivery DEFAULT 0;
IF COL_LENGTH('dbo.drivers', 'pay_per_mile') IS NULL
    ALTER TABLE dbo.drivers ADD pay_per_mile int NOT NULL CONSTRAINT df_drivers_pay_per_mile DEFAULT 0;
IF COL_LENGTH('dbo.drivers', 'pay_tips') IS NULL
    ALTER TABLE dbo.drivers ADD pay_tips int NOT NULL CONSTRAINT df_drivers_pay_tips DEFAULT 1;
IF COL_LENGTH('dbo.servers', 'admin') IS NULL
    ALTER TABLE dbo.servers ADD admin int NOT NULL CONSTRAINT df_servers_admin DEFAULT 0;
GO

PRINT N'drivers pay and servers.admin are there.';
