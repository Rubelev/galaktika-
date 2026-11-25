<?php
// DEF-261109-01 / DEF-261109-02: прогресс коллекции.
// owned — количество (0/1), время первого получения — first_at; have/collected/complete
// считаются по наличию предмета, а не по «истинности» времени.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/trophy_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

$now = 1794172254;                 // «живое» время из карточки дефекта

// ---------- 1. после одного дропа ----------
$items = trophy_items_of_set('race');
$first = $items[0];
$st = trophy_new_state($now - 10);
$st['items'][$first['id']] = $now;
$p = trophy_progress($st);
chk($res, 'owned = 1 после первого дропа (а не epoch-время)',
    isset($p['owned'][$first['id']]) && $p['owned'][$first['id']] === 1,
    'owned[' . $first['id'] . '] = ' . var_export($p['owned'][$first['id']], true));
chk($res, 'first_at ≈ now (±5 с)',
    isset($p['first_at'][$first['id']]) && abs($p['first_at'][$first['id']] - $now) <= 5,
    'first_at = ' . (isset($p['first_at'][$first['id']]) ? $p['first_at'][$first['id']] : '-'));
chk($res, 'ни одно owned не является временем: все значения 0 или 1',
    count(array_filter($p['owned'], function ($v) { return $v !== 0 && $v !== 1; })) === 0,
    'значений вне {0,1}: ' . count(array_filter($p['owned'], function ($v) { return $v !== 0 && $v !== 1; })));

// ---------- 2. дубликат ----------
$st2 = trophy_new_state($now);
foreach ($items as $it) $st2['items'][$it['id']] = $now;
$before = $st2['shards'];
$dup = trophy_roll($st2, 'race', $now, 'dup-def-01', function ($max) { return 1; });
$p2 = trophy_progress($st2);
chk($res, 'после дубликата owned не растёт: предметов 6, owned=1 у каждого',
    !empty($dup['duplicate']) && array_sum($p2['owned']) === 6,
    'сумма owned ' . array_sum($p2['owned']));
chk($res, 'после дубликата растут shards (+1)',
    (int)$st2['shards'] === (int)$before + 1 && (int)$dup['shards'] === 1,
    'shards ' . $before . ' → ' . $st2['shards']);

// ---------- 3. have / collected / set_complete ----------
$st3 = trophy_new_state($now);
$raceItems = trophy_items_of_set('race');
for ($i = 0; $i < 5; $i++) $st3['items'][$raceItems[$i]['id']] = $now - $i;
$p3 = trophy_progress($st3);
chk($res, 'have = число уникальных предметов (5)',
    $p3['have'] === 5 && $p3['have'] === count($st3['items']),
    'have ' . $p3['have'] . ' / уникальных ' . count($st3['items']));
chk($res, 'collected = сумма по сетам = have', $p3['collected'] === 5 && $p3['collected'] === $p3['have'],
    'collected ' . $p3['collected'] . ' / have ' . $p3['have']);
chk($res, 'set_complete false при 5 из 6, сумма сетов = have',
    $p3['by_set']['race']['complete'] === false && $p3['by_set']['race']['have'] === 5,
    'race ' . $p3['by_set']['race']['have'] . '/' . $p3['by_set']['race']['total']);
$st3['items'][$raceItems[5]['id']] = $now;
$p3b = trophy_progress($st3);
chk($res, 'set_complete true при 6 из 6, sets_complete = 1',
    $p3b['by_set']['race']['complete'] === true && $p3b['sets_complete'] === 1
    && $p3b['by_set']['race']['collected'] === 1,
    'совершено сетов ' . $p3b['sets_complete']);

// ---------- 4. «битое» состояние с прода (в items лежит epoch) ----------
$prod = array('items' => array('race_helmet' => 1794172254), 'shards' => 0, 'pity' => 0,
              'day' => trophy_day_key($now), 'rolls' => 1, 'sets' => array(),
              'lastRollId' => '', 'lastRoll' => null, 'lastRollAt' => 0, 'firstAt' => 1794172254);
$pp = trophy_progress($prod);
chk($res, 'старый профиль (items = epoch) читается верно: owned=1, have=1',
    $pp['owned']['race_helmet'] === 1 && $pp['have'] === 1 && $pp['collected'] === 1,
    'owned ' . $pp['owned']['race_helmet'] . ' / have ' . $pp['have']);

// ---------- 5. пустое состояние ----------
$pe = trophy_progress(trophy_new_state($now));
chk($res, 'пустая коллекция: have 0, collected 0, owned всё 0, first_at всё 0',
    $pe['have'] === 0 && $pe['collected'] === 0
    && array_sum($pe['owned']) === 0 && array_sum($pe['first_at']) === 0,
    'have ' . $pe['have'] . ' / total ' . $pe['total']);

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);
