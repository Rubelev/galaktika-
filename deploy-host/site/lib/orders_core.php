<?php
require_once __DIR__ . '/motion_core.php';
// ============================================================================
//  ORDERS_CORE.PHP — приказы кораблям на сервере.
//  Приказ не хранит координаты: хранится очередь команд, позицию считает
//  единое ядро (motion_core.php: motion_pose_at / motion_validate).
// ============================================================================

const ORDERS_MAX = 24;

$GLOBALS['__order_ops'] = array(
    'MOVE_TO' => array('to'),
    'ORBIT'   => array('at'),
    'LAND'    => array('at'),
    'LOAD'    => array(),
    'UNLOAD'  => array(),
    'HOLD'    => array(),
    'PATROL'  => array('points')
);

function orders_validate_one($order) {
    $errors = array();
    if (!is_array($order) || !isset($order['op'])) return array('нет op');
    $op = $order['op'];
    if (!isset($GLOBALS['__order_ops'][$op])) return array('неизвестная команда: ' . $op);
    foreach ($GLOBALS['__order_ops'][$op] as $req) {
        if (!isset($order[$req]) || $order[$req] === '' || $order[$req] === null) {
            $errors[] = $op . ': нет параметра ' . $req;
        }
    }
    return $errors;
}

// Поставить приказ: проверяет команду и физику (скорость ≤ 0.95 c)
function orders_place($ship, $world, $order) {
    $errs = orders_validate_one($order);
    if ($errs) return array('ok' => false, 'errors' => $errs);

    $orders = isset($ship['orders']) ? $ship['orders'] : array();
    if (count($orders) >= ORDERS_MAX) {
        return array('ok' => false, 'errors' => array('очередь переполнена (' . ORDERS_MAX . ')'));
    }
    $orders[] = $order;
    $ship['orders'] = $orders;

    $val = motion_validate($ship, $world);
    if (!$val['ok']) {
        return array('ok' => false, 'errors' => $val['problems']);
    }
    return array('ok' => true, 'orders' => $orders, 'end' => $val['end']);
}

// Позиция корабля по его приказам
function orders_pose($ship, $world, $tMs) {
    return motion_pose_at($ship, $tMs, $world);
}

// Краткий отчёт по кораблю: где он и что делает
function orders_status($ship, $world, $tMs) {
    $p = motion_pose_at($ship, $tMs, $world);
    $val = motion_validate($ship, $world);
    return array(
        'x' => round($p['x'], 2), 'y' => round($p['y'], 2),
        'op' => $p['op'], 'done' => $p['done'],
        'orders' => count(isset($ship['orders']) ? $ship['orders'] : array()),
        'valid' => $val['ok'], 'problems' => $val['problems']
    );
}
