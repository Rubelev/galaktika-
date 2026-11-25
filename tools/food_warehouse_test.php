<?php
// G-05/G-06: еда по цене + «эдакое при достатке» + сырьё завода.
// Единый список: зерно (4) → синтетика (8–15) → деликатесы (80–260).
// Деликатесы съедобны: доля от достатка (0 % при ≤1000 кр/чел, 30 % при ≥10 000),
// при голоде — последняя линия; в отчёте кг и сумма по каждому виду.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/food_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

// --- порядок еды: зерно (4 кр) первым, food_* не тронут ---
$r1 = array('grain' => 1000, 'food_carb_paste' => 100, 'food_protein_paste' => 50, 'water' => 5000);
$e1 = food_feed_population($r1, 300);
chk($res, 'зерно первым: съедено 300 кг зерна, еда со склада цела',
    abs($e1['from_grain_kg'] - 300) < 0.01 && $e1['from_stock_kg'] == 0
    && abs($r1['grain'] - 700) < 0.01 && abs($r1['food_carb_paste'] - 100) < 0.01,
    'зерно ' . $e1['from_grain_kg'] . ' / склад ' . $e1['from_stock_kg']
    . ' / остаток зерна ' . $r1['grain'] . ' / гель ' . $r1['food_carb_paste']);
chk($res, 'стоимость зерна: 300 × 4 = 1200 кр', abs($e1['cost_total'] - 1200) < 0.01, $e1['cost_total'] . ' кр');

// --- после зерна идёт синтетика ---
$r2 = array('grain' => 100, 'food_carb_paste' => 300);
$e2 = food_feed_population($r2, 300);
chk($res, 'после зерна — синтетика: зерно 100 + гель 200 = 300 кг',
    abs($r2['grain']) < 0.01 && abs($r2['food_carb_paste'] - 100) < 0.01
    && abs($e2['from_grain_kg'] - 100) < 0.01 && abs($e2['from_stock_kg'] - 200) < 0.01,
    'зерно ' . $e2['from_grain_kg'] . ' / гель ' . $e2['from_stock_kg'] . ' / остаток геля ' . $r2['food_carb_paste']);
chk($res, 'цена 100×4 + 200×8 = 2000 кр', abs($e2['cost_total'] - 2000) < 0.01, $e2['cost_total'] . ' кр');

// --- синтетика раньше деликатеса ---
$r3 = array('food_carb_paste' => 100, 'food_lobster' => 500);
$e3 = food_feed_population($r3, 300, 1000, 100);   // бедный: «эдакого» нет, всё по цене
chk($res, 'синтетика раньше деликатеса: гель 100 кг, потом лангуст 200 кг',
    abs($e3['by']['food_carb_paste']['kg'] - 100) < 0.01 && abs($e3['by']['food_lobster']['kg'] - 200) < 0.01
    && abs($r3['food_lobster'] - 300) < 0.01,
    'гель ' . $e3['by']['food_carb_paste']['kg'] . ' / лангуст ' . $e3['by']['food_lobster']['kg']
    . ' / остаток ' . $r3['food_lobster']);
chk($res, 'разбивка по видам: гель 800 кр, лангуст 52 000 кр',
    abs($e3['by']['food_carb_paste']['cost'] - 800) < 0.01 && abs($e3['by']['food_lobster']['cost'] - 52000) < 0.01,
    $e3['by']['food_carb_paste']['cost'] . ' / ' . $e3['by']['food_lobster']['cost']);

// --- сумма съеденного совпадает с ценой по каждому виду ---
$sumKg = 0.0; $sumCost = 0.0; $recalc = 0.0;
foreach ($e3['by'] as $row) { $sumKg += $row['kg']; $sumCost += $row['cost']; $recalc += $row['kg'] * $row['price']; }
chk($res, 'сумма по видам = eaten и cost_total (и кг × цена)',
    abs($sumKg - ($e3['from_stock_kg'] + $e3['from_grain_kg'])) < 0.01
    && abs($sumCost - $e3['cost_total']) < 0.01 && abs($recalc - $e3['cost_total']) < 0.01,
    'кг ' . $sumKg . ' / сумма ' . $sumCost . ' / пересчёт ' . $recalc . ' / total ' . $e3['cost_total']);

