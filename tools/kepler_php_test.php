<?php
// Сверка PHP-Кеплера с эталоном JS
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/motion_core.php';
$fx = json_decode(file_get_contents($argv[1]), true);
$checked = 0; $mismatch = 0; $worst = 0.0;
foreach ($fx['orbits'] as $i => $o) {
    foreach ($fx['times'] as $j => $t) {
        $got = motion_kepler_position($o, $t);
        $exp = $fx['expected'][$o['id']][$j];
        $d = max(abs($got['x'] - $exp['x']), abs($got['y'] - $exp['y']), abs($got['z'] - $exp['z']));
        if ($d > $worst) $worst = $d;
        $checked++;
        if ($d > 1e-9) $mismatch++;
    }
}
echo ($mismatch === 0 ? "OK   " : "FAIL ") . "позиции PHP = JS: проверено $checked, расхождений $mismatch, макс $worst\n";
echo "PHP Кеплер: " . ($mismatch === 0 ? "согласован" : "расходится") . "\n";
exit($mismatch === 0 ? 0 : 1);