<#
    Скриншот страницы через headless Chrome — для визуальной проверки задач.
    Правило 22 из AGENTS.md: объект снимается ЦЕЛИКОМ, затем разбирается.

    Примеры:
        .\shot.ps1 -Url "https://warbattleuniverse.com/?shot=1" -Out ..\reports\map.png
        .\shot.ps1 -Url "https://warbattleuniverse.com/?shot=1" -Out ..\reports\map-big.png -Width 1600 -Height 1000
        .\shot.ps1 -Url "https://warbattleuniverse.com/ship-render.html?id=jet_hauler" -Out ..\reports\ship.png -Transparent
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Out,
    [int]$Width = 1400,
    [int]$Height = 900,
    [int]$Wait = 12000,
    [int]$Tries = 3,
    [switch]$Transparent
)

$ErrorActionPreference = 'Continue'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { throw "Chrome не найден: $chrome" }

$outPath = [System.IO.Path]::GetFullPath($Out)
$dir = Split-Path -Parent $outPath
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

for ($i = 1; $i -le $Tries; $i++) {
    if (Test-Path $outPath) { Remove-Item $outPath -Force }
    $args = @(
        '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
        "--window-size=$Width,$Height",
        "--virtual-time-budget=$Wait",
        "--screenshot=$outPath",
        $Url
    )
    if ($Transparent) { $args = @('--default-background-color=00000000') + $args }
    $errFile = Join-Path ([System.IO.Path]::GetTempPath()) ("shot-" + [guid]::NewGuid().ToString('N') + ".err")
    $proc = Start-Process -FilePath $chrome -ArgumentList $args -RedirectStandardError $errFile -PassThru
    $null = $proc.WaitForExit(120000)
    Start-Sleep -Milliseconds 300
    if ((Test-Path $outPath) -and (Get-Item $outPath).Length -gt 2000) {
        $kb = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
        Write-Output "OK $outPath ($kb КБ, $Width x $Height, попытка $i)"
        Remove-Item $errFile -ErrorAction SilentlyContinue
        return $outPath
    }
    Write-Output "попытка $i не удалась, повтор…"
}

throw "Не удалось снять скриншот $Url за $Tries попыток"
