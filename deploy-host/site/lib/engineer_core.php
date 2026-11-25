<?php
// ============================================================================
//  ENGINEER_CORE.PHP — бот-инженер: собирает проблемы всех ботов и готовит
//  данные для суточного статуса игры.
//
//  Что делает:
//    1. Читает bot_log и bot_issue (SQLite);
//    2. Прогоняет проверки движка (инварианты цивилизаций, мобов, тиков, БД);
//    3. Складывает найденное в bot_issue с важностью;
//    4. Отдаёт отчёт: что сломано, где, с каких пор, сколько раз.
//
//  Запуск: раз в сутки по cron + вручную через API (только админ).
// ============================================================================

require_once __DIR__ . '/bot_db.php';
require_once __DIR__ . '/civ_core.php';
require_once __DIR__ . '/mob_core.php';

const ENG_VERSION = 1;

function eng_severity_rank($s) {
    $map = array('critical' => 0, 'high' => 1, 'medium' => 2, 'low' => 3);
    return $map[$s] ?? 4;
}

// --- проверки движка -------------------------------------------------------
function eng_checks() {
    $issues = array();
    $add = function ($bot, $code, $sev, $msg, $ctx = null) use (&$issues) {
        $issues[] = array('bot' => $bot, 'code' => $code, 'severity' => $sev, 'message' => $msg, 'context' => $ctx);
    };

    // 1. Цивилизации: тик не старше 30 минут, ресурсы в границах
    $civState = civ_state_load();
    if (!$civState) {
        $add('civ', 'civ.state_missing', 'critical', 'Нет состояния цивилизаций (civ-state.json)', null);
    } else {
        foreach ($civState as $id => $s) {
            $last = (int)($s['last_tick'] ?? 0);
            if ($last > 0 && (time() - $last) > 1800) {
                $add('civ', 'civ.tick_stale', 'high', "Цивилизация $id не тикала " . round((time() - $last) / 60) . ' мин',
                     array('civ' => $id, 'last_tick' => $last));
            }
            if (($s['credits'] ?? 0) < 0 || ($s['food'] ?? 0) < 0) {
                $add('civ', 'civ.negative_resources', 'critical', "У $id отрицательные ресурсы",
                     array('civ' => $id, 'credits' => $s['credits'] ?? null, 'food' => $s['food'] ?? null));
            }
            if (($s['territory'] ?? 1) > 12 || ($s['fleet'] ?? 0) > 400 || ($s['influence'] ?? 0) > 200) {
                $add('civ', 'civ.cap_exceeded', 'medium', "У $id превышены потолки", array('civ' => $id));
            }
        }
    }

    // 2. Мобы: 600, балансы не отрицательны, тождество последнего тика
    $catalog = mob_catalog();
    if (count($catalog) !== 600) {
        $add('mob', 'mob.catalog_size', 'high', 'Мобов не 600: ' . count($catalog), array('count' => count($catalog)));
    }
    $mobState = mob_state_load();
    $neg = 0; $over = 0;
    foreach ($mobState as $id => $st) {
        if (($st['credits'] ?? 0) < 0) $neg++;
        if (($st['credits'] ?? 0) > MOB_MAX_BALANCE) $over++;
    }
    if ($neg > 0) $add('mob', 'mob.negative_balance', 'critical', "Мобов с отрицательным балансом: $neg", array('count' => $neg));
    if ($over > 0) $add('mob', 'mob.over_cap', 'medium', "Мобов сверх потолка: $over", array('count' => $over));

    // 3. Журнал мобов: последний тик должен сходиться
    global $dataDir;
    $logFile = rtrim((string)$dataDir, '/') . '/mob-log.json';
    $raw = @file_get_contents($logFile);
    $mlog = $raw ? json_decode($raw, true) : array();
    if (is_array($mlog) && $mlog) {
        $last = end($mlog);
        if (empty($last['ok'])) {
            $add('mob', 'mob.conservation_broken', 'critical', 'Не сходится тождество экономики мобов',
                 array('ts' => $last['ts'] ?? null, 'balances' => $last['balances'] ?? null));
        }
    } else {
        $add('mob', 'mob.log_missing', 'high', 'Нет журнала тиков мобов', null);
    }

    // 4. Журнал ботов: ошибки за сутки
    $stats = bot_log_stats();
    if (($stats['errors24'] ?? 0) > 0) {
        $add('engineer', 'bots.errors_24h', 'high', 'Ошибок ботов за сутки: ' . $stats['errors24'], $stats);
    }

    // 5. Тик-задача: проверяем, что cron реально отрабатывает (по bot_log метке)
    $pdo = bot_db();
    if ($pdo) {
        try {
            $lastCiv = (int)$pdo->query("SELECT MAX(ts) FROM bot_log WHERE kind='tick'")->fetchColumn();
            if ($lastCiv > 0 && (time() - $lastCiv) > 1800) {
                $add('engineer', 'engine.tick_gap', 'high', 'Тик не писал в журнал ' . round((time() - $lastCiv) / 60) . ' мин',
                     array('last_tick' => $lastCiv));
            }
        } catch (Exception $e) { }
    }

    return $issues;
}

