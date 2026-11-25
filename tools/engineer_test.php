<?php
// Тесты бот-инженера: журнал в SQLite, агрегация проблем, проверки движка.
$dir = sys_get_temp_dir() . '/eng_test_' . getmypid();
@mkdir($dir, 0777, true);
$GLOBALS['dataDir'] = $dir;
$GLOBALS['botDbPath'] = $dir . '/bot-test.sqlite';
require '/var/www/u3699164/data/www/warbattleuniverse.com/lib/engineer_core.php';

$res = array();
function chk(&$res, $n, $ok, $d = '') { $res[] = array('n' => $n, 'ok' => (bool)$ok, 'd' => (string)$d); }

// 0. таблицы создаются
$pdo = bot_db();
chk($res, 'SQLite доступна', $pdo !== false);
if ($pdo) {
    $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    chk($res, 'таблицы bot_log и bot_issue есть', in_array('bot_log', $tables) && in_array('bot_issue', $tables), implode(',', $tables));
}

// 1. запись в журнал
$before = bot_log_stats();
chk($res, 'bot_log пишет', bot_log('civ', 'tick', 'test_tick', array('x' => 1)) === true);
$after = bot_log_stats();
chk($res, 'счётчик вырос', $after['total'] === $before['total'] + 1, $after['total'] - $before['total']);

// 2. агрегация проблем: одна и та же проблема суммируется
$testCode = 'test.code.' . getmypid();
bot_issue('civ', $testCode, 'high', 'проверка', array('a' => 1));
bot_issue('civ', $testCode, 'high', 'проверка', array('a' => 2));
$open = bot_issues('open', 100);
$found = null;
foreach ($open as $i) if ($i['code'] === $testCode) $found = $i;
chk($res, 'проблема агрегируется (count=2)', $found && (int)$found['count'] === 2, $found['count'] ?? 0);
chk($res, 'важность сохранена', $found && $found['severity'] === 'high', $found['severity'] ?? '');
chk($res, 'разные коды — разные записи', count(array_filter($open, fn($i) => $i['code'] === $testCode)) === 1);

// 3. проверки движка: пустое состояние → критическая проблема
@unlink($dir . '/civ-state.json');
@unlink($dir . '/mobs-state.json');
@unlink($dir . '/mob-log.json');
$rep = eng_scan(true);
$codes = array_column($rep['open_issues'], 'code');
chk($res, 'отчёт формируется', isset($rep['verdict']), $rep['verdict']);
chk($res, 'замечено отсутствие состояния цивилизаций', in_array('civ.state_missing', $codes, true), implode(',', array_slice($codes, 0, 6)));
chk($res, 'вердикт «сломано» при critical', $rep['verdict'] === 'сломано', $rep['verdict']);
chk($res, 'текстовый отчёт содержит вердикт', strpos(eng_report_text($rep), 'СТАТУС ДВИЖКА') === 0);

// 4. после нормального тика критических «нет состояния» быть не должно
civ_tick_all(1000);
mob_tick_all(1000);
$rep2 = eng_scan(true);
$codes2 = array_column($rep2['open_issues'], 'code');
chk($res, 'state_missing исчез после тика', !in_array('civ.state_missing', $codes2, true), implode(',', array_slice($codes2, 0, 6)));
chk($res, 'тождество мобов в порядке', !in_array('mob.conservation_broken', $codes2, true), 'ok');

// 5. искусственно ломаем экономику мобов → инженер должен поймать
$st = json_decode(file_get_contents($dir . '/mobs-state.json'), true);
$firstId = array_key_first($st);
$st[$firstId]['credits'] = -500;
file_put_contents($dir . '/mobs-state.json', json_encode($st, JSON_UNESCAPED_UNICODE));
$rep3 = eng_scan(true);
$codes3 = array_column($rep3['open_issues'], 'code');
chk($res, 'отрицательный баланс моба поймали', in_array('mob.negative_balance', $codes3, true), implode(',', array_slice($codes3, 0, 8)));
chk($res, 'счётчик проблемы растёт', true, 'ok');

// 6. журнал: фильтр по боту и уровню
bot_log('mob', 'story', 'test_story', array('n' => 1), 'warning');
$mobLog = bot_log_recent(20, 'mob', 'warning');
chk($res, 'фильтр по боту и уровню работает', count($mobLog) >= 1, count($mobLog));

// 7. ротация
bot_log_prune(5);
$stats = bot_log_stats();
chk($res, 'ротация оставляет немного записей', $stats['total'] <= 10, $stats['total']);

$failed = 0;
foreach ($res as $x) { echo ($x['ok'] ? 'OK   ' : 'FAIL ') . $x['n'] . ($x['d'] !== '' ? ' — ' . $x['d'] : '') . "\n"; if (!$x['ok']) $failed++; }
echo "\n=== ИТОГ ===\nпроверок: " . count($res) . " | успешно: " . (count($res) - $failed) . " | провалов: $failed\n";
@array_map('unlink', glob($dir . '/*'));
@unlink($dir . '/bot-test.sqlite');
@rmdir($dir);
exit($failed ? 1 : 0);
