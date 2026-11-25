<?php
// Сценарии живого боя на battle_core.php: 3 фиксированных боя, детерминизм,
// снимок исхода (победитель + остатки HP) для сравнения «до/после» (C-08).
// Запуск: php battle_scenarios_test.php [путь к battle_core.php] [файл-снимок.json]
$core = isset($argv[1]) ? $argv[1] : (__DIR__ . '/../site/lib/battle_core.php');
if (!file_exists($core)) {
    fwrite(STDERR, "нет battle_core: $core\n");
    exit(2);
}
require $core;

$SCENARIOS = array(
    array('id' => 'S1', 'fleet' => 150, 'pirates' => 12, 'arrival' => 50),   // боевые параметры прода
    array('id' => 'S2', 'fleet' => 40,  'pirates' => 30, 'arrival' => 10),
    array('id' => 'S3', 'fleet' => 300, 'pirates' => 60, 'arrival' => 100)
);

function run_battle($sc) {
    $b = battle_new($sc['id'] . '-fixed', $sc['fleet'], $sc['pirates'], $sc['arrival']);
    // не больше 60 минут за вызов — как в api.php
    for ($done = 0; $done < 240; $done += 60) {
        $b = battle_advance($b, 60);
    }
    $shipsHp = array();
    foreach ($b['ships'] as $s) $shipsHp[] = round((float)$s['hp'], 6);
    $piratesHp = array();
    foreach ($b['pirates'] as $p) $piratesHp[] = round((float)$p['hp'], 6);
    return array(
        'id' => $sc['id'],
        'input' => array('fleet' => $sc['fleet'], 'pirates' => $sc['pirates'], 'arrival' => $sc['arrival']),
        'summary' => battle_summary($b),
        'shipsHp' => $shipsHp,
        'piratesHp' => $piratesHp
    );
}

$out = array();
$ok = true;
foreach ($SCENARIOS as $sc) {
    $a = run_battle($sc);
    $b = run_battle($sc);   // второй прогон — проверка детерминизма
    $det = (json_encode($a) === json_encode($b));
    if (!$det) $ok = false;
    $out[$sc['id']] = $a;
    $s = $a['summary'];
    echo ($det ? 'OK   ' : 'FAIL ') . $sc['id'] . ' ' . $sc['fleet'] . '×' . $sc['pirates']
        . ': минута ' . $s['minute'] . ', фаза ' . $s['phase']
        . ', флот ' . $s['fleet'] . ' (потери ' . $s['fleetLost'] . ')'
        . ', пиратов живых ' . $s['pirates'] . ', убито ' . $s['killed']
        . ' | детерминизм: ' . ($det ? 'да' : 'НЕТ') . "\n";
    // победитель: пираты уничтожены / флот уничтожен / таймаут
    echo '     победитель: ' . ($s['pirates'] === 0 ? 'флот' : ($s['fleet'] === 0 ? 'пираты' : 'таймаут'))
        . ', сумма HP флота ' . round(array_sum($a['shipsHp']), 3)
        . ', сумма HP пиратов ' . round(array_sum($a['piratesHp']), 3) . "\n";
}

$snapshot = array('scenarios' => $out, 'deterministic' => $ok);
$path = isset($argv[2]) ? $argv[2] : null;
if ($path) {
    file_put_contents($path, json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo "снимок: $path\n";
}
echo $ok ? "ИТОГ: PASS (3 сценария, детерминизм подтверждён)\n" : "ИТОГ: FAIL\n";
exit($ok ? 0 : 1);
