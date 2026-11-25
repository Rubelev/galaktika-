<?php
// ============================================================================
//  WORLD_ECON.PHP — экономика зрелищ: Вармир (арены) и Тарсис (гонки).
//  Событие кормит и поит гостей, тратит энергию, платит персоналу и призовые.
//  Доход: билеты + маржа ставок + деликатесы (×10 к заводской еде).
//  Модель одна на все миры: параметры в lib/world_econ_data.php (из SQL).
// ============================================================================

require_once __DIR__ . '/world_econ_data.php';

const WE_FOOD_PRICE = 12.0;        // заводская еда, кр/кг (см. food_kind)
const WE_DELICACY_MULT = 10.0;     // деликатес = ×10 к заводскому аналогу
const WE_WATER_PRICE = 7.0;        // кр/л
const WE_ENERGY_PRICE = 2.0;       // кр/кВт·ч
const WE_TICK_COOLDOWN = 3600;     // H-01: частота событий — серверная, 1 час

// H-01: пропуск события. Частоту задаёт сервер, а не клиент:
//   • force принимается ТОЛЬКО у админа (role = admin) — для ручной проверки/отыгровки;
//   • обычный игрок ждёт кулдаун: force от него игнорируется и он получает 429 с wait_sec.
function world_tick_gate($lastTick, $now, $isAdmin = false, $force = false) {
    $last = (int)$lastTick;
    $now = (int)$now;
    $since = $last > 0 ? max(0, $now - $last) : WE_TICK_COOLDOWN;
    $wait = max(0, WE_TICK_COOLDOWN - $since);
    if ($isAdmin && $force) {
        return array('ok' => true, 'forced' => true, 'wait_sec' => 0, 'since_sec' => $since);
    }
    if ($wait > 0) {
        return array('ok' => false, 'forced' => false, 'wait_sec' => $wait, 'since_sec' => $since,
                     'error' => 'событие ещё не началось');
    }
    return array('ok' => true, 'forced' => false, 'wait_sec' => 0, 'since_sec' => $since);
}

function world_econ_def($id) {
    foreach ((array)$GLOBALS['WORLD_ECON'] as $e) {
        if ($e['id'] === $id) return $e;
    }
    return null;
}

function world_econ_list($world = null) {
    $out = array();
    foreach ((array)$GLOBALS['WORLD_ECON'] as $e) {
        if ($world === null || $e['world'] === $world) $out[] = $e;
    }
    return $out;
}

// Баланс события при заданном числе гостей (guests может быть null → полная арена)
function world_event_balance($id, $guests = null) {
    $e = world_econ_def($id);
    if (!$e) return null;

    $cap = max(1, (int)$e['capacity']);
    $g = $guests === null ? $cap : max(0, min($cap, (float)$guests));
    $fill = $g / $cap;

    // ---- доход ----
    $tickets = $g * (float)$e['ticket'];
    $betTurnover = $g * (float)$e['bet_per_guest'];
    $betRevenue = $betTurnover * (float)$e['bet_margin'];
    // деликатесы: часть гостей покупает «натуральное» по ×10
    $luxGuests = $g * (float)$e['lux_share'];
    $luxKg = $luxGuests * 0.3;
    $luxRevenue = $luxKg * WE_FOOD_PRICE * WE_DELICACY_MULT;
    $revenue = $tickets + $betRevenue + $luxRevenue;

    // ---- расходы ----
    $foodKg = $g * (float)$e['kg_food'];
    $foodCost = $foodKg * WE_FOOD_PRICE;
    $waterCost = $g * (float)$e['l_water'] * WE_WATER_PRICE;
    $energyKwh = $g * (float)$e['kwh'];
    $energyCost = $energyKwh * WE_ENERGY_PRICE;
    $staffCost = (int)$e['staff'] * (float)$e['pay'];
    $prize = (float)$e['prize'];
    $upkeep = (float)$e['upkeep'];
    $costs = $foodCost + $waterCost + $energyCost + $staffCost + $prize + $upkeep;

    $profit = $revenue - $costs;
    $margin = $revenue > 0 ? $profit / $revenue : -1.0;

    // ---- точка безубыточности ----
    // доход и расходы линейны по гостям, кроме постоянных (персонал/приз/обслуживание)
    $perGuestRevenue = $e['ticket'] + $e['bet_per_guest'] * $e['bet_margin']
        + 0.3 * $e['lux_share'] * WE_FOOD_PRICE * WE_DELICACY_MULT;
    $perGuestCost = $e['kg_food'] * WE_FOOD_PRICE + $e['l_water'] * WE_WATER_PRICE + $e['kwh'] * WE_ENERGY_PRICE;
    $fixed = $staffCost + $prize + $upkeep;
    $breakeven = 0;
    if ($perGuestRevenue > $perGuestCost) {
        $breakeven = (int)ceil($fixed / ($perGuestRevenue - $perGuestCost));
    } else {
        $breakeven = -1;      // событие не окупается ни при каком числе гостей
    }

    return array(
        'id' => $e['id'], 'world' => $e['world'], 'event' => $e['event'],
        'guests' => (int)$g, 'capacity' => $cap, 'fill' => round($fill, 3),
        'revenue' => round($revenue, 0),
        'tickets' => round($tickets, 0),
        'bets' => round($betRevenue, 0),
        'luxury' => round($luxRevenue, 0),
        'costs' => round($costs, 0),
        'food_kg' => round($foodKg, 0),
        'food_cost' => round($foodCost, 0),
        'water_cost' => round($waterCost, 0),
        'energy_kwh' => round($energyKwh, 0),
        'energy_cost' => round($energyCost, 0),
        'staff_cost' => round($staffCost, 0),
        'prize' => round($prize, 0),
        'upkeep' => round($upkeep, 0),
        'profit' => round($profit, 0),
        'margin' => round($margin, 3),
        'breakeven_guests' => $breakeven,
        'viable' => $profit > 0
    );
}

// Сводка по миру: суммарный баланс при полной и половинной загрузке
function world_econ_world_summary($world) {
    $rows = array(); $totalFull = 0; $totalHalf = 0;
    foreach (world_econ_list($world) as $e) {
        $full = world_event_balance($e['id'], null);
        $half = world_event_balance($e['id'], (int)round($e['capacity'] / 2));
        $rows[] = array('id' => $e['id'], 'event' => $e['event'],
                        'profit_full' => $full['profit'], 'profit_half' => $half['profit'],
                        'breakeven' => $full['breakeven_guests']);
        $totalFull += $full['profit'];
        $totalHalf += $half['profit'];
    }
    return array('world' => $world, 'events' => $rows,
                 'profit_full' => $totalFull, 'profit_half' => $totalHalf);
}
