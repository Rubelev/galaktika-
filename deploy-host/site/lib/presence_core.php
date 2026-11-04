<?php
// ============================================================================
//  PRESENCE_CORE.PHP — кто сейчас в игре и где.
//  Игрок раз в ~12 секунд присылает свою позицию; сервер хранит последнюю
//  отметку и отдаёт список тех, кто был активен за последние TTL секунд.
//  Это единственный источник «игроков на карте» — без второго списка в коде.
// ============================================================================

const PRESENCE_TTL_SEC = 120;      // через 2 минуты без пинга игрок считается вышедшим
const PRESENCE_FACTIONS = array('earth', 'mars', 'belt', 'outer', 'free');
const PRESENCE_MAX = 200;          // защита от мусора в файле

function presence_now_ms() { return (int)round(microtime(true) * 1000); }

// Обновить отметку игрока. Возвращает список ошибок (пусто = успех).
function presence_update(&$all, $email, $data) {
    $errors = array();
    if (!$email) return array('нет пользователя');
    if (!is_array($data)) return array('нет данных');

    // СТРОГАЯ ПРОВЕРКА ЧИСЛА: (float)'abc' === 0.0, из-за этого мусор
    // проходил как «нулевая позиция». Сначала is_numeric, потом приведение.
    $rawX = isset($data['x']) ? $data['x'] : null;
    $rawY = isset($data['y']) ? $data['y'] : null;
    $x = is_numeric($rawX) ? (float)$rawX : null;
    $y = is_numeric($rawY) ? (float)$rawY : null;
    if ($x === null || $y === null || !is_finite($x) || !is_finite($y)) {
        $errors[] = 'позиция не число';
    }
    if (abs($x) > 200000 || abs($y) > 200000) $errors[] = 'позиция вне допустимого диапазона';

    $system = isset($data['system']) ? preg_replace('/[^a-z0-9_-]/i', '', (string)$data['system']) : 'sol';
    if ($system === '') $system = 'sol';

    // планета/станция, у которой игрок: id из каталога, а не пиксели сцены
    $planet = isset($data['planet']) ? preg_replace('/[^a-z0-9_-]/i', '', (string)$data['planet']) : '';
    // фракция — только из известного списка
    $faction = isset($data['faction']) ? strtolower((string)$data['faction']) : 'free';
    if (!in_array($faction, PRESENCE_FACTIONS, true)) $faction = 'free';

    if ($errors) return $errors;

    if (!is_array($all)) $all = array();
    $all[$email] = array(
        'x' => round($x, 1),
        'y' => round($y, 1),
        'system' => $system,
        'planet' => $planet,
        'faction' => $faction,
        'ts' => presence_now_ms()
    );
    // ЧИСТКА НА ЗАПИСИ: старые отметки не копятся в файле
    $now = presence_now_ms();
    foreach ($all as $em => $rec) {
        if (!is_array($rec) || !isset($rec['ts']) || ($now - $rec['ts']) > PRESENCE_TTL_SEC * 1000) {
            unset($all[$em]);
        }
    }
    if (count($all) > PRESENCE_MAX) {
        // оставляем самых свежих
        uasort($all, function ($a, $b) { return $b['ts'] - $a['ts']; });
        $all = array_slice($all, 0, PRESENCE_MAX, true);
    }
    return array();
}

// Кто в игре прямо сейчас (кроме самого игрока).
function presence_list($all, $exceptEmail = '', $nowMs = null) {
    $now = $nowMs === null ? presence_now_ms() : (int)$nowMs;
    $out = array();
    if (!is_array($all)) return $out;
    foreach ($all as $email => $p) {
        if ($exceptEmail !== '' && strcasecmp($email, $exceptEmail) === 0) continue;
        if (!is_array($p) || !isset($p['ts'])) continue;
        $age = (int)(($now - $p['ts']) / 1000);
        if ($age < 0 || $age > PRESENCE_TTL_SEC) continue;
        $out[] = array(
            'name' => presence_short_name($email),
            'x' => isset($p['x']) ? (float)$p['x'] : 0.0,
            'y' => isset($p['y']) ? (float)$p['y'] : 0.0,
            'system' => isset($p['system']) ? $p['system'] : 'sol',
            'planet' => isset($p['planet']) ? $p['planet'] : '',
            'faction' => isset($p['faction']) ? $p['faction'] : 'free',
            'age' => $age
        );
    }
    usort($out, function ($a, $b) { return $a['age'] - $b['age']; });
    return $out;
}

// Показываем имя до @ — email игрока наружу не отдаём.
function presence_short_name($email) {
    $e = (string)$email;
    $at = strpos($e, '@');
    return $at === false ? $e : substr($e, 0, $at);
}
