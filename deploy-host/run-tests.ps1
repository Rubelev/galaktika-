# Прогон всех тестов: синтаксис JS, юнит-тесты модулей, сквозные тесты живого сайта.
$ErrorActionPreference = 'Continue'
$node = 'D:\Users\a.bulatov\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$py   = 'D:\Users\a.bulatov\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$root = Split-Path -Parent $PSScriptRoot
$js   = Join-Path $root 'src\galaktika.Web\wwwroot\js'

Write-Host '=== синтаксис JS ===' -ForegroundColor Cyan
Get-ChildItem $js -Filter *.js | ForEach-Object {
    & $node --check $_.FullName
    if ($LASTEXITCODE -ne 0) { Write-Host ("ОШИБКА: " + $_.Name) -ForegroundColor Red } else { Write-Host ("ok " + $_.Name) }
}

Write-Host '=== юнит-тесты ===' -ForegroundColor Cyan
& $node (Join-Path $PSScriptRoot 'test_colony.cjs') (Join-Path $js 'colony.js')
& $node (Join-Path $PSScriptRoot 'test_ranks.cjs')  (Join-Path $js 'ranks.js')
& $node (Join-Path $PSScriptRoot 'test_market.cjs') (Join-Path $js 'market.js')

Write-Host '=== сквозные тесты сайта ===' -ForegroundColor Cyan
$env:PYTHONIOENCODING = 'utf-8'
& $py (Join-Path $PSScriptRoot 'test_all.py')