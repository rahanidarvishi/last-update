# backup-data.ps1
# Runs backup-db.js to take a consistent snapshot of data\darvishi.db into a
# timestamped file inside a backups folder. Safe to run while the server is
# running (uses SQLite's own online backup API, not a raw file copy).
# Run this manually, or schedule it (see instructions in chat) to run daily.
#
# Edit these two paths if your project or backup folder is somewhere else:
$ProjectDir = "C:\darvishi-crm"
$BackupDir  = "C:\darvishi-crm-backups"

$Timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$DestFile   = Join-Path $BackupDir "darvishi-$Timestamp.db"

if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Push-Location $ProjectDir
node backup-db.js "$DestFile"
Pop-Location

# Keep only the last 30 backups so the folder doesn't grow forever.
Get-ChildItem -Path $BackupDir -Filter "darvishi-*.db" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30 |
    Remove-Item -Force
