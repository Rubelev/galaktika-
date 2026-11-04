<?php
// Тесты расписания заездов: одинаковый старт для всех, шаг 6 ч, живой заезд.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/race_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

$t0 = 1793500000000;                 // фиксированный момент
$a = race_schedule($t0, 3);
$b = race_schedule($t0, 3);
chk($res, 'расписание детерминировано', json_encode($a) === json_encode($b));
chk($res, 'шаг между заездами 6 ч', ($a['races'][1]['start'] - $a['races'][0]['start']) === RACE_PERIOD_MS,
    ($a['races'][1]['start'] - $a['races'][0]['start']) / 3600000 . ' ч');
chk($res, 'старт в будущем', $a['next'] > $t0, gmdate('Y-m-d H:i', (int)($a['next']/1000)) . ' UTC');
chk($res, 'до старта ≤ 6 ч', ($a['next'] - $t0) <= RACE_PERIOD_MS, round(($a['next'] - $t0)/60000) . ' мин');
chk($res, 'заездов выдано 3', count($a['races']) === 3, count($a['races']));

// два «клиента» в разное время в пределах того же окна видят один старт
$c1 = race_next_start($t0);
$c2 = race_next_start($t0 + 60000);
chk($res, 'все игроки видят один старт', $c1 === $c2, "$c1 vs $c2");

// живой заезд определяется в окне 40 мин после старта
$live = race_live($c1 + 5 * 60000);
chk($res, 'через 5 мин заезд идёт', is_array($live) && $live['left_sec'] > 0, json_encode($live));
$after = race_live($c1 + 45 * 60000);
chk($res, 'через 45 мин заезда нет', $after === null);

// ровно на старте in_sec = 0
$exact = race_schedule($c1, 1);
chk($res, 'ровно на старте in_sec=0', $exact['races'][0]['in_sec'] === 0, $exact['races'][0]['in_sec']);

$failed = 0;
foreach ($res as $x) {
    echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n";
    if (!$x['ok']) $failed++;
}
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);