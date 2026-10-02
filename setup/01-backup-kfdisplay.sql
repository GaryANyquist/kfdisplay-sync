/*
 * Step 1 of 3: a full, verified backup of KFDisplay before anything changes.
 *
 * Run in SQL Server Management Studio, connected to .\SQLEXPRESS with an
 * administrator login (Windows authentication is fine). Safe to run more than
 * once; each run writes a new dated file.
 *
 * The file goes in SQL Server's own backup folder (the SQL Server service
 * account can always write there). The Messages tab prints the full path.
 * Copy that file somewhere off this PC too (USB stick, OneDrive).
 *
 * To undo the whole change later:
 *   RESTORE DATABASE [KFDisplay] FROM DISK = N'<that path>' WITH REPLACE;
 */

USE [master];

DECLARE @dir  nvarchar(4000);
DECLARE @file nvarchar(4000);

EXEC master.dbo.xp_instance_regread
     N'HKEY_LOCAL_MACHINE',
     N'Software\Microsoft\MSSQLServer\MSSQLServer',
     N'BackupDirectory',
     @dir OUTPUT;

SET @file = @dir + N'\KFDisplay-before-register-sync-'
          + CONVERT(nvarchar(8), GETDATE(), 112) + N'-'
          + REPLACE(CONVERT(nvarchar(8), GETDATE(), 108), N':', N'') + N'.bak';

BACKUP DATABASE [KFDisplay]
    TO DISK = @file
    WITH COPY_ONLY, INIT, CHECKSUM,
         NAME = N'KFDisplay before the register sync schema';

RESTORE VERIFYONLY FROM DISK = @file WITH CHECKSUM;

PRINT N'Backup written and verified: ' + @file;
