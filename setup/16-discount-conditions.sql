/*
 * Conditions on automatic discounts (register 2.8.0, Gary 2026-10-26): auto_discounts.conditions holds, as JSON, a
 * minimum quantity {"minQty":3}, a minimum order in cents {"minSubtotal":2000}, or Buy X get Y
 * {"buyQty":1,"getQty":1,"buyItemIds":[...]} (null = applies every time).
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.15+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\16-discount-conditions.sql
 */
USE [KFDisplay];
GO

IF COL_LENGTH('dbo.auto_discounts', 'conditions') IS NULL
    ALTER TABLE dbo.auto_discounts ADD conditions nvarchar(max) NULL;
GO

PRINT N'auto_discounts.conditions is there.';
