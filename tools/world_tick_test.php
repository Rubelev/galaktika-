<?php
// H-01: частота событий — серверная. Клиентский {force:true} не должен обходить кулдаун.
// force разрешён только админу; обычный игрок получает 429 и wait_sec.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/world_econ.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

$now = 1000000;

// 1. первый тик вообще (событий ещё не было) — можно
$g = world_tick_gate(0, $now, false, false);
chk($res, 'первый тик разрешён, wait_sec = 0', $g['ok'] === true && $g['wait_sec'] === 0, 'wait ' . $g['wait_sec']);

// 2. два тика подряд обычным игроком: второй — 429 с wait_sec
$last = $now;                       // только что провели событие
$g2 = world_tick_gate($last, $now + 10, false, false);
chk($res, 'второй тик через 10 с отклонён (429)', $g2['ok'] === false, 'ok=' . var_export($g2['ok'], true));
chk($res, 'wait_sec второго тика = 3590', $g2['wait_sec'] === 3590, 'wait ' . $g2['wait_sec']);

// 3. обычный игрок с force — дыра закрыта: всё равно 429
$g3 = world_tick_gate($last, $now + 10, false, true);
chk($res, 'force от обычного игрока НЕ обходит кулдаун', $g3['ok'] === false && $g3['forced'] === false,
    'ok=' . var_export($g3['ok'], true) . ' / forced=' . var_export($g3['forced'], true));

// 4. админ с force — можно сразу
$g4 = world_tick_gate($last, $now + 10, true, true);
chk($res, 'админ с force проводит событие сразу', $g4['ok'] === true && $g4['forced'] === true,
    'wait ' . $g4['wait_sec']);

// 5. админ без force — тоже ждёт кулдаун (обход только осознанный, с force)
$g5 = world_tick_gate($last, $now + 10, true, false);
chk($res, 'админ без force ждёт кулдаун', $g5['ok'] === false, 'wait ' . $g5['wait_sec']);

// 6. ровно час прошёл — можно
$g6 = world_tick_gate($last, $now + 3600, false, false);
chk($res, 'через ровно 3600 с тик разрешён', $g6['ok'] === true && $g6['wait_sec'] === 0, 'wait ' . $g6['wait_sec']);

// 7. за секунду до часа — ещё нельзя, wait_sec = 1
$g7 = world_tick_gate($last, $now + 3599, false, false);
chk($res, 'за секунду до часа отклонён, wait_sec = 1', $g7['ok'] === false && $g7['wait_sec'] === 1, 'wait ' . $g7['wait_sec']);

// 8. битый lastSeen из будущего не ломает ожидание
$g8 = world_tick_gate($now + 5000, $now, false, false);
chk($res, 'lastSeen из будущего: wait_sec 0…3600, без минусов',
    $g8['wait_sec'] >= 0 && $g8['wait_sec'] <= 3600, 'wait ' . $g8['wait_sec']);

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);