// --- только деликатесы на складе: съедены, голода нет ---
$r4 = array('food_lobster' => 400);
$e4 = food_feed_population($r4, 300, 1000, 100);
chk($res, 'только деликатесы: съедено 300 кг лангуста, голода нет, остаток 100',
    abs($e4['from_stock_kg'] - 300) < 0.01 && abs($e4['short_kg']) < 0.01 && abs($r4['food_lobster'] - 100) < 0.01,
    'съедено ' . $e4['from_stock_kg'] . ' / short ' . $e4['short_kg'] . ' / остаток ' . $r4['food_lobster']);
chk($res, 'дорогой деликатес не молчит: 300 × 260 = 78 000 кр',
    abs($e4['cost_total'] - 78000) < 0.01, $e4['cost_total'] . ' кр');

// --- деликатесы между собой: дешевле (сыр 120) раньше лангуста (260) ---
$r5 = array('food_cheese' => 100, 'food_lobster' => 400);
$e5 = food_feed_population($r5, 200, 1000, 100);
chk($res, 'деликатесы по цене: сыр 100 кг, потом лангуст 100 кг (38 000 кр)',
    abs($e5['by']['food_cheese']['kg'] - 100) < 0.01 && abs($e5['by']['food_lobster']['kg'] - 100) < 0.01
    && abs($e5['cost_total'] - 38000) < 0.01 && abs($r5['food_lobster'] - 300) < 0.01,
    'сыр ' . $e5['by']['food_cheese']['kg'] . ' / лангуст ' . $e5['by']['food_lobster']['kg']
    . ' / ' . $e5['cost_total'] . ' кр');

// --- смешанный склад: деликатес цел, пока есть дешёвое ---
$r6 = array('grain' => 50, 'food_carb_paste' => 100, 'food_lobster' => 500);
$e6 = food_feed_population($r6, 100, 1000, 100);
chk($res, 'смешанный склад: зерно 50 + гель 50, лангуст 500 цел (600 кр)',
    $e6['from_grain_kg'] == 50 && $e6['from_stock_kg'] == 50
    && abs($r6['food_lobster'] - 500) < 0.01 && abs($r6['food_carb_paste'] - 50) < 0.01
    && abs($e6['cost_total'] - 600) < 0.01,
    'зерно ' . $e6['from_grain_kg'] . ' + гель ' . $e6['from_stock_kg']
    . ' / лангуст ' . $r6['food_lobster'] . ' / ' . $e6['cost_total'] . ' кр');

// --- смешанный склад без зерна: синтетика раньше деликатеса ---
$r7 = array('food_carb_paste' => 100, 'food_protein_paste' => 100, 'food_lobster' => 500);
$e7 = food_feed_population($r7, 150, 1000, 100);
chk($res, 'без зерна: гель 100 + паста 50, лангуст 500 цел (1400 кр)',
    abs($e7['by']['food_carb_paste']['kg'] - 100) < 0.01 && abs($e7['by']['food_protein_paste']['kg'] - 50) < 0.01
    && abs($r7['food_lobster'] - 500) < 0.01 && abs($e7['cost_total'] - 1400) < 0.01,
    'гель ' . $e7['by']['food_carb_paste']['kg'] . ' / паста ' . $e7['by']['food_protein_paste']['kg']
    . ' / лангуст ' . $r7['food_lobster'] . ' / ' . $e7['cost_total'] . ' кр');

// --- старый аккаунт без food_*: как раньше ---
$r8 = array('grain' => 500, 'water' => 100);
$e8 = food_feed_population($r8, 300);
chk($res, 'без food_*: зерно 500 → 200, склад 0, голода нет (1200 кр)',
    $e8['from_stock_kg'] == 0 && abs($r8['grain'] - 200) < 0.01 && abs($e8['short_kg']) < 0.01
    && abs($e8['cost_total'] - 1200) < 0.01,
    'склад ' . $e8['from_stock_kg'] . ' / зерно ' . $r8['grain'] . ' / ' . $e8['cost_total'] . ' кр');

$r9 = array();
$e9 = food_feed_population($r9, 300);
chk($res, 'пустой склад: дефицит 300 кг, сумма 0, ошибки нет',
    abs($e9['short_kg'] - 300) < 0.01 && abs($e9['cost_total']) < 0.01 && $e9['from_stock_kg'] == 0,
    'short ' . $e9['short_kg'] . ' кг / сумма ' . $e9['cost_total'] . ' кр');

$r10 = array('food_carb_paste' => 100);
$e10 = food_feed_population($r10, 50);
chk($res, 'нет ключа grain вовсе: ест гель 50 кг, не падает',
    abs($e10['by']['food_carb_paste']['kg'] - 50) < 0.01 && abs($r10['food_carb_paste'] - 50) < 0.01,
    'гель ' . $r10['food_carb_paste'] . ' кг');

