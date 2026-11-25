<?php
// ============================================================================
//  FOOD_CORE.PHP — завод еды: сколько людей прокормить и чего это стоит.
//  Числа этапов берутся из lib/food_core_data.php (генерируется из SQL
//  таблицы food_factory — один источник истины).
//
//  Модель сознательно простая и проверяемая:
//    • человеку нужно 0,3 кг сухой еды и 3 л воды в сутки (как в colony.js);
//    • завод даёт throughput_kg_day при энергозатрате kwh_kg на кг;
//    • энергия покупается по 2 кредита за кВт·ч (рыночная цена в игре);
//    • закончились кредиты/вода/сырьё — выпуск падает пропорционально;
//    • что не покрыли заводы, покупается как зерно по старой цене.
//
//  G-02/G-05 — замкнут цикл «произвёл → съели → заплатил»:
//    • еда — единый список по цене: зерно (4 кр/кг) → синтетика (8–15) →
//      деликатесы (80–260); едим самое дешёвое первым, деликатес — последняя
//      линия (уходит, только когда дешевле ничего не осталось);
//    • отчёт по еде: кг и сумма по каждому виду (foodEatenBy) + foodEatenCost,
//      чтобы съеденный лангуст не был молчаливой потерей;
//    • завод списывает сырьё со склада по колонкам input_* из food_factory
//      (метан — Титан, азот — атмосфера): чего не хватило на складе, то
//      по-прежнему покупается кредитами (азот 3 кр/кг), а план помечается
//      resource_limited;
//    • азот считается по данным этапа (input_n2: 0,12 кг/кг, у T4 — 0,10),
//      а не одной константой на все этапы.
// ============================================================================

require_once __DIR__ . '/food_core_data.php';
require_once __DIR__ . '/food_market_data.php';   // FOOD_KINDS — что лежит на складе еды

const FOOD_PER_PERSON_KG = 0.3;
const WATER_PER_PERSON_L = 3.0;
const FOOD_ENERGY_PRICE = 2.0;          // кредитов за кВт·ч
const FOOD_N_PRICE = 3.0;               // кредитов за кг азота (атмосфера Земли)
const FOOD_N_PER_KG = 0.12;             // кг азота на кг белка (эталон T1–T3; у T4 берётся из данных)
const FOOD_EAT_EPS = 0.0001;            // допуск, чтобы не ловить «0,0000001 кг»
const FOOD_GRAIN_PRICE = 4.0;           // кр/кг зерна (сыпучее зерно resources.grain) — самая дешёвая еда
// G-06 «эдакое при достатке»: доля рациона деликатесами от кредитов на человека
const FOOD_LUX_MIN_CPC = 1000.0;        // ≤1000 кр/чел — деликатесов в рационе 0 %
const FOOD_LUX_MAX_CPC = 10000.0;       // ≥10 000 кр/чел — 30 %
const FOOD_LUX_MAX_SHARE = 0.30;        // потолок доли деликатесов
const FOOD_LUX_HAPPY_SHARE = 0.20;      // фактическая доля ≥20 % — колония довольна
const FOOD_LUX_HAPPY_BONUS = 2.0;       // +2 к счастью, не более +2 в сутки

function food_factory_def($tier) {
    if (!isset($GLOBALS['FOOD_FACTORIES'])) return null;
    foreach ($GLOBALS['FOOD_FACTORIES'] as $f) {
        if ((int)$f['tier'] === (int)$tier) return $f;
    }
    return null;
}

