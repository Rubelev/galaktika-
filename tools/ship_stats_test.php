<?php
// Сверка клиентской таблицы SHIPS с серверной lib/ship_stats.php (C-08).
// Критерий: 9 моделей × 3 поля (hp/dmg/price) — все Δ = 0.
// Запуск: php ship_stats_test.php [фикстура.json] [путь к ship_stats.php]
$fixturePath = isset($argv[1]) ? $argv[1] : (__DIR__ . '/../reports/ship_stats_client.json');
$lib = isset($argv[2]) ? $argv[2] : (getenv('SHIP_STATS_LIB') ?: (__DIR__ . '/../site/lib/ship_stats.php'));
if (!file_exists($lib)) $lib = '/var/www/u3699164/data/www/warbattleuniverse.com/lib/ship_stats.php';
if (!file_exists($lib)) { fwrite(STDERR, "нет ship_stats.php: $lib\n"); exit(2); }
if (!file_exists($fixturePath)) { fwrite(STDERR, "нет фикстуры: $fixturePath\n"); exit(2); }
require $lib;

$fx = json_decode(file_get_contents($fixturePath), true);
if (!is_array($fx) || !isset($fx['ships'])) { fwrite(STDERR, "фикстура не читается\n"); exit(2); }

$client = array();
foreach ($fx['ships'] as $s) $client[$s['id']] = $s;

$pass = 0; $fail = 0; $rows = array();
function chk($name, $ok, $detail) {
    global $pass, $fail, $rows;
    if ($ok) $pass++; else $fail++;
    $rows[] = array('n' => $name, 'ok' => $ok, 'd' => $detail);
}

// 1) Набор моделей одинаковый и ровно 9
chk('моделей на клиенте: 9', count($client) === 9, count($client));
chk('моделей на сервере: 9', count(SHIP_STATS) === 9, count(SHIP_STATS));
$missClient = array_diff(array_keys(SHIP_STATS), array_keys($client));
$missServer = array_diff(array_keys($client), array_keys(SHIP_STATS));
chk('id совпадают', empty($missClient) && empty($missServer),
    'нет на клиенте: ' . implode(',', $missClient) . ' | нет на сервере: ' . implode(',', $missServer));

// 2) 27 сравнений hp/dmg/price
$cmp = 0; $bad = 0; $worst = 0; $worstAt = '';
foreach ($client as $id => $c) {
    if (!isset(SHIP_STATS[$id])) continue;
    $s = SHIP_STATS[$id];
    foreach (array('hp', 'dmg', 'price') as $f) {
        $cmp++;
        $d = abs((float)$s[$f] - (float)$c[$f]);
        if ($d > $worst) { $worst = $d; $worstAt = $id . '.' . $f; }
        if ($d != 0) {
            $bad++;
            echo "FAIL " . $id . '.' . $f . ': сервер ' . $s[$f] . ' ≠ клиент ' . $c[$f] . "\n";
        }
    }
}
chk('27 сравнений hp/dmg/price: все Δ=0', $cmp === 27 && $bad === 0,
    'сравнений ' . $cmp . ', расхождений ' . $bad . ', макс Δ ' . $worst . ($bad ? ' (' . $worstAt . ')' : ''));

// 3) Дополнительно: speed (9) и parts (9) — источники тоже не должны расходиться
$spdBad = 0;
foreach ($client as $id => $c) {
    if (abs((float)SHIP_STATS[$id]['speed'] - (float)$c['speed']) != 0) $spdBad++;
}
chk('speed: 9/9 Δ=0', $spdBad === 0, 'расхождений ' . $spdBad);

// parts есть у всех и совпадают с клиентскими (если клиент их передал)
$partsBad = 0; $partsChecked = 0;
foreach ($client as $id => $c) {
    if (!isset($c['parts'])) continue;
    $partsChecked++;
    if (SHIP_STATS[$id]['parts'] != $c['parts']) { $partsBad++; echo "FAIL parts " . $id . "\n"; }
}
chk('parts: ' . $partsChecked . '/' . $partsChecked . ' Δ=0', $partsBad === 0, 'расхождений ' . $partsBad);

// 4) Боевые проекции на месте (баланс перенесён, а не потерян)
chk('SHIP_COMBAT_STATS: 9 моделей', count(SHIP_COMBAT_STATS) === 9, count(SHIP_COMBAT_STATS));
$combatFields = array('name', 'hull', 'shield', 'armor', 'evade', 'energy', 'slots');
$cBad = 0;
foreach (SHIP_COMBAT_STATS as $id => $c) {
    foreach ($combatFields as $f) if (!isset($c[$f])) $cBad++;
}
chk('SHIP_COMBAT_STATS: все поля', $cBad === 0, 'пропусков ' . $cBad);
chk('BATTLE_CLASS_HP: 3 класса', count(BATTLE_CLASS_HP) === 3 && battle_class_hp('fighter') === 40
    && battle_class_hp('light') === 30 && battle_class_hp('hauler') === 20,
    json_encode(BATTLE_CLASS_HP));

// 5) C-10: имена серверных моделей = имена в SHIPS (id НЕ менялись)
$nameBad = 0; $renamed = array();
foreach ($client as $id => $c) {
    if (!isset(SHIP_STATS[$id])) continue;
    if (SHIP_STATS[$id]['name'] !== $c['name']) { $nameBad++; $renamed[] = $id . ': ' . SHIP_STATS[$id]['name'] . ' ≠ ' . $c['name']; }
}
chk('имена карточки = SHIPS: 9/9', $nameBad === 0, $nameBad ? implode('; ', $renamed) : 'все совпадают');

// 6) C-10: имена арены (то, что видно в бою) = имена в SHIPS
$arenaBad = 0; $arenaCmp = 0; $arenaDiff = array();
foreach ($client as $id => $c) {
    if (!isset(SHIP_COMBAT_STATS[$id])) continue;
    $arenaCmp++;
    if (SHIP_COMBAT_STATS[$id]['name'] !== $c['name']) {
        $arenaBad++;
        $arenaDiff[] = $id . ': ' . SHIP_COMBAT_STATS[$id]['name'] . ' ≠ ' . $c['name'];
    }
}
chk('имена арены = SHIPS: 9/9', $arenaCmp === 9 && $arenaBad === 0, $arenaBad ? implode('; ', $arenaDiff) : 'все 9 совпадают');

// 7) Генератор действительно смотрел в клиентскую таблицу
chk('происхождение: sha256 клиентского SHIPS', isset($fx['sha256']) && strpos(SHIP_STATS_SOURCE, $fx['sha256']) !== false,
    substr(SHIP_STATS_SOURCE, 0, 48));

foreach ($rows as $r) echo ($r['ok'] ? 'OK   ' : 'FAIL ') . $r['n'] . ($r['d'] !== '' ? ' — ' . $r['d'] : '') . "\n";
echo "\n=== ИТОГ ===\nпроверок: " . count($rows) . " | успешно: $pass | провалов: $fail\n";
exit($fail ? 1 : 0);
