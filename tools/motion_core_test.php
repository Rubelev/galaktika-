<?php
// Сверка PHP-ядра движения с эталоном, посчитанным JS-версией.
// Запуск: php motion_core_test.php reports/motion_fixture.json
require __DIR__ . '/../site/lib/motion_core.php';

$fixturePath = isset($argv[1]) ? $argv[1] : (__DIR__ . '/motion_fixture.json');
if (!file_exists($fixturePath)) {
    fwrite(STDERR, "нет файла эталона: $fixturePath\n");
    exit(2);
}
$fx = json_decode(file_get_contents($fixturePath), true);
if (!is_array($fx)) {
    fwrite(STDERR, "эталон не читается как JSON\n");
    exit(2);
}

$world = $fx['world'];
$ships = $fx['ships'];
$samples = $fx['samples'];
$expected = $fx['expected'];

$results = array();
function check(&$results, $name, $ok, $detail = '') {
    $results[] = array('name' => $name, 'ok' => $ok, 'detail' => $detail);
}

$checked = 0; $mismatch = 0; $worst = 0.0;
foreach ($ships as $i => $ship) {
    foreach ($samples as $t) {
        $got = motion_pose_at($ship, $t, $world);
        $exp = $expected[$i][(string)$t];
        $checked++;
        $dx = abs($got['x'] - $exp['x']);
        $dy = abs($got['y'] - $exp['y']);
        $d = max($dx, $dy);
        if ($d > $worst) $worst = $d;
        if ($d > 1e-6 || $got['op'] !== $exp['op']) $mismatch++;
    }
}
check($results, 'позы совпадают с JS-эталоном', $mismatch === 0,
    "проверено $checked, расхождений $mismatch, макс $worst");

// ограничения скорости
$fast = 0;
foreach ($ships as $ship) {
    $val = motion_validate($ship, $world);
    if (!$val['ok']) $fast++;
}
check($results, 'нет превышений 0,95 c', $fast === 0, "бортов с нарушениями: $fast");

// расширяемость: регистрируем новую команду только в PHP
motion_define_command('JUMP',
    function ($o, $ctx) { return 60000; },
    function ($o, $k, $ctx) {
        return array(
            'x' => $ctx['from']['x'] + ($ctx['to']['x'] - $ctx['from']['x']) * $k,
            'y' => $ctx['from']['y'] + ($ctx['to']['y'] - $ctx['from']['y']) * $k,
            'ang' => 0
        );
    }
);
$ship = array('id' => 'jump', 'cls' => 'fighter', 'at' => 'earth', 'startedAt' => 0,
              'orders' => array(array('op' => 'JUMP', 'to' => 'saturn')));
$p = motion_pose_at($ship, 30000, $world);
check($results, 'новая команда работает на сервере', $p['op'] === 'JUMP' && $p['x'] > 0,
    $p['op'] . ' x=' . round($p['x'], 1));

$failed = 0;
foreach ($results as $r) {
    echo ($r['ok'] ? 'OK   ' : 'FAIL ') . $r['name'] . ($r['detail'] !== '' ? ' — ' . $r['detail'] : '') . "\n";
    if (!$r['ok']) $failed++;
}
echo "\n=== ИТОГ ===\nпроверок: " . count($results) . " | успешно: " . (count($results) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);
