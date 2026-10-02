/*
 * Item descriptions, for the KFDisplay app (menu board).
 *
 * Only needed if you ran 02-replace-schema.sql BEFORE this file existed.
 * A fresh setup (01, 02, 03) already has the column; running this anyway is
 * harmless. No rows are changed. Descriptions are edited on the tablet
 * (Items -> Edit item -> Description) and arrive with the next sync.
 *
 * Run in SSMS as an administrator.
 */

USE [KFDisplay];

IF COL_LENGTH(N'dbo.items', N'description') IS NULL
    ALTER TABLE dbo.items ADD description nvarchar(1000) NULL;
GO

PRINT N'Item descriptions are ready in KFDisplay.';
