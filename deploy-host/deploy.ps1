<#
    Полная выкладка «Галактики» на оба домена.

    Что делает по шагам:
      1. собирает статический index.html из Home.razor (если не -SkipBuild);
      2. копирует свежие js/css/api из src в deploy-host (единый источник);
      3. упаковывает deploy-host\site в tar.gz и заливает на .com;
      4. распаковывает на сервере, сохраняя uploads/ и .htaccess;
      5. синхронизирует зеркало .store через sync-mirror.ps1;
      6. запускает аудит и печатает итог.

    Запуск:
        .\deploy.ps1                     # собрать и выложить
        .\deploy.ps1 -Version 704        # с явной версией ассетов
        .\deploy.ps1 -SkipBuild          # только выложить текущие файлы
        .\deploy.ps1 -SkipAudit          # без проверок
#>
[CmdletBinding()]
param(
    [int]$Version = 0,
    [switch]$SkipBuild,
    [switch]$SkipAudit
)



# каталог систем собирается из SQL перед деплоем (не править catalog.js руками)
$buildCat = Join-Path $PSScriptRoot '..\tools\build_catalog.py'
if (Test-Path $buildCat) {
    $pyExe = 'D:\Users\a.bulatov\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
    if (Test-Path $pyExe) { & $pyExe $buildCat }
}

# ПРОВЕРКА СИНТАКСИСА JS ПЕРЕД ДЕПЛОЕМ: битый скрипт не должен уезжать на сервер.
# (Уже случалось: замена строки сделала `window.try {...}` и сломала solar.js.)
$jsDir = Join-Path $PSScriptRoot '..\src\galaktika.Web\wwwroot\js'
$nodeExe = 'D:\Users\a.bulatov\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
if ((Test-Path $jsDir) -and (Test-Path $nodeExe)) {
    $bad = @()
    Get-ChildItem $jsDir -Filter *.js | ForEach-Object {
        & $nodeExe --check $_.FullName 2>$null
        if ($LASTEXITCODE -ne 0) { $bad += $_.Name }
    }
    if ($bad.Count -gt 0) {
        Write-Host ("ОТМЕНА ДЕПЛОЯ: синтаксис JS сломан в " + ($bad -join ', ')) -ForegroundColor Red
        exit 1
    }
    Write-Host "Синтаксис JS: все файлы валидны" -ForegroundColor Green
}

# app-build-stamp: метка сборки меняется каждый деплой — клиент сам
# перезагружает страницу один раз (иначе видит старые скрипты из кеша)
$buildStamp = Get-Date -Format 'yyyyMMddHHmm'
$indexPath = Join-Path $PSScriptRoot '..\app-lite\www\index.html'
if (Test-Path $indexPath) {
    $html = Get-Content $indexPath -Raw -Encoding UTF8
    $html = [regex]::Replace($html, '(<meta name="app-build" content=")[^"]*(")', '${1}' + $buildStamp + '${2}')
    [System.IO.File]::WriteAllText($indexPath, $html, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "app-build: $buildStamp"
}

$ErrorActionPreference = 'Continue'
# консоль в UTF-8: иначе русский вывод python превращается в кракозябры
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $env:PYTHONIOENCODING = 'utf-8'
} catch { }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$site = Join-Path $here 'site'
$src = Join-Path $root 'src\galaktika.Web\wwwroot'
$appLite = Join-Path $root 'app-lite'

$hostName = 'u3699164@31.31.196.115'
$docroot = '/var/www/u3699164/data/www/warbattleuniverse.com'
$opts = @('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=NUL',
          '-o', 'PubkeyAuthentication=no', '-o', 'ConnectTimeout=20', '-o', 'LogLevel=ERROR')

$askpass = Join-Path $here 'askpass.bat'
if (Test-Path $askpass) {
    $env:SSH_ASKPASS = $askpass
    $env:SSH_ASKPASS_REQUIRE = 'force'
    $env:DISPLAY = 'localhost:0'
}

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }

# ---------- 1. сборка ----------
if (-not $SkipBuild) {
    Step 'сборка статики'
    # Версия ассетов по умолчанию — текущее время: каждый деплой сбрасывает кеш.
    # Иначе браузер держит старый solar.js и «возвращает» старую логику.
    $ver = if ($Version -gt 0) { $Version } else { [int](Get-Date -Format 'MMddHH') }
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $appLite 'make-static.ps1') -Version $ver
    Copy-Item (Join-Path $appLite 'www\index.html') (Join-Path $site 'index.html') -Force
}

# ---------- 2. src → deploy-host ----------
Step 'копирование из src в deploy-host'
$pairs = @(
    @('js', 'js'),
    @('app.css', 'app.css')
)
foreach ($p in $pairs) {
    $from = Join-Path $src $p[0]
    $to = Join-Path $site $p[1]
    if (Test-Path $from) {
        if ((Get-Item $from).PSIsContainer) {
            Copy-Item (Join-Path $from '*') $to -Recurse -Force
        } else {
            Copy-Item $from $to -Force
        }
        Write-Host "  $($p[0]) → site/$($p[1])"
    }
}
# api.php и .htaccess живут прямо в deploy-host\site — их правим на месте

# ---------- 3. архив и заливка ----------
Step 'упаковка и заливка на .com'
$tgz = Join-Path $env:TEMP 'galaktika-site.tgz'
if (Test-Path $tgz) { Remove-Item $tgz -Force }
& tar -czf $tgz --exclude 'uploads' -C $site .
if ($LASTEXITCODE -ne 0) { throw 'tar не смог упаковать сайт' }
$sizeMb = [math]::Round((Get-Item $tgz).Length / 1MB, 1)
Write-Host "  архив: $sizeMb МБ"

& scp @opts $tgz "${hostName}:/tmp/galaktika-site.tgz" 2>&1 |
    Where-Object { $_ -notmatch 'Warning: Permanently|^ssh\.exe' } | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'scp вернул ошибку' }

# распаковка: старые файлы удаляем, uploads и .htaccess сохраняем
$unpack = @"
cd $docroot && \
find . -mindepth 1 -maxdepth 1 ! -name 'uploads' ! -name '.htaccess' -exec rm -rf {} + && \
tar xzf /tmp/galaktika-site.tgz -C $docroot && \
cp /tmp/galaktika-site.tgz /tmp/last-deploy.tgz 2>/dev/null; \
echo UNPACK_OK
"@
$res = & ssh @opts $hostName $unpack 2>&1 | Where-Object { $_ -notmatch 'Warning: Permanently|^ssh\.exe' }
if ($LASTEXITCODE -ne 0 -or -not ($res -join "`n").Contains('UNPACK_OK')) {
    $res | ForEach-Object { Write-Host "  $_" }
    throw 'распаковка на сервере не удалась'
}
Write-Host '  файлы на .com обновлены' -ForegroundColor Green

# ---------- 4. зеркало ----------
Step 'синхронизация зеркала .store'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'sync-mirror.ps1')

# ---------- 5. аудит ----------
if (-not $SkipAudit) {
    Step 'аудит'
    $py = 'D:\Users\a.bulatov\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
    if (Test-Path $py) {
        & $py (Join-Path $here 'audit_all.py') | Select-Object -Last 4
    } else {
        Write-Host '  python не найден, аудит пропущен' -ForegroundColor Yellow
    }
}

Step 'готово'
Write-Host 'эталон:  https://warbattleuniverse.com' -ForegroundColor Green
Write-Host 'зеркало: https://warbattleuniverse.store (самоподписанный сертификат)' -ForegroundColor DarkGray

exit 0
