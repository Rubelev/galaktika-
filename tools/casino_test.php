<?php
// Тесты казино: RTP рулетки (Монте-Карло), маржа спорта, скачки, лимиты ставок.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/casino_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

chk($res, 'игр 6', count($GLOBALS['CASINO']) === 6, count($GLOBALS['CASINO']));

// лимиты
$b = casino_check_bet('roulette_eu', 5);
chk($res, 'ставка ниже минимума отклонена', !$b['ok'], $b['error']);
$b = casino_check_bet('roulette_eu', 100);
chk($res, 'ставка в лимите принята', $b['ok']);
$b = casino_check_bet('roulette_eu', 999999);
chk($res, 'ставка выше максимума отклонена', !$b['ok'], $b['error']);
$b = casino_check_bet('nope', 100);
chk($res, 'неизвестная игра отклонена', !$b['ok'], $b['error']);

// теория
chk($res, 'RTP европейской = 36/37', abs(casino_roulette_rtp(false) - 36/37) < 1e-9, casino_roulette_rtp(false));
chk($res, 'RTP американской = 36/38', abs(casino_roulette_rtp(true) - 36/38) < 1e-9, casino_roulette_rtp(true));

// Монте-Карло: 20000 спинов, ставка "красное", ставка 10
$bet = array('type' => 'red');
$staked = 0; $returned = 0;
for ($i = 0; $i < 20000; $i++) {
    $spin = casino_roulette_spin(false);
    $p = casino_roulette_payout($spin, $bet, false);
    $staked += 10;
    if ($p > 0) $returned += 10 + $p * 10;   // возврат ставки + выигрыш
}
$rtp = $returned / $staked;
chk($res, 'Монте-Карло RTP 93–100 %', $rtp > 0.93 && $rtp < 1.00, round($rtp * 100, 2) . '%');
chk($res, 'RTP Монте-Карло близок к теории (±4 %)', abs($rtp - 36/37) < 0.04, round(($rtp - 36/37) * 100, 2) . '%');

// выплаты по типам
chk($res, 'число 17 на 17 → 35:1', casino_roulette_payout(17, array('type'=>'number','value'=>17)) === 35);
chk($res, 'число 18 на 17 → проигрыш', casino_roulette_payout(18, array('type'=>'number','value'=>17)) === -1);
chk($res, 'зеро съедает красное', casino_roulette_payout(0, array('type'=>'red')) === -1);
chk($res, 'дюжина 1-12 на 5 → 2:1', casino_roulette_payout(5, array('type'=>'dozen','value'=>1)) === 2);
chk($res, 'чёт на 36 → 1:1', casino_roulette_payout(36, array('type'=>'even')) === 1);

// спорт: коэффициент с маржой
$o = casino_sports_odds(0.5, 0.05);
chk($res, 'коэф. на равные шансы ≈ 1.90', abs($o - 1.90) < 0.01, $o);
$o2 = casino_sports_odds(0.8, 0.05);
chk($res, 'фаворит даёт меньший коэф.', $o2 < $o, $o2);
chk($res, 'выигрыш по коэф. 2.0 при ставке 100 = +100', casino_sports_settle(100, 2.0, true) === 100.0);
chk($res, 'проигрыш = −ставка', casino_sports_settle(100, 2.0, false) === -100.0);

// скачки
$probs = casino_horses_win_prob(array(2.0, 4.0, 8.0, 16.0));
chk($res, 'вероятности нормированы (сумма 1)', abs(array_sum($probs) - 1.0) < 1e-9, array_sum($probs));
chk($res, 'фаворит вероятнее аутсайдера', $probs[0] > $probs[3], $probs[0] . ' > ' . $probs[3]);
$wins = array(0,0,0,0);
for ($i = 0; $i < 4000; $i++) { $wins[casino_horses_run(array(2.0,4.0,8.0,16.0))]++; }
chk($res, 'заезды дают всех участников', min($wins) > 0, implode('/', $wins));
chk($res, 'фаворит выигрывает чаще всех', $wins[0] === max($wins), implode('/', $wins));
$pay = casino_horses_payout(100, 4.0, true, 0.15);
chk($res, 'тотализатор: выплата с 15 % сбором', abs($pay - (100 * (4.0 * 0.85 - 1))) < 0.01, $pay);

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);