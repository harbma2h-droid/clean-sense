# Starts the TEST environment on this PC: the system on http://localhost:3100, using the local
# staging database (fake data only). Settings come from a private file outside the project
# (default D:\dev\staging.env: STAGING_DB_URL, STAGING_SESSION_SECRET).
param([string]$EnvFile = 'D:\dev\staging.env')

$env:Path = "C:\Program Files\nodejs;$env:Path"
Get-Content $EnvFile | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v }
if ($env:STAGING_DB_URL -notmatch 'staging|test') { throw 'STAGING_DB_URL must point at a staging or test database' }
if (-not $env:STAGING_SESSION_SECRET) {
  $env:STAGING_SESSION_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  Add-Content $EnvFile "STAGING_SESSION_SECRET=$($env:STAGING_SESSION_SECRET)"
}
$env:STORE = 'mysql'
$env:DATABASE_URL = $env:STAGING_DB_URL
$env:SESSION_SECRET = $env:STAGING_SESSION_SECRET
$env:NODE_ENV = 'development'
$env:PORT = '3100'
$env:BACKUP_DIR = 'D:\dev\staging-backups'
Remove-Item env:CONFIG_FILE -ErrorAction SilentlyContinue
Set-Location (Join-Path $PSScriptRoot '..\..\dashboard')
node server/index.js
