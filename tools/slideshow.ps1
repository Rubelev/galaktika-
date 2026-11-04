# Слайдшоу карты «Галактика» для визуального тестирования.
# Снимает кадры под своим пользователем в разных ракурсах и в заданные
# моменты игрового времени, затем склеивает GIF.
#
# Примеры:
#   .\slideshow.ps1                                  # 4 кадра, плоский вид
#   .\slideshow.ps1 -Tilts "0;45" -Spins "0;20"      # два ракурса
#   .\slideshow.ps1 -Times "0,60,120,180" -Name fleet
#
param(
    [string]$Times = "0,40,80,120",
    [string]$Tilts = "0",
    [string]$Spins = "0",
    [int]$Width = 900,
    [int]$Height = 560,
    [string]$Name = "slideshow",
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot          # galaktika
$reports = Join-Path $root "reports"
$tool = Join-Path $PSScriptRoot "shot.ps1"
if (-not (Test-Path $reports)) { New-Item -ItemType Directory -Path $reports | Out-Null }

if (-not $Token) {
    $tokenFile = Join-Path $reports "_token.txt"
    if (-not (Test-Path $tokenFile)) { throw "нет $tokenFile — нужен токен игрока" }
    $Token = (Get-Content $tokenFile -Raw).Trim()
}

$times = $Times -split "[,;\s]+" | Where-Object { $_ -ne "" }
$tilts = $Tilts -split "[,;\s]+" | Where-Object { $_ -ne "" }
$spins = $Spins -split "[,;\s]+" | Where-Object { $_ -ne "" }

$frames = @()
$idx = 0
foreach ($tilt in $tilts) {
    foreach ($spin in $spins) {
        foreach ($t in $times) {
            $idx++
            $out = Join-Path $reports ("{0}-{1:d2}-t{2}-a{3}-{4}.png" -f $Name, $idx, $t, $tilt, $spin)
            $url = "https://warbattleuniverse.com/?shot=1&freeze=$t&tilt=$tilt&spin=$spin&token=$Token&r=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
            Write-Host ("[{0}] время={1} наклон={2} поворот={3}" -f $idx, $t, $tilt, $spin)
            & powershell -NoProfile -ExecutionPolicy Bypass -File $tool -Url $url -Out $out -Width $Width -Height $Height -Wait 9000 | Out-Null
            $frames += $out
        }
    }
}

# склейка GIF существующим инструментом tools\make_gif.py
$gifScript = Join-Path $PSScriptRoot "make_gif.py"
$gifOut = Join-Path $reports "$Name.gif"
$python = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $python) {
    $py2 = "D:\Users\a.bulatov\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
    if (Test-Path $py2) { $python = @{ Source = $py2 } }
}
if ($python) {
    $src = ($frames -join ",")
    & $python.Source $gifScript $src $gifOut --ms 700 --title $Name | Out-Host
} else {
    Write-Host "python не найден — GIF не собран, кадры лежат в $reports"
}

Write-Host ("готово: {0} кадров, GIF: {1}" -f $frames.Count, (Join-Path $reports "$Name.gif"))
$frames
