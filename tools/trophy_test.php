<?php
// TZ-261108-02 «Трофейная коллекция»: каталог, лимит 5/сутки, дубликаты, крафт,
// сеты и бонусы, идемпотентность, отсутствие кристаллов, математика сбора.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/trophy_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }
function st_new($now = 1000000) {
    $s = trophy_new_state($now);
    return $s;
}

// ---------- каталог ----------
$items = trophy_items();
$sets = trophy_sets();
chk($res, 'каталог: 24 предмета', count($items) === 24, count($items));
chk($res, 'сетов 4, в каждом по 6',
    count($sets) === 4 && count(trophy_items_of_set('arena')) === 6
    && count(trophy_items_of_set('race')) === 6
    && count(trophy_items_of_set('fleet')) === 6
    && count(trophy_items_of_set('colony')) === 6,
    implode('/', array_map(function ($s) { return count(trophy_items_of_set($s['id'])); }, $sets)));
$ids = trophy_item_ids();
chk($res, 'id предметов уникальны, у каждого валидный сет',
    count($ids) === count(array_unique($ids)) && count(array_filter($items, function ($it) {
        return trophy_set_def($it['set']) === null;
    })) === 0,
    count(array_unique($ids)) . ' уникальных');

// ---------- лимит 5 бросков в сутки ----------
$now = 1794000000;                       // фиксированное «сейчас»
$st = st_new($now);
$okCount = 0; $last = null;
for ($i = 0; $i < 5; $i++) {
    $r = trophy_roll($st, 'arena', $now, 'roll-' . $i);
    if (!empty($r['ok'])) $okCount++;
    $last = $r;
}
chk($res, 'лимит: 5 бросков подряд разрешены', $okCount === 5, $okCount . '/5');
chk($res, 'лимит: 5-й бросок оставил 0 попыток', $last['rolls_left'] === 0, $last['rolls_left']);
$sixth = trophy_roll($st, 'arena', $now, 'roll-6');
chk($res, 'лимит: 6-й бросок → 429', empty($sixth['ok']) && (int)$sixth['code'] === 429,
    'code ' . (isset($sixth['code']) ? $sixth['code'] : '-'));
chk($res, 'лимит: 6-й бросок отдаёт wait_sec до 00:00 МСК',
    isset($sixth['wait_sec']) && $sixth['wait_sec'] > 0 && $sixth['wait_sec'] <= 86400, $sixth['wait_sec']);

// сброс по календарному дню: следующий день — снова 5
$stDay = $st;
$nextDay = $now + 86400;
trophy_normalize($stDay, $nextDay);
chk($res, 'сброс по дню: новый день — 0 использовано',
    (int)$stDay['rolls'] === 0 && $stDay['day'] !== trophy_day_key($now), $stDay['day']);
$afterReset = trophy_roll($stDay, 'arena', $nextDay, 'roll-nextday');
chk($res, 'сброс по дню: бросок на следующий день разрешён', !empty($afterReset['ok']), json_encode($afterReset['ok']));

// ---------- дроп 20 % и pity ----------
$drops = 0; $rolls = 0;
mt_srand(20261109);
$st2 = st_new($now);
for ($i = 0; $i < 5000; $i++) {
    $st2['rolls'] = 0;                   // симулируем: каждый бросок — новый день
    $r = trophy_roll($st2, 'arena', $now + $i, 'p' . $i);
    $rolls++;
    if (!empty($r['drop']) || !empty($r['duplicate'])) $drops++;
}
$rate = $rolls > 0 ? $drops / $rolls : 0;
chk($res, 'дроп 18–26 % (20 % + pity)', $rate >= 0.18 && $rate <= 0.26, round($rate * 100, 2) . '%');

// pity: если 9 раз не повезло — 10-й гарантирован
$st3 = st_new($now);
$st3['pity'] = 9;
$forced = trophy_roll($st3, 'arena', $now, 'pity-x', function ($max) { return $max; });   // rng = максимум → без дропа
chk($res, 'pity: 10-й бросок без нового предмета гарантирует предмет',
    !empty($forced['forced']) && (!empty($forced['drop']) || !empty($forced['duplicate'])),
    'forced=' . var_export($forced['forced'], true) . ' drop=' . var_export($forced['drop'], true));