// --- G-06: «эдакое при достатке» ---
// богатый: 1 000 000 кр на 100 человек = 10 000 кр/чел → доля деликатесов 30 %
$rl1 = array('grain' => 1000, 'food_carb_paste' => 100, 'food_lobster' => 100);
$el1 = food_feed_population($rl1, 30, 1000000, 100);
chk($res, 'богатый (10 000 кр/чел): доля 30 %, база 21 кг зерна + 9 кг лангуста',
    abs($el1['lux_share'] - 0.30) < 1e-9 && abs($el1['lux_kg'] - 9) < 0.01
    && abs($el1['from_grain_kg'] - 21) < 0.01 && abs($el1['lux_cost'] - 2340) < 0.01
    && abs($rl1['food_carb_paste'] - 100) < 0.01,
    'доля ' . $el1['lux_share'] . ' / лангуст ' . $el1['lux_kg'] . ' кг, ' . $el1['lux_cost']
    . ' кр / зерно ' . $el1['from_grain_kg'] . ' кг');

$rl2 = array('grain' => 1000, 'food_lobster' => 100);
$el2 = food_feed_population($rl2, 30, 1000000, 100);
chk($res, 'богатый: 21 × 4 + 9 × 260 = 2424 кр, лангуста осталось 91',
    abs($el2['cost_total'] - 2424) < 0.01 && abs($rl2['food_lobster'] - 91) < 0.01,
    $el2['cost_total'] . ' кр / остаток ' . $rl2['food_lobster']);

// бедный: 50 000 кр на 100 человек = 500 кр/чел → доля 0, деликатесы не трогает
$rl3 = array('grain' => 1000, 'food_lobster' => 100);
$el3 = food_feed_population($rl3, 30, 50000, 100);
chk($res, 'бедный (500 кр/чел): доля 0, ест только зерно, лангуст 100 цел',
    $el3['lux_share'] == 0 && $el3['lux_kg'] == 0 && abs($rl3['food_lobster'] - 100) < 0.01
    && abs($el3['from_grain_kg'] - 30) < 0.01 && abs($el3['cost_total'] - 120) < 0.01,
    'доля ' . $el3['lux_share'] . ' / зерно ' . $el3['from_grain_kg'] . ' кг / лангуст ' . $rl3['food_lobster']);

// деликатесов нет вовсе: база закрывает всё, luxuryShort = 9
$rl4 = array('grain' => 1000);
$el4 = food_feed_population($rl4, 30, 1000000, 100);
chk($res, 'деликатесов нет: база 30 кг, luxuryShort 9, голода нет',
    abs($el4['luxury_short_kg'] - 9) < 0.01 && abs($el4['from_grain_kg'] - 30) < 0.01
    && abs($el4['short_kg']) < 0.01 && abs($el4['cost_total'] - 120) < 0.01,
    'short ' . $el4['luxury_short_kg'] . ' / зерно ' . $el4['from_grain_kg'] . ' кг');

// деликатесов мало (5 из 9): luxuryShort 4, добираем базой, голода нет
$rl5 = array('grain' => 1000, 'food_lobster' => 5);
$el5 = food_feed_population($rl5, 30, 1000000, 100);
chk($res, 'деликатесов мало: взяли 5 из 9, luxuryShort 4, добор базой',
    abs($el5['lux_kg'] - 5) < 0.01 && abs($el5['luxury_short_kg'] - 4) < 0.01
    && abs($rl5['food_lobster']) < 0.01 && abs($el5['short_kg']) < 0.01
    && abs($el5['from_grain_kg'] - 25) < 0.01,
    'лангуст ' . $el5['lux_kg'] . ' / short ' . $el5['luxury_short_kg'] . ' / зерно ' . $el5['from_grain_kg']);

// счастье: +2 только при фактической доле ≥20 %
$midShare = food_lux_share(400000, 100);          // 4000 кр/чел → 10 %
$rl6 = array('grain' => 1000, 'food_lobster' => 100);
$el6 = food_feed_population($rl6, 30, 400000, 100);
$happyRich = food_lux_happy_bonus($el2['lux_share_actual'], 1);
$happyMid = food_lux_happy_bonus($el6['lux_share_actual'], 1);
$happyPoor = food_lux_happy_bonus($el3['lux_share_actual'], 1);
chk($res, 'счастье: богатый (30 %) +2, средний (10 %) 0, бедный 0',
    abs($midShare - 0.10) < 1e-9 && abs($happyRich - 2.0) < 1e-9
    && $happyMid == 0 && $happyPoor == 0,
    'богатый +' . $happyRich . ' / средний +' . $happyMid . ' / бедный +' . $happyPoor
    . ' (доля среднего ' . $el6['lux_share_actual'] . ')');

