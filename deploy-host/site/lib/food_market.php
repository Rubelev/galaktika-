<?php
// ============================================================================
//  FOOD_MARKET.PHP — рынок еды: заводская (дешёвая) и натуральная (деликатес).
//  Правило мира: натуральное стоит ×10 к заводскому аналогу.
//  Цены берутся из food_kind (lib/food_market_data.php), не выдумываются.
// ============================================================================

require_once __DIR__ . '/food_market_data.php';

const FOOD_TRADE_FEE = 0.05;    // 5 % сбор рынка

function food_market_list() {
    $out = array();
    foreach ((array)$GLOBALS['FOOD_KINDS'] as $k) {
        $out[] = array(
            'id' => $k['id'],
            'name' => $k['name'],
            'class' => $k['food_class'],
            'unit' => $k['unit'],
            'price' => $k['base_price'],
            'source_body' => $k['source_body'],
            'source_resource' => $k['source_resource'],
            'delicacy' => $k['food_class'] === 'delicacy',
            'note' => $k['note']
        );
    }
    return $out;
}

function food_market_def($id) {
    foreach ((array)$GLOBALS['FOOD_KINDS'] as $k) if ($k['id'] === $id) return $k;
    return null;
}

// Единая формула сделки: сколько списать/начислить и сколько останется
function food_market_quote($id, $qty, $side) {
    $def = food_market_def($id);
    if (!$def) return array('ok' => false, 'error' => 'нет такого вида еды');
    $q = (float)$qty;
    if ($q <= 0) return array('ok' => false, 'error' => 'количество должно быть больше нуля');
    if ($q > 100000) return array('ok' => false, 'error' => 'слишком много за раз (макс 100 000)');
    $price = (float)$def['base_price'];
    if ($side === 'buy') {
        $total = $price * $q;
        return array('ok' => true, 'side' => 'buy', 'id' => $id, 'qty' => $q,
                     'price' => $price, 'total' => round($total, 2),
                     'delicacy' => $def['food_class'] === 'delicacy');
    }
    if ($side === 'sell') {
        $gross = $price * $q * (1 - FOOD_TRADE_FEE);
        return array('ok' => true, 'side' => 'sell', 'id' => $id, 'qty' => $q,
                     'price' => $price, 'total' => round($gross, 2),
                     'fee' => round($price * $q * FOOD_TRADE_FEE, 2),
                     'delicacy' => $def['food_class'] === 'delicacy');
    }
    return array('ok' => false, 'error' => 'сторона сделки: buy или sell');
}

// Проверка правила «деликатес = ×10 к заводскому аналогу» (для тестов и аудита)
function food_market_ratio_check() {
    $byClass = array();
    foreach ((array)$GLOBALS['FOOD_KINDS'] as $k) {
        $byClass[$k['food_class']][] = $k;
    }
    $syntheticMin = null;
    foreach ($byClass['synthetic'] as $k) {
        if ($syntheticMin === null || $k['base_price'] < $syntheticMin) $syntheticMin = $k['base_price'];
    }
    $bad = array();
    foreach ($byClass['delicacy'] as $k) {
        if ($k['base_price'] < $syntheticMin * 10) $bad[] = $k['id'];
    }
    return array('synthetic_min' => $syntheticMin, 'violations' => $bad);
}
