<?php
// ============================================================================
//  CASINO_VEGAS.PHP — Кеп-Вегас: зоны, залы, игры.
//
//  Пять зон: рулетки, автоматы, карты, скачки, спорт.
//  У каждой игры есть house edge из каталога; математика проверяется тестом
//  (Монте-Карло для рулетки и автоматов).
//
//  Важно: заявленный edge и фактический должны совпадать ±1 п.п.
//  Если меняешь правила — меняй edge в базе, иначе тест поймает расхождение.
// ============================================================================

require_once __DIR__ . '/casino_data.php';
require_once __DIR__ . '/casino_halls_data.php';

// ---------- зоны и залы ----------
function casino_zones() { return (array)$GLOBALS['CASINO_ZONES']; }
function casino_halls($zoneId = null) {
    $out = array();
    foreach ((array)$GLOBALS['CASINO_HALLS'] as $h) {
        if ($zoneId === null || $h['zone_id'] === $zoneId) $out[] = $h;
    }
    return $out;
}
function casino_zone_games($zoneId) {
    $out = array();
    foreach ((array)$GLOBALS['CASINO'] as $g) if (($g['zone_id'] ?? '') === $zoneId) $out[] = $g;
    return $out;
}

// ---------- рулетка: правила по вариантам ----------
function roulette_rules($gameId) {
    $map = array(
        'roulette_eu'    => array('pockets' => 37, 'zeros' => 1, 'partage' => false, 'commission' => 0.0, 'mult_mode' => false),
        'roulette_fr'    => array('pockets' => 37, 'zeros' => 1, 'partage' => true,  'commission' => 0.0, 'mult_mode' => false),
        'roulette_us'    => array('pockets' => 38, 'zeros' => 2, 'partage' => false, 'commission' => 0.0, 'mult_mode' => false),
        'roulette_ru'    => array('pockets' => 36, 'zeros' => 1, 'partage' => false, 'commission' => 0.05, 'mult_mode' => false),
        'roulette_mini'  => array('pockets' => 13, 'zeros' => 1, 'partage' => false, 'commission' => 0.0, 'mult_mode' => false),
        'roulette_light' => array('pockets' => 37, 'zeros' => 1, 'partage' => false, 'commission' => 0.0, 'mult_mode' => true),
    );
    return $map[$gameId] ?? $map['roulette_eu'];
}

// Теоретический edge по правилам: считаем по всем ставкам, кроме множителей
function roulette_edge($gameId) {
    $r = roulette_rules($gameId);
    $n = $r['pockets'];
    $zeros = (int)($r['zeros'] ?? 1);
    $zeroShare = $zeros / $n;
    $edge = $zeroShare;                      // зеро забирает внешние ставки
    if ($r['partage']) $edge = $zeroShare / 2;  // La Partage: половина назад
    // комиссия с выигрышей добавляет к edge
    $edge += $r['commission'] * (1 - $zeroShare);
    return $edge;
}

function roulette_spin($gameId) {
    $r = roulette_rules($gameId);
    $p = random_int(0, $r['pockets'] - 1);
    $mult = 1;
    if ($r['mult_mode'] && $p !== 0 && random_int(1, 100) <= 3) {
        $mults = array(50, 100, 150, 250, 500);
        $mult = $mults[random_int(0, count($mults) - 1)];
    }
    return array('pocket' => $p, 'mult' => $mult);
}

// Выплата по ставке: множитель к ставке (0 = проигрыш, 1 = возврат)
function roulette_payout_mult($gameId, $pocket, $bet) {
    $r = roulette_rules($gameId);
    $type = $bet['type'] ?? 'red';
    $val = (int)($bet['value'] ?? -1);
    $zero = ($pocket === 0);
    $n = $r['pockets'];

    if ($type === 'number') {
        if ($pocket === $val) {
            $win = 36;                          // 35:1 + возврат ставки
            if ($r['commission'] > 0) $win = 36 - 35 * $r['commission'];
            return $win;
        }
        return 0;
    }
    if ($zero) {
        if ($r['partage']) return 0.5;   // La Partage: половина ставки назад
        return 0;
    }
    if ($type === 'red' || $type === 'black') {
        $reds = array(1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36);
        $isRed = in_array($pocket, $reds, true);
        $win = (($type === 'red') === $isRed);
        if (!$win) return 0;
        $m = 2;                             // 1:1 + ставка
        if ($r['commission'] > 0) $m = 2 - (float)$r['commission'];
        return $m;
    }
    if ($type === 'dozen') {
        $lo = ($val - 1) * 12 + 1; $hi = $val * 12;
        if ($pocket < $lo || $pocket > $hi) return 0;
        $m = 3;                             // 2:1 + ставка
        if ($r['commission'] > 0) $m = 3 - 2 * (float)$r['commission'];
        return $m;
    }
    if ($type === 'even' || $type === 'odd') {
        $win = ($type === 'even') ? ($pocket % 2 === 0) : ($pocket % 2 === 1);
        if (!$win) return 0;
        return $r['commission'] > 0 ? (2 - (float)$r['commission']) : 2;
    }
    return 0;
}

// ---------- автоматы: 100 вариантов, RTP из каталога ----------
// 3 барабана × 10 символов, пара ×2.5, трио ×M3. RTP = 0.1 + 0.009·M3 + 0.27·2.5
function slots_triple_mult($rtp) {
    $m3 = ($rtp - 0.1 - 0.675) / 0.009;
    return max(10, min(40, (int)round($m3)));
}

function slots_spin_cfg($rtp) {
    return array(random_int(0, 9), random_int(0, 9), random_int(0, 9));
}