// сумма по base_price сходится с разбивкой и cost_total
$sumKg6 = 0.0; $sumCost6 = 0.0; $recalc6 = 0.0;
foreach ($el2['by'] as $row) { $sumKg6 += $row['kg']; $sumCost6 += $row['cost']; $recalc6 += $row['kg'] * $row['price']; }
chk($res, 'сумма по base_price: разбивка = cost_total = 2424 кр',
    abs($sumKg6 - 30) < 0.01 && abs($sumCost6 - 2424) < 0.01
    && abs($recalc6 - $el2['cost_total']) < 0.01,
    'кг ' . $sumKg6 . ' / сумма ' . $sumCost6 . ' / пересчёт ' . $recalc6);

// --- СЫРЬЁ ЗАВОДА (G-02) ---
$t2 = array(array('tier' => 2, 'count' => 1));
$res11 = array('water' => 5000, 'methane' => 800, 'nitrogen' => 200);
$p11 = food_plan(5000, $t2, 1000000, $res11, 1);          // 5000 × 0,3 = 1500 = суточный выпуск T2
$take11 = food_raw_take($res11, array('methane' => $p11['methane_need_kg'], 'nitrogen' => $p11['nitrogen_kg']));
chk($res, 'T2: выпуск 1500 кг, взято метан 750 / азот 180, остаток 50 / 20',
    abs($p11['produced_kg'] - 1500) < 0.01 && abs($take11['used_kg']['methane'] - 750) < 0.01
    && abs($take11['used_kg']['nitrogen'] - 180) < 0.01
    && abs($res11['methane'] - 50) < 0.01 && abs($res11['nitrogen'] - 20) < 0.01,
    'выпуск ' . $p11['produced_kg'] . ' / метан ' . $take11['used_kg']['methane'] . '→' . $res11['methane']
    . ' / азот ' . $take11['used_kg']['nitrogen'] . '→' . $res11['nitrogen']);
chk($res, 'сырьё со склада не оплачено деньгами: азот 0 кр, resource_limited=false',
    $p11['nitrogen_cost'] == 0 && $p11['resource_limited'] === false && $take11['limited'] === false,
    'cost ' . $p11['nitrogen_cost'] . ' / limit ' . var_export($p11['resource_limited'], true));

$res12 = array('water' => 5000);
$p12 = food_plan(5000, $t2, 1000000, $res12, 1);
$take12 = food_raw_take($res12, array('methane' => $p12['methane_need_kg'], 'nitrogen' => $p12['nitrogen_kg']));
chk($res, 'дефицит сырья → resource_limited, азот 180 кг за 540 кр',
    $p12['resource_limited'] === true && $take12['limited'] === true && abs($p12['nitrogen_cost'] - 540) < 0.01
    && abs($take12['used_kg']['methane']) < 0.01,
    'short метан ' . $p12['methane_short_kg'] . ' / азот ' . $p12['nitrogen_short_kg'] . ' / ' . $p12['nitrogen_cost'] . ' кр');

$t4 = array(array('tier' => 4, 'count' => 1));
$p13 = food_plan(30000, $t4, 5000000, array('water' => 50000), 1);   // 30000 × 0,3 = 9000 = выпуск T4
chk($res, 'T4: азот 0,10 кг/кг, метан 0, на 9000 кг еды — 900 кг азота',
    abs($p13['raw_per_kg']['nitrogen'] - 0.10) < 1e-6 && abs($p13['methane_need_kg']) < 0.01
    && abs($p13['nitrogen_kg'] - 900) < 0.01,
    'N ' . $p13['raw_per_kg']['nitrogen'] . ' кг/кг → ' . $p13['nitrogen_kg'] . ' кг, метан ' . $p13['methane_need_kg']);

$t1 = array(array('tier' => 1, 'count' => 1));
$p14 = food_plan(1000, $t1, 1000000, array('water' => 100000), 1);
chk($res, 'T1 как раньше: 300 кг еды → 36 кг азота / 108 кр',
    abs($p14['nitrogen_kg'] - 36) < 0.01 && abs($p14['nitrogen_cost'] - 108) < 0.01,
    $p14['nitrogen_kg'] . ' кг / ' . $p14['nitrogen_cost'] . ' кр');

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);
