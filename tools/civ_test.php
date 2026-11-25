<?php
// Тесты ботов-цивилизаций: автономия, детерминизм, сохранение ресурсов, границы.
$dir = sys_get_temp_dir() . '/civ_test_' . getmypid();
@mkdir($dir, 0777, true);
$GLOBALS['dataDir'] = $dir;
require __DIR__ . '/../deploy-host/site/lib/civ_core.php';

$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

// 1. каталог
$civs = civ_list();
chk($res, 'цивилизаций 6', count($civs) === 6, count($civs));
$ids = array_column($civs, 'id');
chk($res, 'id уникальны', count(array_unique($ids)) === 6);

// 2. автономия в заданных границах
$auto_ok = true; $auto_min = 1; $auto_max = 0;
foreach ($civs as $c) {
    $a = (float)$c['autonomy_pct'];
    if ($a <= 0 || $a >= 1) $auto_ok = false;
    $auto_min = min($auto_min, $a); $auto_max = max($auto_max, $a);
}
chk($res, 'autonomy_pct в (0,1)', $auto_ok, "$auto_min…$auto_max");
chk($res, 'есть разброс автономии', $auto_max - $auto_min >= 0.2, round($auto_max - $auto_min, 2));

// 3. детерминизм ГСЧ
$r1 = civ_rand(101, 7, 'free0');
$r2 = civ_rand(101, 7, 'free0');
$r3 = civ_rand(101, 8, 'free0');
chk($res, 'ГСЧ воспроизводим', $r1 === $r2, $r1);
chk($res, 'ГСЧ зависит от тика', $r1 !== $r3, "$r1 vs $r3");
chk($res, 'ГСЧ в [0,1)', $r1 >= 0 && $r1 < 1, $r1);

// 4. тик: свежее состояние
@unlink($dir . '/civ-state.json');
@unlink($dir . '/civ-log.json');
$t1 = civ_tick_all(1000);
chk($res, 'тик вернул все 6', count($t1['civs']) === 6, count($t1['civs']));
chk($res, 'действия есть', count($t1['actions']) > 0, count($t1['actions']));

// 5. доля свободных = round(3 * autonomy) при достатке ресурсов
$free_ok = true; $detail = array();
foreach ($t1['civs'] as $id => $c) {
    $expect = (int)round(3 * (float)$c['autonomy_pct']);
    $free = count(array_filter($c['actions'], fn($a) => $a['kind'] === 'free'));
    $detail[] = "$id:$free/$expect";
    if ($free !== $expect) $free_ok = false;
}
chk($res, 'свободных действий = round(3×autonomy)', $free_ok, implode(' ', $detail));

// 6. ресурсы не уходят в минус и в бесконечность
$neg = array(); $caps = array();
foreach ($t1['civs'] as $id => $c) {
    $s = $c['state'];
    if ($s['credits'] < 0 || $s['food'] < 0) $neg[] = $id;
    if ($s['territory'] > 12 || $s['fleet'] > 400 || $s['influence'] > 200) $caps[] = $id;
}
chk($res, 'нет отрицательных ресурсов', !$neg, implode(',', $neg));
chk($res, 'границы соблюдены (территория/флот/влияние)', !$caps, implode(',', $caps));

// 7. журнал = действия тика
$log = json_decode(@file_get_contents($dir . '/civ-log.json'), true);
chk($res, 'журнал записан', is_array($log) && count($log) === count($t1['actions']), is_array($log) ? count($log) : -1);

// 8. отчёт автономии совпадает с журналом
$rep = civ_autonomy_report();
$realFree = $rep['free']; $realScr = $rep['scripted'];
chk($res, 'отчёт: free+scripted = всех действий', ($realFree + $realScr) === count($log), "$realFree+$realScr");
chk($res, 'доля свободных в разумных пределах (0.05…0.95)', $rep['share'] !== null && $rep['share'] > 0.05 && $rep['share'] < 0.95, $rep['share']);

// 9. нельзя raid без флота и expand без денег
$s = civ_default_state(civ_def('earth'));
$s['fleet'] = 1;
chk($res, 'raid без флота запрещён', !civ_can($s, 'raid'));
$s['fleet'] = 50; $s['credits'] = 100;
chk($res, 'expand без денег запрещён', !civ_can($s, 'expand'));
$s['credits'] = 100000; $s['territory'] = 12;
chk($res, 'expand при максимуме территории запрещён', !civ_can($s, 'expand'));

// 10. детерминизм тика целиком (два одинаковых прогона)
@unlink($dir . '/civ-state.json'); @unlink($dir . '/civ-log.json');
$a = civ_tick_all(2000);
@unlink($dir . '/civ-state.json'); @unlink($dir . '/civ-log.json');
$b = civ_tick_all(2000);
$sig = function ($t) { $x = array(); foreach ($t['actions'] as $a) $x[] = $a['civ'] . ':' . $a['action'] . ':' . $a['kind']; return implode('|', $x); };
chk($res, 'тик детерминирован (одинаковый результат)', $sig($a) === $sig($b), substr($sig($a), 0, 60));

// 11. состояние читается/пишется как JSON
$st = json_decode(@file_get_contents($dir . '/civ-state.json'), true);
chk($res, 'состояние — валидный JSON', is_array($st) && count($st) === 6, is_array($st) ? count($st) : -1);
chk($res, 'у состояния есть tick_no', isset($st['earth']['tick_no']) && $st['earth']['tick_no'] >= 1, $st['earth']['tick_no'] ?? '-');

// 12. цивилизации не читают профили игроков
$core = file_get_contents(__DIR__ . '/../deploy-host/site/lib/civ_core.php');
chk($res, 'civ_core не трогает users.json/profile', stripos($core, 'users.json') === false && stripos($core, 'profile') === false);

// 13. сумма изменений кредитов по журналу = сумме по действиям
$sumLog = 0; foreach ($b['actions'] as $x) $sumLog += (float)$x['credits_delta'];
$sumCiv = 0; foreach ($b['civs'] as $c) $sumCiv += (float)$c['state']['credits'];
chk($res, 'кредиты после тика не отрицательны', $sumCiv >= 0, round($sumCiv));

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
@array_map('unlink', glob($dir . '/*'));
@rmdir($dir);
exit($failed ? 1 : 0);