function slots_payout_cfg($reels, $stake, $rtp) {
    $a = $reels[0]; $b = $reels[1]; $c = $reels[2];
    $m3 = slots_triple_mult($rtp);
    if ($a === 7 && $b === 7 && $c === 7) return $stake * 100;   // джекпот-трио
    if ($a === $b && $b === $c) return $stake * $m3;
    if ($a === $b || $b === $c || $a === $c) return $stake * 2.5;
    return 0.0;
}

// ---------- карты ----------
// Блэкджек: упрощённая раздача до 21 (дилер стоит на 17), выплата 1:1, блэкджек 3:2
function card_value($c) {
    if (in_array($c, array('J','Q','K'), true)) return 10;
    if ($c === 'A') return 11;
    return (int)$c;
}

function blackjack_deal() {
    $deck = array();
    foreach (array('2','3','4','5','6','7','8','9','10','J','Q','K','A') as $c) {
        for ($i = 0; $i < 4; $i++) $deck[] = $c;
    }
    shuffle($deck);
    return $deck;
}

function hand_total($hand) {
    $sum = 0; $aces = 0;
    foreach ($hand as $c) {
        $v = card_value($c);
        if ($c === 'A') $aces++;
        $sum += $v;
    }
    while ($sum > 21 && $aces > 0) { $sum -= 10; $aces--; }
    return $sum;
}

// Раунд блэкджека: игрок берёт до 17, дилер до 17. Возврат: множитель к ставке
function blackjack_round($switch = false) {
    $deck = blackjack_deal();
    $p = array($deck[0], $deck[1]);
    $d = array($deck[2], $deck[3]);
    $i = 4;
    $pt = hand_total($p);
    $pt2 = $switch ? hand_total(array($p[0], $d[1])) : $pt;

    // простая стратегия: до 16 берём
    while ($pt < 17 && $i < count($deck)) { $p[] = $deck[$i++]; $pt = hand_total($p); }
    if ($switch) { $pt2 = hand_total(array($p[0], $d[1])); $pt = max($pt, $pt2); }

    if ($pt > 21) return 0.0;
    while (hand_total($d) < 17 && $i < count($deck)) { $d[] = $deck[$i++]; }
    $dt = hand_total($d);
    if ($dt > 21) return 2.0;
    if ($pt === 21 && count($p) === 2) return 2.5;   // блэкджек 3:2
    if ($pt > $dt) return 2.0;
    if ($pt === $dt) return 1.0;
    return 0.0;
}

// Три-карточный покер: выплаты по комбинации
function poker_three_deal() {
    $deck = array();
    foreach (array('2','3','4','5','6','7','8','9','10','J','Q','K','A') as $c) {
        for ($i = 0; $i < 4; $i++) $deck[] = array('r' => $c, 's' => $i);
    }
    shuffle($deck);
    return array_slice($deck, 0, 3);
}

function poker_three_rank($hand) {
    $ranks = array();
    $suits = array();
    $order = array('2'=>2,'3'=>3,'4'=>4,'5'=>5,'6'=>6,'7'=>7,'8'=>8,'9'=>9,'10'=>10,'J'=>11,'Q'=>12,'K'=>13,'A'=>14);
    foreach ($hand as $c) { $ranks[] = $order[$c['r']]; $suits[] = $c['s']; }
    sort($ranks);
    $flush = (count(array_unique($suits)) === 1);
    $straight = ($ranks[2] - $ranks[1] === 1 && $ranks[1] - $ranks[0] === 1) || ($ranks === array(2,3,14));
    if ($ranks[0] === $ranks[1] && $ranks[1] === $ranks[2]) return array('name' => 'сет', 'mult' => 30);
    if ($straight && $flush) return array('name' => 'стрит-флеш', 'mult' => 40);
    if ($straight) return array('name' => 'стрит', 'mult' => 6);
    if ($flush) return array('name' => 'флеш', 'mult' => 3.5);
    if ($ranks[0] === $ranks[1] || $ranks[1] === $ranks[2]) return array('name' => 'пара', 'mult' => 1);
    return array('name' => 'старшая карта', 'mult' => 0);
}

// Бридж: ставка на пару в турнирном контракте (упрощённо — вероятностный исход)
function bridge_round($pairOdds) {
    $probs = array();
    foreach ($pairOdds as $o) $probs[] = 1 / $o;
    $sum = array_sum($probs);
    $r = random_int(0, 1000000) / 1000000.0;
    $acc = 0.0;
    foreach ($probs as $i => $p) { $acc += $p / $sum; if ($r <= $acc) return $i; }
    return count($probs) - 1;
}

// ---------- скачки: гибриды ----------
function casino_horses_roster() {
    return array(
        'robo_horse'    => 'Робо-конь «Болт»',
        'methane_strider' => 'Метановый скакун',
        'ice_loper'     => 'Ледяной бегун',
        'grav_greyhound' => 'Грави-борзая',
        'clone_stallion' => 'Клон-жеребец',
        'dune_runner'   => 'Дюнный бегун',
        'bio_mule'      => 'Био-мул',
        'void_pacer'    => 'Пустотный иноходец'
    );
}

function horses_odds_for_track($track) {
    $base = array('ceres' => 2.4, 'titan' => 3.2, 'europa' => 4.1, 'mars' => 2.9, 'io' => 4.8, 'void' => 5.5);
    $b = $base[$track] ?? 3.0;
    $odds = array();
    for ($i = 0; $i < 8; $i++) $odds[] = round($b + $i * ($b * 0.55), 2);
    return $odds;
}

// ---------- спорт ----------
function casino_sports_list() {
    $out = array();
    foreach ((array)$GLOBALS['CASINO'] as $g) if (($g['kind'] ?? '') === 'sports') $out[] = $g;
    return $out;
}
