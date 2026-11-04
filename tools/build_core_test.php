<?php
// Тесты хранения сборок: валидация, сохранение, чтение, отказы.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/build_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

$all = array();
$email = 'test@example.com';

$r = build_save($all, $email, 'bolid', array('hull' => 'strela', 'modules' => array('m1','m2'), 'artifacts' => array('a1')));
chk($res, 'болид сохранён', $r['ok'], json_encode($r));
chk($res, 'время сохранения есть', isset($r['savedAt']) && $r['savedAt'] > 0, $r['savedAt']);

$r = build_save($all, $email, 'bolid', array('hull' => 'neizvestny', 'modules' => array()));
chk($res, 'неизвестный корпус отклонён', !$r['ok'], implode(',', $r['errors']));

$r = build_save($all, $email, 'bolid', array('hull' => 'molot', 'modules' => array_fill(0, 9, 'x')));
chk($res, '9 модулей отклонены', !$r['ok'], implode(',', $r['errors']));

$r = build_save($all, $email, 'bolid', array('hull' => 'klinok', 'modules' => array('a','b'), 'artifacts' => array('1','2','3','4')));
chk($res, '4 артефакта отклонены', !$r['ok'], implode(',', $r['errors']));

$r = build_save($all, $email, 'clone', array('dex'=>10,'cun'=>10,'str'=>10,'end'=>10,'spd'=>10));
chk($res, 'клон сохранён', $r['ok'], json_encode($r));

$r = build_save($all, $email, 'clone', array('dex'=>25,'cun'=>5,'str'=>5,'end'=>5,'spd'=>5));
chk($res, 'параметр 25 отклонён', !$r['ok'], implode(',', $r['errors']));

$r = build_save($all, $email, 'clone', array('dex'=>20,'cun'=>20,'str'=>20,'end'=>20,'spd'=>20));
chk($res, 'сумма 100 разрешена', $r['ok'], json_encode($r));
$r = build_save($all, $email, 'clone', array('dex'=>20,'cun'=>20,'str'=>21,'end'=>20,'spd'=>20));
chk($res, 'сумма 101 отклонена', !$r['ok'], implode(',', $r['errors']));

$load = build_load($all, $email, 'bolid');
chk($res, 'болид читается обратно', $load && $load['data']['hull'] === 'strela', json_encode($load && $load['data']['hull']));
chk($res, 'чужой профиль пуст', build_load($all, 'other@example.com', 'bolid') === null);

$failed = 0;
foreach ($res as $x) {
    echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n";
    if (!$x['ok']) $failed++;
}
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
exit($failed ? 1 : 0);