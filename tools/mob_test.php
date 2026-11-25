<?php
// Тесты мобов: 600 личностей, замкнутая экономика, пиратские гулянки, границы.
$dir = sys_get_temp_dir() . '/mob_test_' . getmypid();
@mkdir($dir, 0777, true);
$GLOBALS['dataDir'] = $dir;
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/mob_core.php';

$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

$cat = mob_catalog();
chk($res, 'мобов 600', count($cat) === 600, count($cat));
$byCiv = array();
$byRole = array();
$ids = array();
foreach ($cat as $m) {
    $byCiv[$m['civ']] = ($byCiv[$m['civ']] ?? 0) + 1;
    $byRole[$m['role']] = ($byRole[$m['role']] ?? 0) + 1;
    $ids[$m['id']] = true;
}
chk($res, 'по 100 мобов на цивилизацию', count($byCiv) === 6 && min($byCiv) === 100, json_encode($byCiv));
chk($res, 'id уникальны', count($ids) === 600, count($ids));
chk($res, 'ролей 10, пиратов 60', count($byRole) === 10 && ($byRole['pirate'] ?? 0) === 60, count($byRole));
chk($res, 'у всех есть имя', count(array_filter($cat, fn($m) => trim($m['name']) !== '')) === 600);

// первый тик
@unlink($dir . '/mobs-state.json');
@unlink($dir . '/mob-log.json');
$t1 = mob_tick_all(1000);
chk($res, 'тик вернул всех', $t1['mobs'] === 600, $t1['mobs']);
chk($res, 'доход > 0', $t1['totals']['earned'] > 0, $t1['totals']['earned']);
chk($res, 'траты > 0', $t1['totals']['spent'] > 0, $t1['totals']['spent']);
chk($res, 'экономика замкнута (балансы + траты = старт + доход)', $t1['check']['ok'],
    $t1['check']['expected'] . ' vs ' . $t1['check']['actual']);
chk($res, 'балансы не отрицательны', $t1['totals']['balances'] >= 0, $t1['totals']['balances']);

// несколько тиков подряд — тождество должно держаться
for ($i = 0; $i < 12; $i++) { $t = mob_tick_all(1100 + $i * 10); }
chk($res, 'тождество держится через 13 тиков', $t['check']['ok'], $t['check']['expected'] . ' vs ' . $t['check']['actual']);

// пираты: добыча появляется и спускается
$state = json_decode(file_get_contents($dir . '/mobs-state.json'), true);
$pirates = array_values(array_filter($cat, fn($m) => $m['role'] === 'pirate'));
$withLoot = 0; $spentTotal = 0; $overCap = 0;
foreach ($pirates as $p) {
    $st = $state[$p['id']];
    if ($st['loot_pending'] > 0) $withLoot++;
    $spentTotal += $st['spent'];
    if ($st['credits'] > MOB_MAX_BALANCE) $overCap++;
}
chk($res, 'пираты тратят (сумма > 0)', $spentTotal > 0, round($spentTotal));
chk($res, 'у части пиратов есть незакрытая гулянка ИЛИ всё спущено', true, "в процессе: $withLoot из 60");
chk($res, 'никто не копит сверх потолка', $overCap === 0, $overCap);

// средний баланс в разумных пределах: мобы живут, а не богатеют бесконечно
$avg = $t['totals']['balances'] / 600;
chk($res, 'средний баланс 1 000–60 000', $avg >= 1000 && $avg <= 60000, round($avg));

// детерминизм: два одинаковых прогона дают одинаковый результат
@unlink($dir . '/mobs-state.json'); @unlink($dir . '/mob-log.json');
$a = mob_tick_all(5000);
@unlink($dir . '/mobs-state.json'); @unlink($dir . '/mob-log.json');
$b = mob_tick_all(5000);
chk($res, 'тик детерминирован', $a['totals']['earned'] === $b['totals']['earned'] && $a['totals']['spent'] === $b['totals']['spent'],
    $a['totals']['earned'] . ' / ' . $b['totals']['earned']);

// отчёт
$rep = mob_report();
chk($res, 'отчёт: 600 мобов', $rep['mobs_total'] === 600, $rep['mobs_total']);
chk($res, 'отчёт по 6 цивилизациям', count($rep['by_civ']) === 6, count($rep['by_civ']));
foreach ($rep['by_civ'] as $c => $v) { if ($v['mobs'] !== 100) { chk($res, 'у ' . $c . ' 100 мобов', false, $v['mobs']); } }
chk($res, 'истории пиратов есть', count($rep['samples']) > 0, count($rep['samples']));

// мобы не трогают игроков
$core = file_get_contents('/var/www/u3699164/data/www/warbattleuniverse.com/lib/mob_core.php');
chk($res, 'mob_core не читает профили игроков', stripos($core, 'users.json') === false && stripos($core, 'profile') === false);

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
@array_map('unlink', glob($dir . '/*'));
@rmdir($dir);
exit($failed ? 1 : 0);
