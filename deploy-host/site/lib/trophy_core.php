<?php
// ============================================================================
//  TROPHY_CORE.PHP — TZ-261108-02 «Трофейная коллекция капитана».
//  Каталог: 24 предмета, 4 сета по 6 (lib/trophy_catalog.json — контент и числа).
//  Сервер сам делает бросок: клиент не присылает результат, только просит бросок.
//
//  Правила (из ТЗ):
//    • дроп 20 %, pity — не позже 10-го броска без нового предмета;
//    • дубликат → 1 осколок; 5 осколков → любой недостающий предмет сета;
//    • лимит 5 бросков в сутки на аккаунт, сброс в 00:00 МСК (UTC+3);
//    • кристаллы не участвуют ни в получении, ни в крафте;
//    • бонус за сет +2 % (максимум +6 %), «Гонки» — косметика, экономики не даёт.
//
//  Состояние игрока (в trophies.json, ключ — e-mail):
//    items{id:ts}, shards, pity, day, rolls, lastRollId, lastRoll, sets{id:ts}
// ============================================================================

require_once __DIR__ . '/trophy_catalog.php';

const TROPHY_DAY_OFFSET = 10800;      // МСК = UTC+3, без перехода на летнее время

function trophy_catalog() { return $GLOBALS['TROPHY_CATALOG']; }

// Число из каталога с запасным значением
function trophy_cfg($key, $default = null) {
    $c = trophy_catalog();
    return isset($c[$key]) ? $c[$key] : $default;
}

function trophy_sets() {
    $c = trophy_catalog();
    return isset($c['sets']) && is_array($c['sets']) ? $c['sets'] : array();
}

function trophy_items() {
    $c = trophy_catalog();
    return isset($c['items']) && is_array($c['items']) ? $c['items'] : array();
}

function trophy_set_def($setId) {
    foreach (trophy_sets() as $s) if ($s['id'] === $setId) return $s;
    return null;
}

function trophy_items_of_set($setId) {
    $out = array();
    foreach (trophy_items() as $it) if ($it['set'] === $setId) $out[] = $it;
    return $out;
}

function trophy_item_def($itemId) {
    foreach (trophy_items() as $it) if ($it['id'] === $itemId) return $it;
    return null;
}

function trophy_item_ids() {
    $out = array();
    foreach (trophy_items() as $it) $out[] = $it['id'];
    return $out;
}

// Ключ календарного дня в МСК: сброс лимита в 00:00
function trophy_day_key($now) { return gmdate('Y-m-d', (int)$now + TROPHY_DAY_OFFSET); }

// Сколько секунд до сброса лимита (00:00 МСК)
function trophy_seconds_to_reset($now) {
    $t = (int)$now + TROPHY_DAY_OFFSET;
    return 86400 - ($t % 86400);
}

// Чистое состояние нового игрока
function trophy_new_state($now) {
    return array(
        'items' => array(), 'shards' => 0, 'pity' => 0,
        'day' => trophy_day_key($now), 'rolls' => 0,
        'lastRollId' => '', 'lastRoll' => null, 'lastRollAt' => 0,
        'sets' => array(), 'firstAt' => 0,
    );
}

// Приводит состояние к полному виду и сбрасывает суточный счётчик при смене дня.
// Возвращает true, если день сменился (нужен сброс лимита).
function trophy_normalize(&$state, $now) {
    if (!is_array($state)) $state = array();
    foreach (trophy_new_state($now) as $k => $v) {
        if (!array_key_exists($k, $state)) $state[$k] = $v;
    }
    if (!is_array($state['items'])) $state['items'] = array();
    if (!is_array($state['sets'])) $state['sets'] = array();
    $state['shards'] = max(0, (int)$state['shards']);
    $state['pity'] = max(0, (int)$state['pity']);
    $state['rolls'] = max(0, (int)$state['rolls']);
    $state['lastRollAt'] = (int)$state['lastRollAt'];
    $state['firstAt'] = (int)$state['firstAt'];
    $state['lastRollId'] = (string)$state['lastRollId'];
    $day = trophy_day_key($now);
    $changed = ($state['day'] !== $day);
    if ($changed) {
        $state['day'] = $day;
        $state['rolls'] = 0;
    }
    return $changed;
}

// Можно ли бросить: ok / used / left / limit / wait_sec / error
function trophy_can_roll($state, $now) {
    $limit = (int)trophy_cfg('daily_rolls', 5);
    $used = isset($state['rolls']) ? (int)$state['rolls'] : 0;
    if ($used >= $limit) {
        return array('ok' => false, 'code' => 429, 'used' => $used, 'left' => 0, 'limit' => $limit,
                     'wait_sec' => trophy_seconds_to_reset($now),
                     'error' => 'лимит бросков на сегодня исчерпан');
    }
    return array('ok' => true, 'used' => $used, 'left' => $limit - $used, 'limit' => $limit, 'wait_sec' => 0);
}

