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
// ============================================================================

require_once __DIR__ . '/food_core_data.php';

const FOOD_PER_PERSON_KG = 0.3;
const WATER_PER_PERSON_L = 3.0;
const FOOD_ENERGY_PRICE = 2.0;          // кредитов за кВт·ч
const FOOD_N_PRICE = 3.0;               // кредитов за кг азота (атмосфера Земли)
const FOOD_N_PER_KG = 0.12;             // кг азота на кг белка

function food_factory_def($tier) {
    if (!isset($GLOBALS['FOOD_FACTORIES'])) return null;
    foreach ($GLOBALS['FOOD_FACTORIES'] as $f) {
        if ((int)$f['tier'] === (int)$tier) return $f;
    }
    return null;
}

// Суммарная паспортная мощность и расход энергии при полной загрузке
function food_capacity($factories) {
    $kgDay = 0.0; $kw = 0.0; $byTier = array();
    foreach ((array)$factories as $f) {
        $def = food_factory_def(isset($f['tier']) ? $f['tier'] : 0);
        if (!$def) continue;
        $n = max(0, (int)(isset($f['count']) ? $f['count'] : 1));
        $kgDay += $def['kg_day'] * $n;
        $kw += ($def['kwh_kg'] * $def['kg_day'] / 24.0) * $n;
        $byTier[] = array('tier' => $def['tier'], 'count' => $n);
    }
    return array('kg_day' => $kgDay, 'power_kw' => round($kw, 1), 'tiers' => $byTier);
}

// План на dtDays суток: сколько нужно, сколько дадут заводы, чего не хватит
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

    // АЗОТ: нужен для белка; считаем деньгами, а не складом —
    // иначе у старых игроков без запаса завод встал бы.
    // Считаем ПОСЛЕ всех ограничений, на фактический выпуск.
    $nitrogenKg = $produced * FOOD_N_PER_KG;
    $nitrogenCost = $nitrogenKg * FOOD_N_PRICE;
    $energyCost += $nitrogenCost;

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
        'kwh_per_kg' => round($kwhPerKg, 1),
        'capacity_kg_day' => round($cap['kg_day'], 1),
        'power_kw' => $cap['power_kw'],
        'credit_limited' => $creditLimit < 0.999,
        'water_limited' => $waterLimit < 0.999,
        'fallback_kg' => round($shortKg, 2)     // столько придётся покупать зерном
    );
}

// Стоимость постройки завода
function food_build_cost($tier, $count) {
    $def = food_factory_def($tier);
    if (!$def) return null;
    $n = max(1, (int)$count);
    return array('tier' => (int)$tier, 'count' => $n, 'cost' => $def['cost'] * $n);
}