// ---------- дубликат → осколок ----------
$st4 = st_new($now);
foreach (trophy_items_of_set('arena') as $it) $st4['items'][$it['id']] = $now;
$dup = trophy_roll($st4, 'arena', $now, 'dup-1', function ($max) { return 1; });
chk($res, 'дубликат: предмет уже есть → +1 осколок',
    !empty($dup['duplicate']) && (int)$dup['shards'] === 1 && (int)$st4['shards'] === 1,
    'осколков ' . $st4['shards']);

// ---------- крафт ----------
$st5 = st_new($now);
$st5['shards'] = 5;
$craft = trophy_craft($st5, 'fleet', 'fleet_cutlass', $now);
chk($res, 'крафт: 5 осколков → предмет, осколки списаны',
    !empty($craft['ok']) && (int)$st5['shards'] === 0 && isset($st5['items']['fleet_cutlass']),
    'осколков ' . $st5['shards']);
$st6 = st_new($now);
$st6['shards'] = 4;
$poor = trophy_craft($st6, 'fleet', 'fleet_cutlass', $now);
chk($res, 'крафт: при 4 осколках отказ', empty($poor['ok']) && (int)$poor['code'] === 400, $poor['error']);
$again = trophy_craft($st5, 'fleet', 'fleet_cutlass', $now);
chk($res, 'крафт: повторно тот же предмет — отказ', empty($again['ok']), $again['error']);

// ---------- сет и бонусы ----------
$st7 = st_new($now);
foreach (trophy_items_of_set('arena') as $it) {
    $st7['items'][$it['id']] = $now;
}
$st7['sets'] = array('arena' => $now);
$bon = trophy_bonuses($st7);
chk($res, 'сет «Арены» собран → +2 %', abs($bon['by_set']['arena'] - 0.02) < 1e-9 && abs($bon['total'] - 0.02) < 1e-9,
    $bon['total']);

$st8 = st_new($now);
foreach (array('arena', 'fleet', 'colony') as $sid) $st8['sets'][$sid] = $now;
$st8['items'] = array_fill_keys(trophy_item_ids(), $now);
$bon8 = trophy_bonuses($st8);
chk($res, 'три экономических сета → +6 %, не больше', abs($bon8['total'] - 0.06) < 1e-9, $bon8['total']);

$st9 = st_new($now);
foreach (trophy_items_of_set('race') as $it) $st9['items'][$it['id']] = $now;
$st9['sets'] = array('race' => $now);
$bon9 = trophy_bonuses($st9);
chk($res, 'сет «Гонки» — косметика: 0 % экономики',
    abs($bon9['by_set']['race']) < 1e-9 && abs($bon9['total']) < 1e-9 && in_array('race', $bon9['cosmetic'], true),
    'total ' . $bon9['total'] . ', косметика: ' . implode(',', $bon9['cosmetic']));

// ---------- идемпотентность ----------
$st10 = st_new($now);
$r1 = trophy_roll($st10, 'colony', $now, 'same-id-123');
$usedAfter1 = (int)$st10['rolls'];
$r2 = trophy_roll($st10, 'colony', $now, 'same-id-123');
chk($res, 'идемпотентность: тот же roll_id → тот же результат, бросок не потрачен',
    !empty($r2['replay']) && (int)$st10['rolls'] === $usedAfter1
    && (int)$r2['rolls_used'] === (int)$r1['rolls_used'],
    'бросков ' . $st10['rolls']);

// ---------- нет кристаллов в награде ----------
$noCrystals = true;
foreach (array($r1, $r2, $dup, $craft, $forced) as $r) {
    if (isset($r['crystals']) || isset($r['eternity']) || isset($r['reward']['crystals'])) $noCrystals = false;
}
chk($res, 'в награде нет кристаллов', $noCrystals);