// --- суточный статус ------------------------------------------------------
function eng_scan($write = true) {
    $found = eng_checks();
    if ($write) {
        foreach ($found as $i) bot_issue($i['bot'], $i['code'], $i['severity'], $i['message'], $i['context']);
        // закроем то, что больше не воспроизводится: иначе «старые» проблемы висят вечно
        $foundKeys = array();
        foreach ($found as $i) $foundKeys[$i['bot'] . '|' . $i['code']] = true;
        foreach (bot_issues('open', 200) as $old) {
            if (!isset($foundKeys[$old['bot'] . '|' . $old['code']])) {
                bot_issue_close($old['bot'], $old['code'], 'fixed');
            }
        }
        $alerts = eng_write_alerts($found);
        bot_log('engineer', 'scan', 'scan', array('issues' => count($found), 'alerts' => $alerts),
            $alerts ? 'critical' : (count($found) ? 'warning' : 'info'));
    }
    $open = bot_issues('open', 50);
    $stats = bot_log_stats();
    $bySev = array('critical' => 0, 'high' => 0, 'medium' => 0, 'low' => 0);
    foreach ($open as $i) {
        $sev = $i['severity'];
        $bySev[$sev] = ($bySev[$sev] ?? 0) + 1;
    }
    $verdict = $bySev['critical'] > 0 ? 'сломано'
        : ($bySev['high'] > 0 ? 'требует внимания' : ($bySev['medium'] > 0 ? 'мелкие замечания' : 'здоров'));
    return array(
        'ok' => true,
        'ts' => time(),
        'verdict' => $verdict,
        'found_now' => $found,
        'open_issues' => $open,
        'by_severity' => $bySev,
        'log' => $stats,
        'engineer_version' => ENG_VERSION
    );
}

// Алерты: критическое пишем отдельным файлом, чтобы не потерялось в отчёте
function eng_write_alerts($found) {
    global $dataDir;
    if (!isset($dataDir) || !$dataDir) return 0;
    $crit = array_values(array_filter($found, fn($i) => $i['severity'] === 'critical'));
    if (!$crit) return 0;
    $file = rtrim($dataDir, '/') . '/engineer-alerts.json';
    $raw = @file_get_contents($file);
    $alerts = $raw ? json_decode($raw, true) : array();
    if (!is_array($alerts)) $alerts = array();
    foreach ($crit as $c) {
        $alerts[] = array('ts' => time(), 'bot' => $c['bot'], 'code' => $c['code'],
                          'message' => $c['message'], 'context' => $c['context']);
    }
    if (count($alerts) > 100) $alerts = array_slice($alerts, -100);
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($alerts, JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, $file);
    if (function_exists('bot_log')) {
        foreach ($crit as $c) bot_log('engineer', 'alert', $c['code'], $c, 'critical');
    }
    return count($crit);
}

// Текстовый отчёт для человека (суточный статус)
function eng_report_text($rep) {
    $lines = array();
    $lines[] = 'СТАТУС ДВИЖКА: ' . strtoupper($rep['verdict']);
    $lines[] = 'Проверено: ' . date('d.m.Y H:i', $rep['ts']);
    $lines[] = 'Записей в журнале ботов: ' . ($rep['log']['total'] ?? 0) . ' (ошибок за сутки: ' . ($rep['log']['errors24'] ?? 0) . ')';
    $lines[] = 'Открытых проблем: ' . count($rep['open_issues'])
        . ' (critical ' . ($rep['by_severity']['critical'] ?? 0)
        . ', high ' . ($rep['by_severity']['high'] ?? 0)
        . ', medium ' . ($rep['by_severity']['medium'] ?? 0) . ')';
    foreach ($rep['open_issues'] as $i) {
        $lines[] = sprintf('[%s] %s/%s — %s (x%d, с %s)',
            strtoupper($i['severity']), $i['bot'], $i['code'], $i['message'], $i['count'],
            date('d.m H:i', (int)$i['first_ts']));
    }
    if (!$rep['open_issues']) $lines[] = 'Проблем нет.';
    return implode("\n", $lines);
}
