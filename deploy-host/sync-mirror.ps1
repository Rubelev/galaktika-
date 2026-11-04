<#
    Синхронизация зеркала warbattleuniverse.store с каноническим .com.

    Зачем: после каждой выкладки файлы на .com обновляются, а .store остаётся
    старым. Скрипт копирует всё, кроме uploads/ (у доменов свои папки отзывов)
    и .htaccess (у зеркала свой сертификат, правило редиректа не трогаем).

    Запуск:
        .\sync-mirror.ps1              # синхронизировать и проверить
        .\sync-mirror.ps1 -DryRun      # только показать, что изменится
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'   # ssh пишет предупреждения в stderr — это не ошибка
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostName = 'u3699164@31.31.196.115'
$www = '/var/www/u3699164/data/www'
$src = 'warbattleuniverse.com'
$dst = 'warbattleuniverse.store'

$opts = @('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=NUL',
          '-o', 'PubkeyAuthentication=no', '-o', 'ConnectTimeout=20',
          '-o', 'LogLevel=ERROR')

# пароль берём из askpass.bat рядом со скриптом
$askpass = Join-Path $here 'askpass.bat'
if (Test-Path $askpass) {
    $env:SSH_ASKPASS = $askpass
    $env:SSH_ASKPASS_REQUIRE = 'force'
    $env:DISPLAY = 'localhost:0'
}

$flags = if ($DryRun) { '-n --itemize-changes' } else { '' }
$remote = "cd $www && rsync -a --delete $flags --exclude 'uploads/' --exclude '.htaccess' $src/ $dst/ && echo SYNC_OK"

Write-Host "=== синхронизация зеркала $dst ===" -ForegroundColor Cyan
if ($DryRun) { Write-Host '(режим проверки, файлы не меняются)' -ForegroundColor DarkGray }

$out = & ssh @opts $hostName $remote 2>&1 |
       Where-Object { $_ -notmatch 'Warning: Permanently|^ssh\.exe' }
if ($LASTEXITCODE -ne 0) { throw "ssh вернул код $LASTEXITCODE" }
$out | ForEach-Object { Write-Host "  $_" }

if ($DryRun) {
    if (-not $out) { Write-Host 'Изменений нет — зеркало уже совпадает.' -ForegroundColor Green }
    return
}

if ($out -notcontains 'SYNC_OK' -and -not ($out -join "`n") -match 'SYNC_OK') {
    throw 'rsync завершился без подтверждения SYNC_OK'
}

# --- контроль: одинаковые контрольные суммы ключевых файлов ---
$check = "cd $www && md5sum $src/index.html $dst/index.html $src/app.css $dst/app.css $src/js/solar.js $dst/js/solar.js $src/api.php $dst/api.php"
$sums = & ssh @opts $hostName $check 2>&1 |
        Where-Object { $_ -notmatch 'Warning: Permanently|^ssh\.exe' }

$pairs = @{}
foreach ($line in $sums) {
    if ($line -match '^([0-9a-f]{32})\s+(\S+)$') {
        $hash = $matches[1]
        $path = $matches[2]
        $name = Split-Path $path -Leaf
        if (-not $pairs.ContainsKey($name)) { $pairs[$name] = @() }
        $pairs[$name] += $hash
    }
}

$bad = @()
foreach ($name in $pairs.Keys) {
    if ($pairs[$name].Count -eq 2 -and $pairs[$name][0] -ne $pairs[$name][1]) { $bad += $name }
}

if ($bad.Count -gt 0) {
    Write-Host ("РАСХОЖДЕНИЕ: " + ($bad -join ', ')) -ForegroundColor Red
    throw 'зеркало не совпадает с оригиналом'
}

Write-Host ("совпадают: " + (($pairs.Keys | Sort-Object) -join ', ')) -ForegroundColor Green
Write-Host 'зеркало обновлено' -ForegroundColor Green