// Осколки за один дубликат (из каталога, по умолчанию 1)
function trophy_shards_per_duplicate() { return 1; }

function trophy_craft_cost() { return (int)trophy_cfg('craft_cost', 5); }

// Есть ли все предметы сета
function trophy_set_complete($state, $setId) {
    $items = trophy_items_of_set($setId);
    if (!$items) return false;
    foreach ($items as $it) {
        if (!isset($state['items'][$it['id']])) return false;
    }
    return true;
}

// Отметить собранный сет (возвращает true, если сет закрылся именно сейчас)
function trophy_check_set(&$state, $setId, $now) {
    if (isset($state['sets'][$setId])) return false;
    if (!trophy_set_complete($state, $setId)) return false;
    $state['sets'][$setId] = (int)$now;
    return true;
}

// Бросок. $rollId — клиентский идентификатор для идемпотентности:
// повтор с тем же id возвращает сохранённый результат и не тратит бросок.
// $now — время, $rng — функция (max) → 1..max (для тестов), по умолчанию mt_rand.
function trophy_roll(&$state, $setId, $now, $rollId = '', $rng = null) {
    $now = (int)$now;
    trophy_normalize($state, $now);
    $rollId = substr((string)$rollId, 0, 64);
    if ($rollId !== '' && $state['lastRollId'] === $rollId && is_array($state['lastRoll'])) {
        $replay = $state['lastRoll'];
        $replay['replay'] = true;
        return $replay;
    }
    $set = trophy_set_def($setId);
    if (!$set) {
        return array('ok' => false, 'code' => 400, 'error' => 'нет такого сета', 'set' => $setId);
    }
    $can = trophy_can_roll($state, $now);
    if (!$can['ok']) return array_merge($can, array('set' => $setId));

    $dropPct = (int)trophy_cfg('drop_pct', 20);
    $pityLimit = (int)trophy_cfg('pity', 10);
    $state['rolls'] = (int)$state['rolls'] + 1;

    // pity: этот бросок — 10-й подряд без нового предмета → предмет гарантирован
    $forced = ((int)$state['pity'] >= $pityLimit - 1);
    $r = $rng ? (int)$rng(100) : mt_rand(1, 100);
    $drop = $forced || ($r <= $dropPct);

    $result = array(
        'ok' => true, 'set' => $setId, 'set_name' => $set['name'],
        'drop' => false, 'duplicate' => false, 'item' => null, 'shards' => 0,
        'pity' => (int)$state['pity'], 'forced' => $forced, 'roll' => $r,
        'rolls_used' => $state['rolls'], 'rolls_left' => max(0, $can['limit'] - $state['rolls']),
        'wait_sec' => trophy_seconds_to_reset($now), 'day' => $state['day'],
        'set_complete' => false
    );

    if (!$drop) {
        $state['pity'] = (int)$state['pity'] + 1;
        $result['pity'] = $state['pity'];
        $result['lastRollId'] = $rollId;
        $state['lastRollId'] = $rollId;
        $state['lastRoll'] = $result;
        $state['lastRollAt'] = $now;
        return $result;
    }

    // какой предмет выпал: равномерно по сету
    $pool = trophy_items_of_set($setId);
    $n = count($pool);
    if ($n === 0) return array('ok' => false, 'code' => 500, 'error' => 'пустой сет');
    $pick = $rng ? ($rng($n) - 1) : mt_rand(0, $n - 1);
    $pick = max(0, min($n - 1, $pick));
    $item = $pool[$pick];

    $state['pity'] = 0;
    if (isset($state['items'][$item['id']])) {
        $add = trophy_shards_per_duplicate();
        $state['shards'] = (int)$state['shards'] + $add;
        $result['duplicate'] = true;
        $result['shards'] = $add;
        $result['shards_total'] = (int)$state['shards'];
    } else {
        $state['items'][$item['id']] = $now;
        if ((int)$state['firstAt'] === 0) $state['firstAt'] = $now;
        $result['drop'] = true;
        $result['item'] = array('id' => $item['id'], 'set' => $item['set'], 'name' => $item['name'],
                                'icon' => $item['icon'], 'rare' => $item['rare'], 'note' => $item['note']);
        if (trophy_check_set($state, $setId, $now)) {
            $result['set_complete'] = true;
            $result['set_name'] = $set['name'];
        }
    }
    $result['pity'] = (int)$state['pity'];
    $result['lastRollId'] = $rollId;
    $state['lastRollId'] = $rollId;
    $state['lastRoll'] = $result;
    $state['lastRollAt'] = $now;
    return $result;
}

