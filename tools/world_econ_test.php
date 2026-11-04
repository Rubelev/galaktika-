<?php
// Тесты экономики зрелищ: Вармир (5 арен) и Тарсис (гонки).
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/world_econ.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

chk($res, 'событий 6', count($GLOBALS['WORLD_ECON']) === 6, count($GLOBALS['WORLD_ECON']));
chk($res, 'арен Вармира 5', count(world_econ_list('war')) === 5, count(world_econ_list('war')));
chk($res, 'гонок Тарсиса 1', count(world_econ_list('tarsis')) === 1, count(world_econ_list('tarsis')));

$pit = world_event_balance('war_pit');
$sphere = world_event_balance('war_sphere');
$race = world_event_balance('race_tarsis');

chk($res, 'Яма при полной арене прибыльна', $pit['profit'] > 0, $pit['profit']);
chk($res, 'Сфера при полной арене прибыльна', $sphere['profit'] > 0, $sphere['profit']);
chk($res, 'Тарсис при полной прибыльна', $race['profit'] > 0, $race['profit']);
chk($res, 'маржа Ямы 10–60 %', $pit['margin'] > 0.1 && $pit['margin'] < 0.6, $pit['margin']);
chk($res, 'маржа Сферы 10–60 %', $sphere['margin'] > 0.1 && $sphere['margin'] < 0.6, $sphere['margin']);

// гости потребляют еду и энергию
chk($res, 'Сфера кормит 30 000 гостей × 0,3 кг', $sphere['food_kg'] == 9000, $sphere['food_kg']);
chk($res, 'энергия Сферы = 30 000 × 3,2 кВт·ч', abs($sphere['energy_kwh'] - 96000) < 1, $sphere['energy_kwh']);
chk($res, 'еда дешевле билетов', $sphere['food_cost'] < $sphere['tickets'], $sphere['food_cost'] . ' < ' . $sphere['tickets']);

// точка безубыточности осмысленна
chk($res, 'безубыточность Ямы > 0', $pit['breakeven_guests'] > 0, $pit['breakeven_guests']);
chk($res, 'безубыточность меньше вместимости', $pit['breakeven_guests'] < $pit['capacity'], $pit['breakeven_guests']);
$atBe = world_event_balance('war_pit', $pit['breakeven_guests']);
chk($res, 'на пороге прибыль ≈ 0 (±2 %)', abs($atBe['profit']) <= max(200, $atBe['revenue'] * 0.02), $atBe['profit']);

// пустая арена — убыток
$empty = world_event_balance('war_dome', 0);
chk($res, 'пустая арена в убытке', $empty['profit'] < 0, $empty['profit']);
chk($res, 'пустая арена: расходы = постоянные', abs($empty['costs'] - ($empty['staff_cost'] + $empty['prize'] + $empty['upkeep'])) < 1, $empty['costs']);

// половина зала
$half = world_event_balance('war_dome', 10000);
chk($res, 'половина зала прибыльна', $half['profit'] > 0, $half['profit']);
chk($res, 'половина даёт меньше полного', $half['profit'] < world_event_balance('war_dome')['profit'], $half['profit']);

// деликатесы дают заметную долю выручки
chk($res, 'деликатесы > 5 % выручки', $sphere['luxury'] > $sphere['revenue'] * 0.05, round($sphere['luxury'] / $sphere['revenue'] * 100, 1) . '%');
chk($res, 'билеты — основа выручки', $sphere['tickets'] > $sphere['revenue'] * 0.4, round($sphere['tickets'] / $sphere['revenue'] * 100, 1) . '%');

// сводка по миру
$sum = world_econ_world_summary('war');
chk($res, 'сводка: 5 арен', count($sum['events']) === 5, count($sum['events']));
chk($res, 'сводка: полная загрузка прибыльна', $sum['profit_full'] > 0, $sum['profit_full']);
chk($res, 'половинная хуже полной', $sum['profit_half'] < $sum['profit_full'], $sum['profit_half'] . ' < ' . $sum['profit_full']);

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== СВОДКА ===\n";
foreach (array('war','tarsis') as $w) {
    foreach (world_econ_list($w) as $e) {
        $b = world_event_balance($e['id']);
        printf("%-14s %6d мест: выручка %9d · расходы %8d · прибыль %7d · %.1f%% · безубыт. %d\n",
            $e['id'], $b['capacity'], $b['revenue'], $b['costs'], $b['profit'], $b['margin']*100, $b['breakeven_guests']);
    }
}
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);