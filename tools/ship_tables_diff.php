<?php
// Сравнение таблиц «до/после» (C-08): старые литералы из api.php/battle_core.php
// (снимок BEFORE) против НОВЫХ функций api.php и констант lib/ship_stats.php.
// Доказывает, что перенос чисел не изменил ни цену/комплектующие, ни арену, ни HP.
// Запуск: php ship_tables_diff.php <СТАРЫЙ api.php> <СТАРЫЙ battle_core.php> [НОВЫЙ api.php]
$oldApi = isset($argv[1]) ? $argv[1] : null;
$oldBattle = isset($argv[2]) ? $argv[2] : null;
$newApi = isset($argv[3]) ? $argv[3] : (getenv('NEW_API') ?: (__DIR__ . '/../site/api.php'));
$lib = getenv('SHIP_STATS_LIB') ?: (__DIR__ . '/../site/lib/ship_stats.php');
if (!file_exists($lib)) $lib = '/var/www/u3699164/data/www/warbattleuniverse.com/lib/ship_stats.php';
require $lib;

// Тело `return array(...);` из указанной функции (для старых литералов).
function extract_return_array($file, $fn) {
    $src = file_get_contents($file);
    $pos = strpos($src, 'function ' . $fn . '(');
    if ($pos === false) return null;
    $ret = strpos($src, 'return array(', $pos);
    if ($ret === false) return null;
    $arrPos = strpos($src, 'array', $ret);
    $open = strpos($src, '(', $arrPos);
    $depth = 0; $end = -1;
    for ($i = $open; $i < strlen($src); $i++) {
        if ($src[$i] === '(') $depth++;
        elseif ($src[$i] === ')') { $depth--; if ($depth === 0) { $end = $i; break; } }
    }
    if ($end < 0) return null;
    return eval('return ' . substr($src, $arrPos, $end - $arrPos + 1) . ';');
}

// Определение функции целиком (для новых api.php) — чтобы вызвать её по-настоящему.
function extract_function($file, $fn) {
    $src = file_get_contents($file);
    $pos = strpos($src, 'function ' . $fn . '(');
    if ($pos === false) return null;
    $open = strpos($src, '{', $pos);
    $depth = 0; $end = -1;
    for ($i = $open; $i < strlen($src); $i++) {
        if ($src[$i] === '{') $depth++;
        elseif ($src[$i] === '}') { $depth--; if ($depth === 0) { $end = $i; break; } }
    }
    if ($end < 0) return null;
    return substr($src, $pos, $end - $pos + 1);
}

function diff_arrays($old, $new, $path = '') {
    $bad = array();
    if (is_array($old) && is_array($new)) {
        $keys = array_unique(array_merge(array_keys($old), array_keys($new)));
        foreach ($keys as $k) {
            if (!array_key_exists($k, $old) || !array_key_exists($k, $new)) {
                $bad[] = $path . '/' . $k . ' (нет с одной стороны)';
                continue;
            }
            $bad = array_merge($bad, diff_arrays($old[$k], $new[$k], $path . '/' . $k));
        }
    } elseif (is_numeric($old) && is_numeric($new)) {
        if (abs((float)$old - (float)$new) != 0) $bad[] = $path . ': ' . $old . ' ≠ ' . $new;
    } elseif ($old != $new) {
        $bad[] = $path . ': ' . var_export($old, true) . ' ≠ ' . var_export($new, true);
    }
    return $bad;
}

$ok = true;

// --- 1. Цены/комплектующие: старый литерал → новая функция api.php → константы ---
$oldShip = $oldApi ? extract_return_array($oldApi, 'ship_table') : null;
$newShipFn = null;
if ($newApi && file_exists($newApi)) {
    $def = extract_function($newApi, 'ship_table');
    if ($def) { eval($def); $newShipFn = ship_table(); }
}
$newShipConst = array();
foreach (SHIP_STATS as $id => $s) $newShipConst[$id] = array('price' => $s['price'], 'parts' => $s['parts']);
if (!$oldShip) { echo "FAIL не прочитан старый ship_table()\n"; $ok = false; }
elseif (!$newShipFn) { echo "FAIL не прочитана новая ship_table()\n"; $ok = false; }
else {
    $d1 = diff_arrays($oldShip, $newShipFn);
    $d2 = diff_arrays($newShipConst, $newShipFn);
    $d = array_merge($d1, $d2);
    echo ($d ? 'FAIL ' : 'OK   ') . 'ship_table(): 9 моделей, price+parts'
        . ($d ? ' — ' . implode('; ', array_slice($d, 0, 5)) : ' — до=после=константы, Δ=0') . "\n";
    if ($d) $ok = false;
}

// --- 2. Арена: старый литерал → новая функция api.php → SHIP_COMBAT_STATS ---
$oldCombat = $oldApi ? extract_return_array($oldApi, 'combat_ship_table') : null;
$newCombatFn = null;
if ($newApi && file_exists($newApi)) {
    $def = extract_function($newApi, 'combat_ship_table');
    if ($def) { eval($def); $newCombatFn = combat_ship_table(); }
}
if (!$oldCombat) { echo "FAIL не прочитан старый combat_ship_table()\n"; $ok = false; }
elseif (!$newCombatFn) { echo "FAIL не прочитана новая combat_ship_table()\n"; $ok = false; }
else {
    // C-10: имена намеренно приведены к клиентским, поэтому баланс сверяем без поля name
    $strip = function ($tbl) { foreach ($tbl as $id => $v) unset($tbl[$id]['name']); return $tbl; };
    $d = array_merge(diff_arrays($strip($oldCombat), $strip($newCombatFn)), diff_arrays($strip($oldCombat), $strip(SHIP_COMBAT_STATS)));
    echo ($d ? 'FAIL ' : 'OK   ') . 'combat_ship_table(): баланс 9 моделей × hull/shield/armor/evade/energy/slots'
        . ($d ? ' — ' . implode('; ', array_slice($d, 0, 5)) : ' — до=после, Δ=0') . "\n";
    if ($d) $ok = false;
    $changed = array();
    foreach ($newCombatFn as $id => $v) {
        if (isset($oldCombat[$id]) && $oldCombat[$id]['name'] !== $v['name']) {
            $changed[] = $id . ': ' . $oldCombat[$id]['name'] . ' → ' . $v['name'];
        }
    }
    echo 'OK   имена арены: переименовано ' . count($changed) . '/9 (id не менялись)'
        . (count($changed) ? ' — ' . implode('; ', $changed) : '') . "\n";
}

// --- 3. HP живого боя: BATTLE_HP → BATTLE_CLASS_HP ---
$oldBattleHp = null;
if ($oldBattle && file_exists($oldBattle)) {
    if (preg_match('/const\s+BATTLE_HP\s*=\s*(array\([^;]+\));/s', file_get_contents($oldBattle), $m)) {
        $oldBattleHp = eval('return ' . $m[1] . ';');
    }
}
if (!$oldBattleHp) { echo "FAIL не прочитан старый BATTLE_HP\n"; $ok = false; }
else {
    $d = diff_arrays($oldBattleHp, BATTLE_CLASS_HP);
    echo ($d ? 'FAIL ' : 'OK   ') . 'BATTLE_HP → BATTLE_CLASS_HP: 3 класса' . ($d ? ' — ' . implode('; ', $d) : ' — Δ=0') . "\n";
    if ($d) $ok = false;
}

echo $ok ? "ИТОГ: PASS (перенос чисел без изменения баланса)\n" : "ИТОГ: FAIL\n";
exit($ok ? 0 : 1);
