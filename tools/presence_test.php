<?php
// Тесты присутствия игроков: обновление, TTL, исключение себя, валидация.
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/presence_core.php';
$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

$all = array();
$t0 = 1793600000000;

chk($res, 'пусто — никого нет', count(presence_list($all, '', $t0)) === 0);

$err = presence_update($all, 'alice@test.ru', array('x' => 100, 'y' => -50, 'system' => 'sol'));
chk($res, 'alice добавлена', count($err) === 0 && isset($all['alice@test.ru']), json_encode($err));

$err = presence_update($all, 'bob@test.ru', array('x' => 10, 'y' => 20, 'system' => 'war'));
chk($res, 'bob добавлен', count($err) === 0 && isset($all['bob@test.ru']));

// список видит обоих на момент t0
$list = presence_list($all, '', presence_now_ms());
chk($res, 'в списке 2 игрока', count($list) === 2, count($list));
chk($res, 'имя без @', $list[0]['name'] === 'alice' || $list[0]['name'] === 'bob', $list[0]['name']);
chk($res, 'координаты сохранены', in_array(100.0, array_map(function ($p) { return $p['x']; }, $list), true));

// исключение себя
$listSelf = presence_list($all, 'alice@test.ru', presence_now_ms());
chk($res, 'себя не видно в списке', count($listSelf) === 1 && $listSelf[0]['name'] === 'bob', count($listSelf));

// TTL: старый пинг пропадает
$old = array('old@test.ru' => array('x' => 0, 'y' => 0, 'system' => 'sol', 'ts' => presence_now_ms() - (PRESENCE_TTL_SEC + 5) * 1000));
chk($res, 'старый пинг вне TTL', count(presence_list($old, '', presence_now_ms())) === 0);
$fresh = array('new@test.ru' => array('x' => 0, 'y' => 0, 'system' => 'sol', 'ts' => presence_now_ms()));
chk($res, 'свежий пинг внутри TTL', count(presence_list($fresh, '', presence_now_ms())) === 1);

// валидация
$bad = array();
$err = presence_update($bad, 'x@test.ru', array('x' => 'abc', 'y' => 1));
chk($res, 'нечисловая позиция отклонена', count($err) > 0, implode(',', $err));
$err = presence_update($bad, 'x@test.ru', array('x' => 999999, 'y' => 1));
chk($res, 'позиция вне диапазона отклонена', count($err) > 0, implode(',', $err));
$err = presence_update($bad, '', array('x' => 1, 'y' => 1));
chk($res, 'без пользователя отклонено', count($err) > 0, implode(',', $err));

// система сохраняется
$err = presence_update($bad, 'w@test.ru', array('x' => 1, 'y' => 2, 'system' => 'war'));
$l = presence_list($bad, '', presence_now_ms());
$w = array_values(array_filter($l, function ($p) { return $p['name'] === 'w'; }));
chk($res, 'система war сохранена', count($w) === 1 && $w[0]['system'] === 'war', $w ? $w[0]['system'] : '-');

// мусор в system чистится
$err = presence_update($bad, 'z@test.ru', array('x' => 1, 'y' => 2, 'system' => '<script>'));
$l = presence_list($bad, '', presence_now_ms());
$z = array_values(array_filter($l, function ($p) { return $p['name'] === 'z'; }));
chk($res, 'мусор в system вычищен', count($z) === 1 && $z[0]['system'] === 'script', $z ? $z[0]['system'] : '-');


// планета и фракция
$p2 = array();
presence_update($p2, 'p@test.ru', array('x' => 5, 'y' => 6, 'system' => 'sol', 'planet' => 'earth', 'faction' => 'mars'));
$l2 = presence_list($p2, '', presence_now_ms());
chk($res, 'планета сохранена', $l2[0]['planet'] === 'earth', $l2[0]['planet']);
chk($res, 'фракция сохранена', $l2[0]['faction'] === 'mars', $l2[0]['faction']);

presence_update($p2, 'q@test.ru', array('x' => 5, 'y' => 6, 'faction' => 'hackers'));
$l3 = presence_list($p2, '', presence_now_ms());
$q = array_values(array_filter($l3, function ($x) { return $x['name'] === 'q'; }));
chk($res, 'неизвестная фракция → free', count($q) === 1 && $q[0]['faction'] === 'free', $q ? $q[0]['faction'] : '-');

$p3 = array();
presence_update($p3, 'a@test.ru', array('x' => 1, 'y' => 1, 'planet' => 'earth'));
presence_update($p3, 'b@test.ru', array('x' => 2, 'y' => 2, 'planet' => 'mars'));
$before = count($p3);
$p3['dead@test.ru'] = array('x' => 0, 'y' => 0, 'system' => 'sol', 'ts' => presence_now_ms() - (PRESENCE_TTL_SEC + 10) * 1000);
presence_update($p3, 'c@test.ru', array('x' => 3, 'y' => 3));
chk($res, 'чистка на записи убирает старых', count($p3) === 3 && !isset($p3['dead@test.ru']), 'было ' . ($before + 1) . ', стало ' . count($p3));

$failed2 = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed2++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed2) . " | провалов: $failed2\n";
exit($failed2 ? 1 : 0);
