/*
 * Recurring automatic discounts (register 2.7.0, Gary 2026-10-23): auto_discounts.schedule holds the weekdays and
 * times a discount is on, as JSON {"days":[{"day":4,"from":"15:49","to":"16:49"}]} (day 0 = Sunday, 24-hour times;
 * null = all day, every day).
 *
 * Run BEFORE starting the updated sync service. KFIDisplay 2.0.14+ does the same by itself when it starts on the
 * SQL Server PC. Safe to run again.
 *   sqlcmd -S tcp:localhost,1433 -E -b -i C:\Source\kfdisplay-sync\setup\15-discount-schedule.sql
 */
USE [KFDisplay];
GO

IF COL_LENGTH('dbo.auto_discounts', 'schedule') IS NULL
    ALTER TABLE dbo.auto_discounts ADD schedule nvarchar(max) NULL;
GO

PRINT N'auto_discounts.schedule is there.';