// Суммарная паспортная мощность, расход энергии и сырья при полной загрузке
function food_capacity($factories) {
    $kgDay = 0.0; $kw = 0.0; $byTier = array();
    $rawM = 0.0; $rawN = 0.0;
    foreach ((array)$factories as $f) {
        $def = food_factory_def(isset($f['tier']) ? $f['tier'] : 0);
        if (!$def) continue;
        $n = max(0, (int)(isset($f['count']) ? $f['count'] : 1));
        $kgDay += $def['kg_day'] * $n;
        $kw += ($def['kwh_kg'] * $def['kg_day'] / 24.0) * $n;
        $rawM += (isset($def['in_methane']) ? (float)$def['in_methane'] : 0.0) * $def['kg_day'] * $n;
        $rawN += (isset($def['in_n2']) ? (float)$def['in_n2'] : 0.0) * $def['kg_day'] * $n;
        $byTier[] = array('tier' => $def['tier'], 'count' => $n);
    }
    return array(
        'kg_day' => $kgDay,
        'power_kw' => round($kw, 1),
        'tiers' => $byTier,
        // средневзвешенный расход сырья на кг еды по составу заводов
        'raw_per_kg' => array(
            'methane' => $kgDay > 0 ? round($rawM / $kgDay, 4) : 0.0,
            'nitrogen' => $kgDay > 0 ? round($rawN / $kgDay, 4) : 0.0,
        ),
        'raw_kg_day' => array('methane' => round($rawM, 2), 'nitrogen' => round($rawN, 2)),
    );
}

// Сколько кг ресурса лежит на складе (его может не быть вовсе)
function food_resource_kg($resources, $key) {
    if (!is_array($resources) || !isset($resources[$key])) return 0.0;
    if (!is_numeric($resources[$key])) return 0.0;
    return max(0.0, (float)$resources[$key]);
}

// Сколько сырья нужно заводу на выпуск producedKg (метан/азот, кг)
function food_raw_need($producedKg, $factories) {
    $cap = food_capacity($factories);
    $per = $cap['raw_per_kg'];
    $kg = max(0.0, (float)$producedKg);
    return array(
        'methane' => $kg * $per['methane'],
        'nitrogen' => $kg * $per['nitrogen'],
        'per_kg' => $per,
    );
}

// План на dtDays суток: сколько нужно, сколько дадут заводы, чего не хватит.
// Склад не меняет: только читает resources, чтобы понять, что оплачено сырьём,
// а что придётся купить кредитами.
function food_plan($population, $factories, $energyCredits, $resources, $dtDays) {
    $pop = max(0, (float)$population);
    $dt = max(0.0001, (float)$dtDays);
    $needKg = $pop * FOOD_PER_PERSON_KG * $dt;
    $needWater = $pop * WATER_PER_PERSON_L * $dt;

    $cap = food_capacity($factories);
    $byFactory = min($needKg, $cap['kg_day'] * $dt);

    // ограничение по кредитам на энергию
    $kwhPerKg = 0.0;
    if ($byFactory > 0) {
        // средневзвешенная энергоёмкость по факту выпуска
        $kwhPerKg = $cap['kg_day'] > 0 ? ($cap['power_kw'] * 24.0) / $cap['kg_day'] : 0.0;
    }
    $energyNeed = $byFactory * $kwhPerKg;
    $energyCost = $energyNeed * FOOD_ENERGY_PRICE;
    $creditLimit = 1.0;
    if ($energyCost > 0 && $energyCredits < $energyCost) {
        $creditLimit = max(0.0, $energyCredits / $energyCost);
    }
    $produced = $byFactory * $creditLimit;

    // ограничение по воде
    $waterAvail = isset($resources['water']) ? max(0, (float)$resources['water']) : 0.0;
    $waterPerKg = 2.0;                      // литров на кг биомассы (рециркуляция)
    $waterNeeded = $produced * $waterPerKg;
    $waterLimit = 1.0;
    if ($waterNeeded > 0 && $waterAvail < $waterNeeded) {
        $waterLimit = max(0.0, $waterAvail / $waterNeeded);
    }
    $produced *= $waterLimit;

    // СЫРЬЁ: метан и азот по колонкам input_* (кг сырья на кг еды).
    // Что есть на складе — берём со склада (деньгами не платим),
    // чего нет — покупаем кредитами, как раньше, и помечаем resource_limited.
    // Считаем ПОСЛЕ всех ограничений, на фактический выпуск.
    $rawPerKg = $cap['raw_per_kg'];
    $nitrogenKg = $produced * $rawPerKg['nitrogen'];
    $methaneKg = $produced * $rawPerKg['methane'];
    $nFromStock = min($nitrogenKg, food_resource_kg($resources, 'nitrogen'));
    $mFromStock = min($methaneKg, food_resource_kg($resources, 'methane'));
    $nShort = max(0.0, $nitrogenKg - $nFromStock);
    $mShort = max(0.0, $methaneKg - $mFromStock);
    $nitrogenCost = $nShort * FOOD_N_PRICE;
    $energyCost += $nitrogenCost;
    $resourceLimited = ($nShort > FOOD_EAT_EPS) || ($mShort > FOOD_EAT_EPS);

    $fedPop = FOOD_PER_PERSON_KG > 0 ? $produced / (FOOD_PER_PERSON_KG * $dt) : 0.0;
    $shortKg = max(0.0, $needKg - $produced);

    return array(
        'need_kg' => round($needKg, 2),
        'produced_kg' => round($produced, 2),
        'short_kg' => round($shortKg, 2),
        'fed_people' => round($fedPop, 0),
        'need_people' => round($pop, 0),
        'coverage' => $needKg > 0 ? round($produced / $needKg, 3) : 1.0,
        'energy_kwh' => round($energyNeed * $creditLimit * $waterLimit, 2),
        'energy_cost' => round($energyCost * $creditLimit * $waterLimit, 2),
        'water_needed' => round($produced * $waterPerKg, 2),
        'nitrogen_kg' => round($nitrogenKg, 2),
        'nitrogen_cost' => round($nitrogenCost, 2),
        'nitrogen_from_stock_kg' => round($nFromStock, 2),
        'nitrogen_short_kg' => round($nShort, 2),
        'methane_need_kg' => round($methaneKg, 2),
        'methane_from_stock_kg' => round($mFromStock, 2),
        'methane_short_kg' => round($mShort, 2),
        'raw_per_kg' => $rawPerKg,
        'resource_limited' => $resourceLimited,
        'kwh_per_kg' => round($kwhPerKg, 1),
        'capacity_kg_day' => round($cap['kg_day'], 1),
        'power_kw' => $cap['power_kw'],
        'credit_limited' => $creditLimit < 0.999,
        'water_limited' => $waterLimit < 0.999,
        'fallback_kg' => round($shortKg, 2)     // столько придётся покупать зерном
    );
}

