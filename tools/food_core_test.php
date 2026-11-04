<?php
// Тесты завода еды: покрытие, ограничения по кредитам и воде, запасной путь.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/food_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

chk($res, 'этапов в данных 4', count($GLOBALS['FOOD_FACTORIES']) === 4, count($GLOBALS['FOOD_FACTORIES']));

$f1 = array(array('tier' => 1, 'count' => 1));
$cap = food_capacity($f1);
chk($res, 'T1: 500 кг/сутки', $cap['kg_day'] == 500, $cap['kg_day']);
chk($res, 'T1: мощность ≈ 375 кВт', abs($cap['power_kw'] - 375) < 1, $cap['power_kw']);

$f4 = array(array('tier' => 4, 'count' => 1));
$cap4 = food_capacity($f4);
chk($res, 'T4: 9000 кг/сутки', $cap4['kg_day'] == 9000, $cap4['kg_day']);
chk($res, 'T4: мощность ≈ 2625 кВт', abs($cap4['power_kw'] - 2625) < 2, $cap4['power_kw']);

// 1000 человек, 1 сутки, T1, кредитов хватает, вода есть
$p = food_plan(1000, $f1, 100000, array('water' => 10000), 1);
chk($res, 'нужно 300 кг на 1000 человек', $p['need_kg'] == 300, $p['need_kg']);
chk($res, 'покрытие 100%', $p['coverage'] == 1.0, $p['coverage']);
chk($res, 'голодных нет', $p['short_kg'] == 0, $p['short_kg']);
chk($res, 'вода учтена', $p['water_needed'] > 0, $p['water_needed']);

// 5000 человек: завод T1 не тянет
$p2 = food_plan(5000, $f1, 100000, array('water' => 100000), 1);
chk($res, 'T1 не кормит 5000', $p2['coverage'] < 1, $p2['coverage']);
chk($res, 'не хватает ровно 1000 кг', abs($p2['short_kg'] - 1000) < 1, $p2['short_kg']);
chk($res, 'запасной путь через зерно', $p2['fallback_kg'] > 0, $p2['fallback_kg']);

// энергия: денег хватает на половину
$p3 = food_plan(1000, $f1, 1000, array('water' => 10000), 1);
chk($res, 'ограничение по кредитам сработало', $p3['credit_limited'] === true, $p3['energy_cost']);
chk($res, 'выпуск упал', $p3['produced_kg'] < 300, $p3['produced_kg']);

// вода: мало воды
$p4 = food_plan(1000, $f1, 1000000, array('water' => 100), 1);
chk($res, 'ограничение по воде сработало', $p4['water_limited'] === true, $p4['water_needed']);
chk($res, 'вода режет выпуск', $p4['produced_kg'] < 300, $p4['produced_kg']);

// без заводов всё через покупку
$p5 = food_plan(1000, array(), 100000, array('water' => 10000), 1);
chk($res, 'без заводов выпуск 0', $p5['produced_kg'] == 0, $p5['produced_kg']);
chk($res, 'всё в запасной путь', $p5['fallback_kg'] == 300, $p5['fallback_kg']);

// много заводов — покрытие больше не нужно
$p6 = food_plan(1000, array(array('tier' => 4, 'count' => 2)), 1000000, array('water' => 100000), 1);
chk($res, 'избыток не производится впустую', $p6['produced_kg'] == 300, $p6['produced_kg']);

// стоимость постройки
$b = food_build_cost(3, 2);
chk($res, 'стоимость T3×2', $b && $b['cost'] == 14000000, $b ? $b['cost'] : '-');
chk($res, 'неизвестный этап → null', food_build_cost(99, 1) === null);

// азот: нужен на белок и стоит денег
$pn = food_plan(1000, $f1, 1000000, array('water' => 100000), 1);
chk($res, 'азот учтён в плане', $pn['nitrogen_kg'] > 0, $pn['nitrogen_kg'] . ' кг');
chk($res, 'азот входит в стоимость', $pn['nitrogen_cost'] > 0, $pn['nitrogen_cost'] . ' кр');
chk($res, 'азот ≈ 0,12 кг на кг еды', abs($pn['nitrogen_kg'] / max(0.01, $pn['produced_kg']) - 0.12) < 0.01, round($pn['nitrogen_kg'] / max(0.01, $pn['produced_kg']), 3));

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);