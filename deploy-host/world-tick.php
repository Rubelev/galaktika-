<?php
// Обход заброшенных колоний: автопилот → упадок → дикость → реестр брошенных.
// Запускается по cron каждые 10 минут и живёт вне веб-корня.
// Колония считается брошенной, если игрок не заходил 30 суток.

// Брошенной колония считается через календарный месяц (30 суток) без входа.
define('ABANDON_DAYS', 30);
// Столько же мир зарезервирован за прежним хозяином: вернуться можно бесплатно.
define('RESERVE_DAYS', 30);

$DATA = '/var/www/u3699164/data/www/galaktika-data';
$usersFile = $DATA . '/users.json';
$worldsFile = $DATA . '/worlds.json';
$logFile = '/var/www/u3699164/data/logs/world.log';

function load_json($file, $default) {
    if (!file_exists($file)) return $default;
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') return $default;
    if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3);
    $d = json_decode($raw, true);
    return is_array($d) ? $d : $default;
}

function save_json($file, $data) {
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, $file);
}

$users = load_json($usersFile, array());
$worlds = load_json($worldsFile, array());
$now = time();
$log = array();
$changed = false;
$worldsChanged = false;

foreach ($users as $i => $u) {
    if (!isset($u['Profile'])) continue;
    $p = json_decode($u['Profile'], true);
    if (!is_array($p) || !isset($p['colony']) || !is_array($p['colony'])) continue;

    $c = $p['colony'];
    $lastSeen = isset($p['lastSeen']) ? (int)$p['lastSeen'] : $now;
    $daysIdle = ($now - $lastSeen) / 86400.0;
    $lastTick = isset($c['lastTick']) ? (int)$c['lastTick'] : $now;
    $dt = min(30, max(0.0001, ($now - $lastTick) / 86400.0));

    if ($daysIdle < 3) {
        $c['state'] = 'active';
        // ВАЖНО: lastTick не трогаем — иначе крон каждые 10 минут «съедает»
        // накопленное время, и колония не получает налоги за простой.
        $p['colony'] = $c;
        $users[$i]['Profile'] = json_encode($p, JSON_UNESCAPED_UNICODE);
        $changed = true;
        continue;
    }

    if ($daysIdle < 14) {
        // автопилот: колония живёт сама, но медленно хиреет
        $c['population'] = max(0, (float)$c['population'] * (1 - 0.002 * $dt));
        $c['happiness'] = max(0, min(100, (float)$c['happiness'] - 0.5 * $dt));
        $c['state'] = 'autopilot';
    } elseif ($daysIdle < 30) {
        // упадок: голод, разруха, потери построек
        $c['population'] = max(0, (float)$c['population'] * (1 - 0.02 * $dt));
        $c['happiness'] = max(0, min(100, (float)$c['happiness'] - 2 * $dt));
        $c['ruinClock'] = (isset($c['ruinClock']) ? (float)$c['ruinClock'] : 0) + $dt;
        $c['state'] = 'decline';
        if (!isset($p['factories']) || !is_array($p['factories'])) $p['factories'] = array();
        while ($c['ruinClock'] >= 5) {
            $c['ruinClock'] -= 5;
            $best = null;
            foreach ($p['factories'] as $fid => $lvl) {
                if ((int)$lvl > 0 && ($best === null || (int)$lvl > (int)$p['factories'][$best])) $best = $fid;
            }
            if ($best === null) break;
            $p['factories'][$best] = (int)$p['factories'][$best] - 1;
            if ($p['factories'][$best] <= 0) unset($p['factories'][$best]);
        }
    }

    if ($daysIdle >= ABANDON_DAYS) {
        // дикость: колония уходит в реестр брошенных
        $snap = array(
            'population' => (int)round((float)$c['population']),   // полное население на момент броска; 5% оставит уже колонизатор
            'factories' => isset($p['factories']) && is_array($p['factories']) ? $p['factories'] : array(),
            'ships' => isset($p['ships']) && is_array($p['ships']) ? count($p['ships']) : 0,
            'resources' => isset($p['resources']) && is_array($p['resources']) ? array_slice($p['resources'], 0, 8, true) : array(),
        );
        $worlds[] = array(
            'id' => 'w-' . bin2hex(random_bytes(4)),
            'name' => isset($c['name']) ? $c['name'] : 'Безымянный мир',
            'owner' => isset($u['Email']) ? strtolower($u['Email']) : '',
            'abandonedAt' => $now,
            'reservedUntil' => $now + RESERVE_DAYS * 86400,
            'snapshot' => $snap,
        );
        $worldsChanged = true;
        unset($p['colony']);
        $p['factories'] = array();
        $log[] = 'abandoned: ' . $u['Email'] . ' (' . round($daysIdle) . ' дней)';
    } else {
        $c['lastTick'] = $now;
        $p['colony'] = $c;
        $log[] = $u['Email'] . ': ' . $c['state'] . ', население ' . round($c['population']);
    }

    $users[$i]['Profile'] = json_encode($p, JSON_UNESCAPED_UNICODE);
    $changed = true;
}

if ($changed) save_json($usersFile, $users);
if ($worldsChanged) save_json($worldsFile, $worlds);
if ($log) {
    file_put_contents($logFile, date('c') . ' ' . implode('; ', $log) . PHP_EOL, FILE_APPEND);
    $lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($lines) && count($lines) > 500) {
        file_put_contents($logFile, implode(PHP_EOL, array_slice($lines, -500)) . PHP_EOL);
    }
}
