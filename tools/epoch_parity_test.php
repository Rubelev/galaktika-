<?php
// Сверка PHP-Кеплера с JS после перевода эпохи на J2000 (C-03) + границы (C-05).
// Критерий: Δ угла < 0.01°, Δ радиуса < 0.01 px на 12 значениях a и 5 временах.
// Запуск: php epoch_parity_test.php reports/epoch_fixture.json [путь к motion_core.php]
$lib = getenv('MOTION_CORE');
if (!$lib) $lib = '/var/www/u3699164/data/www/warbattleuniverse.com/lib/motion_core.php';
if (!file_exists($lib)) {
    fwrite(STDERR, "нет модуля: $lib\n");
    exit(2);
}
require $lib;

$fixturePath = isset($argv[1]) ? $argv[1] : (__DIR__ . '/../reports/epoch_fixture.json');
if (!file_exists($fixturePath)) {
    fwrite(STDERR, "нет файла эталона: $fixturePath\n");
    exit(2);
}
$fx = json_decode(file_get_contents($fixturePath), true);
if (!is_array($fx)) {
    fwrite(STDERR, "эталон не читается как JSON\n");
    exit(2);
}

function angle_diff($a, $b) {
    $d = fmod($a - $b, 360.0);
    if ($d > 180.0) $d -= 360.0;
    if ($d < -180.0) $d += 360.0;
    return $d;
}

$points = 0; $mismatch = 0;
$worstAngle = 0.0; $worstAngleAt = '';
$worstR = 0.0; $worstRAt = '';
$bad = false;

foreach ($fx['orbits'] as $o) {
    foreach ($fx['times'] as $j => $t) {
        $exp = $fx['expected'][$o['id']][$j];
        $got = motion_kepler_position($o, $t);
        $points++;
        if (!is_finite($got['x']) || !is_finite($got['y']) || !is_finite($got['r'])) {
            echo "FAIL " . $o['id'] . ' t=' . $t . " — не конечное число\n";
            $bad = true; continue;
        }
        $dAngle = abs(angle_diff(rad2deg(atan2($got['y'], $got['x'])),
                                 rad2deg(atan2($exp['y'], $exp['x']))));
        $dR = abs($got['r'] - $exp['r']);
        if ($dAngle > $worstAngle) { $worstAngle = $dAngle; $worstAngleAt = $o['id'] . '@' . $t; }
        if ($dR > $worstR) { $worstR = $dR; $worstRAt = $o['id'] . '@' . $t; }
        if ($dAngle > 0.01 || $dR > 0.01) {
            $mismatch++;
            echo "FAIL " . $o['id'] . ' t=' . $t . ' Δугла=' . $dAngle . '° Δr=' . $dR . " px\n";
        }
    }
}
echo ($mismatch === 0 ? 'OK   ' : 'FAIL ') . 'позиции JS=PHP: точек ' . $points
    . ', сверх допуска ' . $mismatch
    . ', макс Δ угла ' . sprintf('%.3e', $worstAngle) . '° (' . $worstAngleAt . ')'
    . ', макс Δ радиуса ' . sprintf('%.3e', $worstR) . ' px (' . $worstRAt . ")\n";
$ok = ($mismatch === 0);

// --- границы C-05 (PHP-сторона) ---
$bOk = 0; $bAll = 0;
foreach ($fx['boundaries'] as $b) {
    $t = ($b['time'] === 'NaN') ? NAN : (($b['time'] === 'Infinity') ? INF : $b['time']);
    $got = motion_kepler_position($b['orbit'], $t);
    $bAll++;
    $finite = is_finite($got['x']) && is_finite($got['y']) && is_finite($got['z']) && is_finite($got['r']);
    $zero = ($got['x'] == 0.0 && $got['y'] == 0.0 && $got['z'] == 0.0 && $got['r'] == 0.0);
    $okCase = $finite && $zero;
    if ($okCase) $bOk++; else $ok = false;
    echo ($okCase ? 'OK   ' : 'FAIL ') . 'граница ' . $b['name']
        . ': r=' . $got['r'] . ' x=' . $got['x'] . ($finite ? '' : ' (NaN)') . "\n";
}
echo ($bOk === $bAll ? 'OK   ' : 'FAIL ') . 'границы PHP: ' . $bOk . '/' . $bAll . "\n";

// --- эпоха: ровно на J2000 средняя аномалия равна M0 (дни от J2000 = 0) ---
$o = $fx['orbits'][0];
$pJ = motion_kepler_position($o, 946728000000);
$dM0 = abs(rad2deg($pJ['M']) - $o['M0']);
$epochOk = $dM0 < 1e-9;
if (!$epochOk) $ok = false;
echo ($epochOk ? 'OK   ' : 'FAIL ') . 'J2000: M − M0 = ' . sprintf('%.3e', $dM0) . "°\n";

echo $ok ? "ИТОГ: PASS\n" : "ИТОГ: FAIL\n";
exit($ok ? 0 : 1);
