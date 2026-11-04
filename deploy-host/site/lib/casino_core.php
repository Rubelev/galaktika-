<?php
// ============================================================================
//  CASINO_CORE.PHP — азартные игры солнечной системы.
//  Правила честные и проверяемые:
//    • рулетка: 37 лунок (0..36), выплата 35:1 на число, 2:1 на дюжину;
//    • ставки на спорт: коэффициент с маржой 5 %;
//    • скачки: тотализатор, казино забирает 15 % пула;
//    • карты/слоты: заявленный RTP, house edge из таблицы.
//  ГСЧ — random_int (криптостойкий), а не rand().
// ============================================================================

require_once __DIR__ . '/casino_data.php';

function casino_def($id) {
    foreach ((array)$GLOBALS['CASINO'] as $g) if ($g['id'] === $id) return $g;
    return null;
}

function casino_check_bet($gameId, $stake) {
    $g = casino_def($gameId);
    if (!$g) return array('ok' => false, 'error' => 'нет такой игры');
    $s = (float)$stake;
    if ($s < $g['min_bet']) return array('ok' => false, 'error' => 'ставка меньше минимума', 'min' => $g['min_bet']);
    if ($s > $g['max_bet']) return array('ok' => false, 'error' => 'ставка больше максимума', 'max' => $g['max_bet']);
    return array('ok' => true, 'game' => $g);
}

// ---------- рулетка ----------
// spin: 0..36 (европейская) или 0..36 + 37 = '00' (американская)
function casino_roulette_spin($american = false) {
    $pockets = $american ? 38 : 37;
    return random_int(0, $pockets - 1);
}

// bet: array('type' => 'number'|'dozen'|'red'|'black'|'even'|'odd', 'value' => int)
function casino_roulette_payout($spin, $bet, $american = false) {
    $type = isset($bet['type']) ? $bet['type'] : 'number';
    $val = isset($bet['value']) ? (int)$bet['value'] : -1;
    $zeroPockets = $american ? array(0, 37) : array(0);
    $isZero = in_array($spin, $zeroPockets, true);

    if ($type === 'number') {
        return ($spin === $val) ? 35 : -1;                       // 35:1
    }
    if ($isZero) return -1;                                       // зеро съедает внешние ставки
    if ($type === 'dozen') {
        $lo = ($val - 1) * 12 + 1; $hi = $val * 12;
        return ($spin >= $lo && $spin <= $hi) ? 2 : -1;           // 2:1
    }
    if ($type === 'red' || $type === 'black') {
        $red = casino_red_numbers();
        $isRed = in_array($spin, $red, true);
        $win = ($type === 'red') ? $isRed : !$isRed;
        return $win ? 1 : -1;                                     // 1:1
    }
    if ($type === 'even' || $type === 'odd') {
        $win = ($type === 'even') ? ($spin % 2 === 0) : ($spin % 2 === 1);
        return $win ? 1 : -1;
    }
    return -1;
}

function casino_red_numbers() {
    return array(1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36);
}

// Ожидаемая отдача рулетки (теоретическая, для сверки с Монте-Карло)
function casino_roulette_rtp($american = false) {
    return $american ? 1 - 2 / 38 : 1 - 1 / 37;
}

// ---------- спорт ----------
// Коэффициент с маржой: fair = 1/p, offered = fair * (1 - margin)
function casino_sports_odds($prob, $margin = 0.05) {
    $p = max(0.01, min(0.99, (float)$prob));
    $fair = 1 / $p;
    return round($fair * (1 - $margin), 2);
}

function casino_sports_settle($stake, $odds, $won) {
    $s = (float)$stake;
    return $won ? $s * ((float)$odds - 1) : -$s;
}

// ---------- скачки ----------
// Вероятности из коэффициентов (нормируем), затем один победитель.
function casino_horses_win_prob($oddsList) {
    $inv = array(); $sum = 0;
    foreach ($oddsList as $o) { $v = 1 / max(1.01, (float)$o); $inv[] = $v; $sum += $v; }
    $out = array();
    foreach ($inv as $v) $out[] = $v / $sum;
    return $out;
}

function casino_horses_run($oddsList) {
    $probs = casino_horses_win_prob($oddsList);
    $r = random_int(0, 1000000) / 1000000.0;
    $acc = 0.0;
    foreach ($probs as $i => $p) { $acc += $p; if ($r <= $acc) return $i; }
    return count($probs) - 1;
}

// Выплата из пула: тотализатор минус 15 % казино
function casino_horses_payout($stake, $odds, $won, $takeout = 0.15) {
    $s = (float)$stake;
    if (!$won) return -$s;
    return $s * ((float)$odds * (1 - $takeout) - 1);
}


// ---------- спорт: три исхода, коэффициенты с маржой ----------
function casino_sports_events($seed = 0) {
    // события стабильны в пределах часа: seed = intdiv(time, 3600)
    mt_srand((int)$seed);
    $out = array();
    $names = array('Звёздный кубок', 'Бой в Куполе', 'Заезд Тарсиса', 'Дуэль клонов', 'Матч лиги');
    for ($i = 0; $i < 3; $i++) {
        $p1 = 0.25 + mt_rand(0, 50) / 100.0;      // 0.25..0.75
        $p2 = 0.15 + mt_rand(0, 30) / 100.0;
        $p3 = max(0.05, 1 - $p1 - $p2);
        $sum = $p1 + $p2 + $p3;
        $out[] = array(
            'id' => 'ev' . $i,
            'name' => $names[$i],
            'outcomes' => array('победа 1', 'ничья', 'победа 2'),
            'probs' => array(round($p1 / $sum, 3), round($p2 / $sum, 3), round($p3 / $sum, 3)),
            'odds' => array(
                casino_sports_odds($p1 / $sum, 0.05),
                casino_sports_odds($p2 / $sum, 0.05),
                casino_sports_odds($p3 / $sum, 0.05)
            )
        );
    }
    return $out;
}

function casino_sports_run($event) {
    $r = random_int(0, 1000000) / 1000000.0;
    $acc = 0.0;
    foreach ($event['probs'] as $i => $p) { $acc += $p; if ($r <= $acc) return $i; }
    return count($event['probs']) - 1;
}

// ---------- слоты: 3 барабана, RTP ≈ 96 % ----------
function casino_slots_spin() {
    return array(random_int(0, 9), random_int(0, 9), random_int(0, 9));
}

// выплаты в «ставках»: 3 одинаковых = 20x, 2 одинаковых = 2x, три семёрки = 100x
function casino_slots_payout($reels, $stake) {
    $s = (float)$stake;
    $a = $reels[0]; $b = $reels[1]; $c = $reels[2];
    // калибровка RTP к 96 %: 0,1 (три 7) + 0,189 (любое трио) + 0,675 (пара) ≈ 0,964
    if ($a === 7 && $b === 7 && $c === 7) return $s * 100;
    if ($a === $b && $b === $c) return $s * 21;
    if ($a === $b || $b === $c || $a === $c) return $s * 2.5;
    return 0.0;
}