// Списать сырьё завода со склада. Возвращает отчёт для API:
// сколько взято, сколько не хватило (это куплено кредитами) и флаг resource_limited.
function food_raw_take(&$resources, $rawNeed) {
    if (!is_array($resources)) $resources = array();
    $used = array(); $short = array(); $limited = false;
    foreach (array('methane', 'nitrogen') as $res) {
        $need = isset($rawNeed[$res]) ? max(0.0, (float)$rawNeed[$res]) : 0.0;
        $have = food_resource_kg($resources, $res);
        $take = min($need, $have);
        if ($take > 0.0) $resources[$res] = $have - $take;
        $used[$res] = $take;
        $short[$res] = $need - $take;
        if ($short[$res] > FOOD_EAT_EPS) $limited = true;
    }
    return array(
        'limited' => $limited,
        'used_kg' => $used,
        'short_kg' => $short,
        'paid_credits' => round($short['nitrogen'] * FOOD_N_PRICE, 2),
    );
}

// ЕДИНЫЙ СПИСОК ЕДЫ (G-05): зерно + все виды со склада, по возрастанию цены.
// Едим самое дешёвое первым: зерно (4 кр/кг) → синтетика (8–15) → деликатесы (80–260).
// Деликатес — последняя линия: он уходит, только когда дешевле ничего не осталось,
// но уходит обязательно (иначе колония голодает при полном складе лангустов).
// 1 единица = 1 кг: единственная не-кг позиция — вино (л), плотность ≈ 1.
function food_eat_items() {
    $items = array(array('id' => 'grain', 'key' => 'grain', 'price' => FOOD_GRAIN_PRICE, 'class' => 'grain'));
    $kinds = (isset($GLOBALS['FOOD_KINDS']) && is_array($GLOBALS['FOOD_KINDS'])) ? $GLOBALS['FOOD_KINDS'] : array();
    foreach ($kinds as $k) {
        if (!isset($k['id'])) continue;
        $items[] = array(
            'id' => $k['id'],
            'key' => 'food_' . $k['id'],
            'price' => isset($k['base_price']) ? (float)$k['base_price'] : 0.0,
            'class' => isset($k['food_class']) ? $k['food_class'] : ''
        );
    }
    usort($items, function ($a, $b) {
        if ($a['price'] == $b['price']) return strcmp($a['id'], $b['id']);
        return ($a['price'] < $b['price']) ? -1 : 1;
    });
    return $items;
}

