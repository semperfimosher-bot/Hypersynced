[CmdletBinding()]
param(
    [int]$FrontendPort = 4153,
    [int]$BackendPort = 8000,
    [switch]$NoBrowser,
    [switch]$SkipDependencies,
    [switch]$RunMigrations,
    [string]$RepositoryRoot = $PSScriptRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$GitRoot = & git -C $RepoRoot rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$GitRoot)) {
    throw "go-local must run inside a HyperSync Git checkout."
}
if (-not [string]::Equals(
    (Resolve-Path -LiteralPath ([string]$GitRoot)).Path,
    $RepoRoot,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "RepositoryRoot must point to the HyperSync repository root."
}

$StartupScript = Join-Path $RepoRoot "update-local.ps1"
if (-not (Test-Path -LiteralPath $StartupScript)) {
    throw "update-local.ps1 was not found. The local checkout is incomplete."
}
if ($FrontendPort -ne 4153 -or $BackendPort -ne 8000) {
    throw "HyperSync local ports are fixed to frontend 4153 and backend 8000."
}

Write-Host ""
Write-Host "=== HyperSync Local-Only Start ===" -ForegroundColor Cyan
Write-Host "Using the current working tree exactly as it is." -ForegroundColor Green
Write-Host "No fetch, pull, branch switch, reset, stash, or checkout will run." -ForegroundColor DarkGray
Write-Host "Database migrations: $(if ($RunMigrations) { 'enabled by request' } else { 'skipped' })" -ForegroundColor Yellow

$parameters = @{
    FrontendPort = $FrontendPort
    BackendPort = $BackendPort
    NoBrowser = $NoBrowser
    SkipDependencies = $SkipDependencies
    AfterGitUpdate = $true
}
if (-not $RunMigrations) {
    $parameters.SkipMigrations = $true
}

& $StartupScript @parameters
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "HyperSync local startup failed."
}
