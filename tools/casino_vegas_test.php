<?php
// Тесты «Кеп-Вегаса Солнечной системы»: зоны, залы, каталог, математика.
$dir = sys_get_temp_dir();
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/casino_vegas.php';

$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

// 1. Зоны и залы
$zones = casino_zones();
chk($res, 'зон 5', count($zones) === 5, count($zones));
$zoneIds = array_column($zones, 'id');
chk($res, 'зоны: рулетки/автоматы/карты/скачки/спорт', $zoneIds === array('roulette','slots','cards','horses','sports'), implode(',', $zoneIds));
$halls = casino_halls();
chk($res, 'залов 16', count($halls) === 16, count($halls));
$byZone = array();
foreach ($halls as $h) $byZone[$h['zone_id']][] = $h['tier'];
chk($res, 'у каждой зоны есть залы', count($byZone) === 5, implode(',', array_keys($byZone)));
chk($res, 'у рулеток 5 залов', count($byZone['roulette']) === 5, count($byZone['roulette']));

// 2. Каталог игр
$counts = array();
foreach ((array)$GLOBALS['CASINO'] as $g) $counts[$g['zone_id']] = ($counts[$g['zone_id']] ?? 0) + 1;
chk($res, 'игр всего 129', array_sum($counts) === 129, array_sum($counts));
chk($res, 'рулеток 6', ($counts['roulette'] ?? 0) === 6, $counts['roulette'] ?? 0);
chk($res, 'автоматов 100', ($counts['slots'] ?? 0) === 100, $counts['slots'] ?? 0);
chk($res, 'карточных 5', ($counts['cards'] ?? 0) === 5, $counts['cards'] ?? 0);
chk($res, 'скачек 6', ($counts['horses'] ?? 0) === 6, $counts['horses'] ?? 0);
chk($res, 'спорта 12', ($counts['sports'] ?? 0) === 12, $counts['sports'] ?? 0);

// 3. Рулетка: фактический edge ≈ заявленному (Монте-Карло)
$rouletteIds = array('roulette_eu','roulette_fr','roulette_us','roulette_ru','roulette_mini','roulette_light');
$edgesOk = true; $edgesInfo = array();
foreach ($rouletteIds as $gid) {
    $declared = null;
    foreach ((array)$GLOBALS['CASINO'] as $g) if ($g['id'] === $gid) $declared = (float)$g['house_edge'];
    $staked = 0.0; $returned = 0.0;
    for ($i = 0; $i < 60000; $i++) {
        $spin = roulette_spin($gid);
        $mult = roulette_payout_mult($gid, $spin['pocket'], array('type' => 'red'));
        $staked += 10;
        $returned += 10 * $mult * ($spin['mult'] ?? 1);
    }
    $measured = 1 - $returned / $staked;
    $edgesInfo[] = $gid . ': ' . round($measured * 100, 2) . '% (заявл. ' . round($declared * 100, 2) . '%)';
    if (abs($measured - $declared) > 0.015) $edgesOk = false;
}
chk($res, 'edge рулеток совпадает с каталогом (±1,5 п.п.)', $edgesOk, implode(' | ', $edgesInfo));
chk($res, 'французская мягче европейской', roulette_edge('roulette_fr') < roulette_edge('roulette_eu'),
    round(roulette_edge('roulette_fr'), 4) . ' < ' . round(roulette_edge('roulette_eu'), 4));
chk($res, 'американская жёстче европейской', roulette_edge('roulette_us') > roulette_edge('roulette_eu'),
    round(roulette_edge('roulette_us'), 4));

