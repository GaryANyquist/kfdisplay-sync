/*
 * Automatic discounts and discount date ranges (register app v11 schema).
 *
 * Only needed if you ran 02-replace-schema.sql BEFORE this file existed.
 * A fresh setup (01, 02, 03) already has all of this; running this anyway
 * is harmless: every step checks first. No rows are changed.
 *
 * Run in SSMS as an administrator.
 */

USE [KFDisplay];
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.discounts', N'starts_on') IS NULL
    ALTER TABLE dbo.discounts ADD starts_on nvarchar(10) NULL, ends_on nvarchar(10) NULL;

IF COL_LENGTH(N'dbo.order_lines', N'auto_discount_id') IS NULL
    ALTER TABLE dbo.order_lines ADD
        auto_discount_id     nvarchar(64)  NULL,
        auto_discount_name   nvarchar(200) NULL,
        auto_discount_type   nvarchar(10)  NULL,
        auto_discount_value  float         NULL,
        auto_discount_amount int           NOT NULL CONSTRAINT df_order_lines_auto_amount DEFAULT 0;

IF OBJECT_ID(N'dbo.auto_discounts', N'U') IS NULL
    CREATE TABLE dbo.auto_discounts (
        id          nvarchar(64)  NOT NULL PRIMARY KEY,
        name        nvarchar(200) NOT NULL,
        type        nvarchar(10)  NOT NULL CHECK (type IN (N'percent', N'amount')),
        value       float         NOT NULL DEFAULT 0,
        active      int           NOT NULL DEFAULT 1,
        sort_order  int           NOT NULL DEFAULT 0,
        starts_on   nvarchar(10)  NULL,
        ends_on     nvarchar(10)  NULL,
        synced_at   datetime2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
    );

IF OBJECT_ID(N'dbo.auto_discount_targets', N'U') IS NULL
    CREATE TABLE dbo.auto_discount_targets (
        discount_id  nvarchar(64) NOT NULL,
        target_type  nvarchar(10) NOT NULL CHECK (target_type IN (N'item', N'category')),
        target_id    nvarchar(64) NOT NULL,
        PRIMARY KEY (discount_id, target_type, target_id)
    );

COMMIT TRANSACTION;
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'register_sync')
BEGIN
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.auto_discounts        TO register_sync;
    GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.auto_discount_targets TO register_sync;
END
GO

PRINT N'Automatic discounts are ready in KFDisplay.';