// Порядок еды по id (для отчётов и совместимости): grain, синтетика, деликатесы
function food_stock_ids() {
    $out = array();
    foreach (food_eat_items() as $it) $out[] = $it['id'];
    return $out;
}

// База — всё, что не деликатес: зерно (4) и синтетика (8–15), по возрастанию цены
function food_base_items() {
    $out = array();
    foreach (food_eat_items() as $it) {
        if ($it['class'] === 'delicacy') continue;
        $out[] = $it;
    }
    return $out;
}

// Деликатесы: $mostExpensive = true — «эдакое» (самый дорогой первым),
// false — страховка от голода (самый дешёвый первым, чтобы меньше сжечь).
function food_luxury_items($mostExpensive = true) {
    $out = array();
    foreach (food_eat_items() as $it) {
        if ($it['class'] !== 'delicacy') continue;
        $out[] = $it;
    }
    return $mostExpensive ? array_reverse($out) : $out;
}

// Один проход еды по заданному порядку видов; накапливает разбивку в $acc
function food_eat_pass(&$resources, $needKg, $items, &$acc) {
    $need = max(0.0, (float)$needKg);
    $eaten = 0.0; $cost = 0.0;
    foreach ((array)$items as $it) {
        if ($need <= FOOD_EAT_EPS) break;
        $have = food_resource_kg($resources, $it['key']);
        if ($have <= 0.0) continue;
        $take = min($have, $need);
        $resources[$it['key']] = $have - $take;
        $need -= $take;
        $eaten += $take;
        $cost += $take * $it['price'];
        if (!isset($acc[$it['key']])) {
            $acc[$it['key']] = array('id' => $it['id'], 'class' => $it['class'],
                                     'kg' => 0.0, 'price' => $it['price'], 'cost' => 0.0);
        }
        $acc[$it['key']]['kg'] += $take;
        $acc[$it['key']]['cost'] += $take * $it['price'];
    }
    return array('eaten_kg' => $eaten, 'cost' => $cost, 'left_kg' => $need);
}

// Доля рациона деликатесами от достатка (G-06): 0 % при ≤1000 кр/чел,
// 30 % при ≥10 000 кр/чел, линейно между. Кламп 0…0,30.
function food_lux_share($credits, $population) {
    $pop = max(0.0, (float)$population);
    if ($pop <= 0.0) return 0.0;
    $cpc = max(0.0, (float)$credits) / $pop;
    if ($cpc <= FOOD_LUX_MIN_CPC) return 0.0;
    if ($cpc >= FOOD_LUX_MAX_CPC) return FOOD_LUX_MAX_SHARE;
    $t = ($cpc - FOOD_LUX_MIN_CPC) / (FOOD_LUX_MAX_CPC - FOOD_LUX_MIN_CPC);
    return round(min(FOOD_LUX_MAX_SHARE, max(0.0, $t * FOOD_LUX_MAX_SHARE)), 4);
}

// +2 к счастью, если фактическая доля деликатесов ≥ 20 % рациона (не более +2 в сутки)
function food_lux_happy_bonus($actualShare, $days) {
    if ((float)$actualShare < FOOD_LUX_HAPPY_SHARE) return 0.0;
    return FOOD_LUX_HAPPY_BONUS * min(1.0, max(0.0, (float)$days));
}

