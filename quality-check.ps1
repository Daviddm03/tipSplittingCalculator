param(
    [switch]$WithPostgres,
    [switch]$WithBrowser
)

$ErrorActionPreference = "Stop"
$originalAttendanceTests = $env:RUN_ATTENDANCE_PG_TESTS
$originalSettingsTests = $env:RUN_SETTINGS_PG_TESTS

function Assert-CommandSucceeded([string]$Check) {
    if ($LASTEXITCODE -ne 0) { throw "$Check failed (exit $LASTEXITCODE)." }
}

Push-Location $PSScriptRoot
try {
    if ($WithPostgres) {
        $env:RUN_ATTENDANCE_PG_TESTS = "1"
        $env:RUN_SETTINGS_PG_TESTS = "1"
    }

    $files = Get-ChildItem -LiteralPath src, server/src, tests -Recurse -File |
        Where-Object { $_.Extension -in ".js", ".cjs" }
    foreach ($file in $files) {
        & node --check $file.FullName
        Assert-CommandSucceeded "Syntax: $($file.FullName)"
    }
    Write-Host "Syntax: $($files.Count)/$($files.Count) passed."

    $frontendTests = @(Get-ChildItem -LiteralPath tests -Filter "*.test.cjs" -File | ForEach-Object { $_.FullName })
    & node --test @frontendTests
    Assert-CommandSucceeded "Frontend tests"

    $backendTests = @(Get-ChildItem -LiteralPath server/src/services, server/src/repositories -Filter "*.test.js" -File | ForEach-Object { $_.FullName })
    & node --test @backendTests
    Assert-CommandSucceeded "Backend tests"

    if ($WithBrowser) {
        & node tests/browser.cjs
        Assert-CommandSucceeded "Browser regressions"
        if ($WithPostgres) {
            & node tests/attendance-postgres-browser.cjs
            Assert-CommandSucceeded "PostgreSQL browser"
        }
    }

    & git diff --check
    Assert-CommandSucceeded "Whitespace check"
    Write-Host "Requested checks passed. Full QA requires -WithPostgres -WithBrowser."
} finally {
    $env:RUN_ATTENDANCE_PG_TESTS = $originalAttendanceTests
    $env:RUN_SETTINGS_PG_TESTS = $originalSettingsTests
    Pop-Location
}
