/*
 * Sale-price automatic discounts (register app 2.0.4, tablet schema v15).
 *
 * Wix's "sale price" discounts (an item sells for $3.00) come to the register
 * with the menu sync. auto_discounts.type stays percent/amount; a sale price is
 * kept in this column instead (type 'amount', value 0, sale_price in cents).
 * The KFIDisplay menu board shows it once this column exists.
 *
 * Only needed if you ran 02-replace-schema.sql BEFORE this file existed.
 * A fresh setup (01, 02, 03) already has the column; running this anyway is
 * harmless. No rows are changed.
 *
 * Run in SSMS as an administrator, then restart the sync service (the
 * "KFDisplay sync" scheduled task) and tap Settings -> KFDisplay sync ->
 * Send everything again on the tablet.
 */

USE [KFDisplay];

IF COL_LENGTH(N'dbo.auto_discounts', N'sale_price') IS NULL
    ALTER TABLE dbo.auto_discounts ADD sale_price int NULL;
GO

PRINT N'Sale-price discounts are ready in KFDisplay.';