// ---------- 24/24 достижимо + математика ----------
function sim_collect($seed, $policy = 'focus', $maxRolls = 4000) {
    mt_srand($seed);
    $st = st_new(1000000);
    $rolls = 0; $firstSet = 0; $now = 1000000;
    $setIds = array(); foreach (trophy_sets() as $s) $setIds[] = $s['id'];
    while (count($st['items']) < 24 && $rolls < $maxRolls) {
        $st['rolls'] = 0;                                  // новый день
        if ($policy === 'random') {
            $set = $setIds[mt_rand(0, count($setIds) - 1)];
        } else {
            $best = $setIds[0]; $bestMissing = 99;
            foreach ($setIds as $sid) {
                $miss = 0;
                foreach (trophy_items_of_set($sid) as $it) if (!isset($st['items'][$it['id']])) $miss++;
                if ($miss > 0 && $miss < $bestMissing) { $bestMissing = $miss; $best = $sid; }
            }
            $set = $best;
        }
        trophy_roll($st, $set, $now++, '');
        $rolls++;
        while ((int)$st['shards'] >= 5) {                  // крафт в сете, где меньше всего не хватает
            $bestSet = null; $bestItem = null; $bestMissing = 99;
            foreach ($setIds as $sid) {
                $missing = array();
                foreach (trophy_items_of_set($sid) as $it) if (!isset($st['items'][$it['id']])) $missing[] = $it['id'];
                if (count($missing) > 0 && count($missing) < $bestMissing) {
                    $bestMissing = count($missing); $bestSet = $sid; $bestItem = $missing[0];
                }
            }
            if ($bestSet === null) break;
            trophy_craft($st, $bestSet, $bestItem, $now++);
        }
        if ($firstSet === 0 && count($st['sets']) > 0) $firstSet = $rolls;
    }
    return array('rolls' => $rolls, 'first_set' => $firstSet, 'have' => count($st['items']));
}

$n = 60; $full = 0;
$focusRolls = 0; $focusFirst = 0; $randRolls = 0; $randFirst = 0;
for ($i = 0; $i < $n; $i++) {
    $one = sim_collect(7000 + $i, 'focus');
    $focusRolls += $one['rolls'];
    $focusFirst += $one['first_set'] ? $one['first_set'] : $one['rolls'];
    if ($one['have'] === 24) $full++;
    $two = sim_collect(9000 + $i, 'random');
    $randRolls += $two['rolls'];
    $randFirst += $two['first_set'] ? $two['first_set'] : $two['rolls'];
}
$avgFocus = $focusRolls / $n; $avgFocusFirst = $focusFirst / $n;
$avgRand = $randRolls / $n; $avgRandFirst = $randFirst / $n;
chk($res, '24/24 достижимо во всех прогонах', $full === $n, $full . '/' . $n);
chk($res, 'целевой сбор: первый сет 25–60 бросков (ТЗ: 36)', $avgFocusFirst >= 25 && $avgFocusFirst <= 60, round($avgFocusFirst, 1));
chk($res, 'целевой сбор: 24/24 110–190 бросков (ТЗ: 145)', $avgFocus >= 110 && $avgFocus <= 190, round($avgFocus, 1));
chk($res, 'активности вперемешку: первый сет 60–130, все 24 — 150–280',
    $avgRandFirst >= 60 && $avgRandFirst <= 130 && $avgRand >= 150 && $avgRand <= 280,
    round($avgRandFirst, 1) . ' / ' . round($avgRand, 1));
chk($res, 'дней на 24/24 при 5 бросках/сутки: целевой 22–38',
    $avgFocus / 5 >= 22 && $avgFocus / 5 <= 38, round($avgFocus / 5, 1) . ' дн.');

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== МАТЕМАТИКА (60 прогонов, лимит 5/сутки) ===\n";
printf("целевой сбор:   первый сет %.1f бросков = %.1f дней · 24/24 %.1f бросков = %.1f дней\n",
    $avgFocusFirst, $avgFocusFirst / 5, $avgFocus, $avgFocus / 5);
printf("вперемешку:     первый сет %.1f бросков = %.1f дней · 24/24 %.1f бросков = %.1f дней\n",
    $avgRandFirst, $avgRandFirst / 5, $avgRand, $avgRand / 5);
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);