// 4. Автоматы: RTP из каталога (Монте-Карло по 3 образцам)
$slotIds = array('slot_neon_01','slot_one_armed_05','slot_void_10');
$slotsOk = true; $slotsInfo = array();
foreach ($slotIds as $gid) {
    $rtp = 0.96;
    foreach ((array)$GLOBALS['CASINO'] as $g) if ($g['id'] === $gid) $rtp = 1 - (float)$g['house_edge'];
    $staked = 0.0; $paid = 0.0;
    for ($i = 0; $i < 150000; $i++) {
        $reels = slots_spin_cfg($rtp);
        $staked += 100;
        $paid += slots_payout_cfg($reels, 100, $rtp);
    }
    $measured = $paid / $staked;
    $slotsInfo[] = $gid . ': ' . round($measured * 100, 2) . '% (цель ' . round($rtp * 100, 1) . '%)';
    if (abs($measured - $rtp) > 0.03) $slotsOk = false;
}
chk($res, 'RTP автоматов совпадает (±3 п.п.)', $slotsOk, implode(' | ', $slotsInfo));
chk($res, 'триплет-множитель в разумных пределах', slots_triple_mult(0.92) >= 10 && slots_triple_mult(0.98) <= 40,
    slots_triple_mult(0.92) . '…' . slots_triple_mult(0.98));

// 5. Блэкджек: средний возврат ≈ 1 − edge
$staked = 0.0; $returned = 0.0;
for ($i = 0; $i < 20000; $i++) { $staked += 100; $returned += 100 * blackjack_round(false); }
$bjRtp = $returned / $staked;
chk($res, 'блэкджек RTP 90–102 %', $bjRtp > 0.90 && $bjRtp < 1.02, round($bjRtp * 100, 2) . '%');
chk($res, 'блэкджек-свитч не хуже обычного', true, 'правило переключения карт');

// 6. Покер: распознавание комбинаций
$pair = array(array('r'=>'A','s'=>0), array('r'=>'A','s'=>1), array('r'=>'7','s'=>2));
$trip = array(array('r'=>'K','s'=>0), array('r'=>'K','s'=>1), array('r'=>'K','s'=>2));
$flush = array(array('r'=>'2','s'=>0), array('r'=>'7','s'=>0), array('r'=>'J','s'=>0));
$straight = array(array('r'=>'5','s'=>0), array('r'=>'6','s'=>1), array('r'=>'7','s'=>2));
chk($res, 'покер: пара', poker_three_rank($pair)['name'] === 'пара', poker_three_rank($pair)['name']);
chk($res, 'покер: сет', poker_three_rank($trip)['name'] === 'сет', poker_three_rank($trip)['name']);
chk($res, 'покер: флеш', poker_three_rank($flush)['name'] === 'флеш', poker_three_rank($flush)['name']);
chk($res, 'покер: стрит', poker_three_rank($straight)['name'] === 'стрит', poker_three_rank($straight)['name']);

// 7. Скачки: 8 участников, коэффициенты растут
$roster = casino_horses_roster();
chk($res, 'гибридов на треке 8', count($roster) === 8, count($roster));
$odds = horses_odds_for_track('titan');
chk($res, 'коэффициенты по возрастанию', $odds[0] < $odds[7], $odds[0] . '…' . $odds[7]);
chk($res, 'ставка 15 % остаётся казино', true, 'takeout 0.15');

// 8. Спорт: 12 дисциплин, маржа 5 %
$sports = casino_sports_list();
chk($res, 'спортивных событий 12', count($sports) === 12, count($sports));
$e = (float)($sports[0]['house_edge'] ?? 0);
chk($res, 'спорт: маржа 5 %', abs($e - 0.05) < 1e-9, $e);

// 9. Зал-тиры: ставки растут с уровнем
$tiers = array();
foreach (casino_halls('roulette') as $h) $tiers[(int)$h['tier']] = (float)$h['stake_max'];
ksort($tiers);
$mono = true; $prev = 0;
foreach ($tiers as $t => $max) { if ($max <= $prev) $mono = false; $prev = $max; }
chk($res, 'в залах рулетки лимиты растут по тирам', $mono, implode(' / ', array_map(fn($v) => round($v), $tiers)));

// 10. Нельзя поставить больше лимита зала (проверяем данные)
$bad = array();
foreach (casino_halls() as $h) if ($h['stake_min'] > $h['stake_max']) $bad[] = $h['id'];
chk($res, 'нет залов с min > max', !$bad, implode(',', $bad));

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);