// Съесть до needKg: база → «эдакое» (доля от достатка) → добор (без голода).
// Возвращает кг, сумму и разбивку по каждому виду (кг + цена + кр).
function food_eat_from_stock(&$resources, $needKg, $luxShare = 0.0) {
    if (!is_array($resources)) $resources = array();
    $need = max(0.0, (float)$needKg);
    $share = min(FOOD_LUX_MAX_SHARE, max(0.0, (float)$luxShare));
    $baseTarget = $need * (1.0 - $share);   // база: 100 % рациона при бедном игроке
    $luxTarget = $need * $share;            // «эдакое»: заменяет часть базы
    $acc = array();
    $left = $need;

    // 1) база дешёвым: зерно → синтетика
    $b = food_eat_pass($resources, min($baseTarget, $left), food_base_items(), $acc);
    $left = max(0.0, $left - $b['eaten_kg']);

    // 2) «эдакое»: деликатесы, самый дорогой первым, до need × luxShare
    $l = food_eat_pass($resources, min($luxTarget, $left), food_luxury_items(true), $acc);
    $left = max(0.0, $left - $l['eaten_kg']);

    // 3) добор: сначала база, потом деликатесы — голода быть не должно
    $t1 = food_eat_pass($resources, $left, food_base_items(), $acc);
    $left = max(0.0, $left - $t1['eaten_kg']);
    $t2 = food_eat_pass($resources, $left, food_luxury_items(false), $acc);
    $left = max(0.0, $left - $t2['eaten_kg']);

    $eaten = 0.0; $cost = 0.0;
    foreach ($acc as $row) { $eaten += $row['kg']; $cost += $row['cost']; }
    return array(
        'eaten_kg' => $eaten,
        'cost' => $cost,
        'by' => $acc,
        'left_kg' => $left,
        'lux_share' => $share,
        'lux_target_kg' => $luxTarget,
        'lux_kg' => $l['eaten_kg'],                                  // «эдакое» сверх базы
        'lux_cost' => $l['cost'],
        'lux_share_actual' => $need > 0 ? $l['eaten_kg'] / $need : 0.0,
        'luxury_short_kg' => max(0.0, $luxTarget - $l['eaten_kg'])   // не хватило деликатесов
    );
}

// Покормить население: база (зерно → синтетика) + «эдакое» по достатку.
// $credits/$population задают долю деликатесов; без них — как раньше (только по цене).
function food_feed_population(&$resources, $needKg, $credits = null, $population = null) {
    if (!is_array($resources)) $resources = array();
    $need = max(0.0, (float)$needKg);
    $luxShare = ($credits === null || $population === null) ? 0.0 : food_lux_share($credits, $population);
    $stock = food_eat_from_stock($resources, $need, $luxShare);
    $fromGrain = 0.0; $fromFood = 0.0;
    foreach ($stock['by'] as $key => $row) {
        if ($key === 'grain') $fromGrain += $row['kg'];
        else $fromFood += $row['kg'];
    }
    return array(
        'need_kg' => $need,
        'from_stock_kg' => $fromFood,              // съедено food_* (синтетика + деликатесы)
        'from_grain_kg' => $fromGrain,             // съедено зерна
        'short_kg' => $stock['left_kg'],
        'cost_total' => $stock['cost'],            // total foodEatenCost, кр
        'by' => $stock['by'],                      // по каждому виду: кг + цена + сумма
        'lux_share' => $stock['lux_share'],
        'lux_target_kg' => $stock['lux_target_kg'],
        'lux_kg' => $stock['lux_kg'],
        'lux_cost' => $stock['lux_cost'],
        'lux_share_actual' => $stock['lux_share_actual'],
        'luxury_short_kg' => $stock['luxury_short_kg'],
        'stock_left_kg' => $stock['left_kg'],
    );
}

// Стоимость постройки завода
function food_build_cost($tier, $count) {
    $def = food_factory_def($tier);
    if (!$def) return null;
    $n = max(1, (int)$count);
    return array('tier' => (int)$tier, 'count' => $n, 'cost' => $def['cost'] * $n);
}