// Крафт: 5 осколков → любой недостающий предмет сета (выбор игрока)
function trophy_craft(&$state, $setId, $itemId, $now) {
    $now = (int)$now;
    trophy_normalize($state, $now);
    $set = trophy_set_def($setId);
    if (!$set) return array('ok' => false, 'code' => 400, 'error' => 'нет такого сета');
    $item = trophy_item_def($itemId);
    if (!$item || $item['set'] !== $setId) {
        return array('ok' => false, 'code' => 400, 'error' => 'предмет не из этого сета');
    }
    if (isset($state['items'][$itemId])) {
        return array('ok' => false, 'code' => 400, 'error' => 'этот предмет уже есть',
                     'shards' => (int)$state['shards']);
    }
    $cost = trophy_craft_cost();
    if ((int)$state['shards'] < $cost) {
        return array('ok' => false, 'code' => 400, 'error' => 'не хватает осколков',
                     'shards' => (int)$state['shards'], 'cost' => $cost);
    }
    $state['shards'] = (int)$state['shards'] - $cost;
    $state['items'][$itemId] = $now;
    if ((int)$state['firstAt'] === 0) $state['firstAt'] = $now;
    $done = trophy_check_set($state, $setId, $now);
    return array('ok' => true, 'crafted' => array('id' => $item['id'], 'set' => $item['set'],
                 'name' => $item['name'], 'icon' => $item['icon'], 'rare' => $item['rare']),
                 'shards' => (int)$state['shards'], 'cost' => $cost,
                 'set_complete' => $done);
}

// Бонусы за собранные сеты: экономические +2 % каждый, максимум +6 %;
// «Гонки» — косметика, экономики не дают.
function trophy_bonuses($state) {
    $out = array();
    $total = 0.0;
    $cosmetic = array();
    foreach (trophy_sets() as $s) {
        $done = isset($state['sets'][$s['id']]);
        if ($done && !empty($s['economic'])) {
            $out[$s['id']] = 0.02;
            $total += 0.02;
        } else {
            $out[$s['id']] = 0.0;
        }
        if ($done && empty($s['economic'])) $cosmetic[] = $s['id'];
    }
    $cap = (float)trophy_cfg('bonus_cap', 0.06);
    $capped = min($total, $cap);
    return array('by_set' => $out, 'total' => round($capped, 4), 'raw_total' => round($total, 4),
                 'cap' => $cap, 'cosmetic' => $cosmetic);
}

// Прогресс для клиента: сколько собрано, что осталось.
// owned — счётчик 0/1 на предмет; время первого получения — в first_at (DEF-261109-01).
function trophy_progress($state) {
    $items = trophy_items();
    $owned = array();
    $firstAt = array();
    foreach ($items as $it) {
        $has = isset($state['items'][$it['id']]);
        // DEF-261109-01: owned — КОЛИЧЕСТВО (0/1), а не epoch-время.
        // Время первого получения отдаём отдельно, в first_at.
        $owned[$it['id']] = $has ? 1 : 0;
        $firstAt[$it['id']] = $has ? (int)$state['items'][$it['id']] : 0;
    }
    $bySet = array();
    $collected = 0;          // сумма по сетам (DEF-261109-02)
    $setsComplete = 0;
    foreach (trophy_sets() as $s) {
        $setItems = trophy_items_of_set($s['id']);
        $have = 0;
        // считаем по счётчику 0/1, а не по «истинности» времени
        foreach ($setItems as $it) if ($owned[$it['id']] === 1) $have++;
        $complete = ($have === count($setItems));
        if ($complete) $setsComplete++;
        $collected += $have;
        $bySet[$s['id']] = array(
            'name' => $s['name'], 'have' => $have, 'total' => count($setItems),
            'complete' => $complete,
            'collected' => $complete ? 1 : 0,
            'first_at' => isset($state['sets'][$s['id']]) ? (int)$state['sets'][$s['id']] : 0,
            'bonus' => !empty($s['economic']) ? '+2 %' : 'косметика',
            'source' => $s['source']
        );
    }
    $totalHave = 0;
    foreach ($owned as $n) if ($n === 1) $totalHave++;
    return array('owned' => $owned, 'first_at' => $firstAt,
                 'have' => $totalHave, 'collected' => $collected, 'total' => count($items),
                 'sets_total' => count(trophy_sets()), 'sets_complete' => $setsComplete,
                 'by_set' => $bySet, 'items' => $items);
}


// Бонусы сетов считаем по фактическим предметам (items), а не по записи sets:
// иначе у старого профиля 6/6 при пустом sets было complete=true, bonus=0.
function trophy_bonus_from_items($state) {
    // trophy_catalog() — это весь документ; предметы берём через trophy_items()
    $catalog = function_exists('trophy_items') ? trophy_items() : array();
    $bySet = array();
    foreach ($catalog as $it) {
        $set = $it['set'] ?? '';
        if (!isset($bySet[$set])) $bySet[$set] = array('total' => 0, 'have' => 0);
        $bySet[$set]['total']++;
        if (!empty($state['items'][$it['id']])) $bySet[$set]['have']++;
    }
    $setsDone = 0;
    foreach ($bySet as $s) if ($s['total'] > 0 && $s['have'] >= $s['total']) $setsDone++;
    return array('sets_done' => $setsDone, 'bonus' => min(0.06, $setsDone * 0.02), 'by_set' => $bySet);
}
