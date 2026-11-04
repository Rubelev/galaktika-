<?php
// Тесты серверных приказов: валидация, очередь, позиция, физика.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/motion_core.php';
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/orders_core.php';

$res = array();
function chk(&$res, $name, $ok, $detail = '') {
    $res[] = array('n' => $name, 'ok' => (bool)$ok, 'd' => (string)$detail);
}

$world = array('bodies' => array(
    'earth' => array('x' => 0.0, 'y' => 0.0),
    'mars'  => array('x' => 102.0, 'y' => 0.0),
    'jupiter' => array('x' => 527.0, 'y' => 60.0)
));
$ship = array('id' => 's1', 'cls' => 'light', 'at' => 'earth', 'startedAt' => 0, 'orders' => array());

$r = orders_place($ship, $world, array('op' => 'TELEPORT'));
chk($res, 'неизвестная команда отклонена', !$r['ok'], implode(',', $r['errors']));

$r = orders_place($ship, $world, array('op' => 'MOVE_TO'));
chk($res, 'MOVE_TO без цели отклонён', !$r['ok'], implode(',', $r['errors']));

$r = orders_place($ship, $world, array('op' => 'MOVE_TO', 'to' => 'mars'));
chk($res, 'MOVE_TO принят', $r['ok'], 'приказов ' . count($r['orders']) . ', конец ' . round($r['end'] / 60000, 2) . ' мин');
chk($res, 'время перелёта положительное', $r['end'] > 0);

$ship['orders'] = $r['orders'];
$p = orders_pose($ship, $world, $r['end'] / 2);
chk($res, 'позиция конечна', is_finite($p['x']) && is_finite($p['y']), 'x=' . round($p['x'], 1) . ' y=' . round($p['y'], 1));
chk($res, 'команда в полёте — MOVE_TO', $p['op'] === 'MOVE_TO', $p['op']);

$st = orders_status($ship, $world, 0);
chk($res, 'статус: приказов 1', $st['orders'] === 1, $st['orders']);
chk($res, 'статус: физика валидна', $st['valid'] === true, implode(',', $st['problems']));

// скорость на плече не выше 0.95 c
$km = 102.0 * MOTION_KM_PER_PX;
$v = $km / ($r['end'] / 1000.0);
chk($res, 'скорость ≤ 0.95 c', $v <= MOTION_C_KM_S * 0.95, round($v) . ' км/с');

// переполнение очереди
$s2 = array('id' => 's2', 'cls' => 'hauler', 'at' => 'earth', 'startedAt' => 0, 'orders' => array());
$overflow = false;
for ($i = 0; $i < 30; $i++) {
    $rr = orders_place($s2, $world, array('op' => 'HOLD', 'sec' => 10));
    if (!$rr['ok']) { $overflow = true; break; }
    $s2['orders'] = $rr['orders'];
}
chk($res, 'очередь ограничена', $overflow, 'лимит ' . ORDERS_MAX);

// после всех приказов — DONE
$p2 = orders_pose($ship, $world, $r['end'] + 1000);
chk($res, 'после очереди — DONE', $p2['done'] === true, $p2['op']);

$failed = 0;
foreach ($res as $x) {
    echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n";
    if (!$x['ok']) $failed++;
}
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);