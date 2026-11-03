[CmdletBinding()]
param(
    [string]$RepositoryRoot = $PSScriptRoot,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$Source = Join-Path $RepoRoot "go-local.ps1"
if (-not (Test-Path -LiteralPath $Source)) {
    throw "go-local.ps1 was not found in $RepoRoot."
}

$localAppData = [string]$env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = Join-Path $HOME ".hypersync"
}
$binRoot = Join-Path $localAppData "HyperSync/bin"
New-Item -ItemType Directory -Path $binRoot -Force | Out-Null

$InstalledScript = Join-Path $binRoot "go-local.ps1"
Copy-Item -LiteralPath $Source -Destination $InstalledScript -Force

$escapedScript = $InstalledScript.Replace("'", "''")
$escapedRoot = $RepoRoot.Replace("'", "''")
$profilePath = $PROFILE.CurrentUserAllHosts
if ([string]::IsNullOrWhiteSpace([string]$profilePath)) {
    $profilePath = [string]$PROFILE
}
$profileDirectory = Split-Path -Parent $profilePath
if (-not (Test-Path -LiteralPath $profileDirectory)) {
    New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
}

$beginMarker = "# >>> HyperSync go-local command >>>"
$endMarker = "# <<< HyperSync go-local command <<<"
$profileBlock = @"
$beginMarker
function global:go-local {
    & '$escapedScript' -RepositoryRoot '$escapedRoot' @args
}
$endMarker
"@

$existing = ""
if (Test-Path -LiteralPath $profilePath) {
    $existing = Get-Content -LiteralPath $profilePath -Raw
}
$pattern = [regex]::Escape($beginMarker) + ".*?" + [regex]::Escape($endMarker)
if ([regex]::IsMatch($existing, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    $next = [regex]::Replace(
        $existing,
        $pattern,
        $profileBlock,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
}
else {
    $separator = if ([string]::IsNullOrEmpty($existing)) { "" } else { [Environment]::NewLine + [Environment]::NewLine }
    $next = $existing + $separator + $profileBlock + [Environment]::NewLine
}
if ($next -ne $existing) {
    Set-Content -LiteralPath $profilePath -Value $next -Encoding UTF8
}

$global:HyperSyncGoLocalScript = $InstalledScript
$global:HyperSyncRepositoryRoot = $RepoRoot
function global:go-local {
    & $global:HyperSyncGoLocalScript -RepositoryRoot $global:HyperSyncRepositoryRoot @args
}

$cmdPath = Join-Path $binRoot "go-local.cmd"
$cmd = @"
@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$InstalledScript" -RepositoryRoot "$RepoRoot" %*
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $cmdPath -Value $cmd -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$parts = @(([string]$userPath -split ";") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$hasBin = $false
foreach ($part in $parts) {
    if ([string]::Equals($part.TrimEnd("\"), $binRoot.TrimEnd("\"), [System.StringComparison]::OrdinalIgnoreCase)) {
        $hasBin = $true
        break
    }
}
if (-not $hasBin) {
    [Environment]::SetEnvironmentVariable("Path", (@($binRoot) + $parts) -join ";", "User")
}
if (-not (($env:Path -split ";") | Where-Object {
    [string]::Equals($_.TrimEnd("\"), $binRoot.TrimEnd("\"), [System.StringComparison]::OrdinalIgnoreCase)
})) {
    $env:Path = $binRoot + ";" + $env:Path
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "HyperSync 'go-local' command installed." -ForegroundColor Green
    Write-Host "Restart PowerShell or dot-source your profile to load the command."
    Write-Host "Use go-local to start the current working tree without updating Git."
}
