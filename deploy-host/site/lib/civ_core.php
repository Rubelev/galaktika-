<?php
// ============================================================================
//  CIV_CORE.PHP — боты-цивилизации: решения, свободные действия, учёт.
//
//  Модель:
//    • у каждой цивилизации есть состояние (кредиты, еда, население, флот, влияние);
//    • раз в тик (10 минут) она делает N действий;
//    • (1 − autonomy_pct) действий — СЦЕНАРНЫЕ (по стратегии фракции, детерминированно);
//    • autonomy_pct действий — СВОБОДНЫЕ (взвешенный выбор из разрешённых);
//    • ГСЧ засеян (seed + номер тика) → один и тот же тик воспроизводим;
//    • ресурсы не берутся из воздуха: каждое действие проверяет баланс
//      и не может увести его в минус; всё пишется в журнал civ_action.
//
//  Что НЕ делает бот: не трогает профили игроков, не отбирает корабли/колонии
//  игроков, не меняет цены рынка напрямую (только через спрос/предложение).
// ============================================================================

require_once __DIR__ . '/civ_data.php';
require_once __DIR__ . '/bot_db.php';

const CIV_TICK_SEC      = 600;      // 10 минут
const CIV_ACTIONS_PER_TICK = 3;     // сколько действий за тик
const CIV_STATE_FILE    = 'civ-state.json';
const CIV_LOG_KEEP      = 400;      // последних записей в журнале
const CIV_MAX_EXPAND_PER_TICK = 1;

function civ_list() { return (array)$GLOBALS['CIVILIZATIONS']; }

function civ_def($id) {
    foreach (civ_list() as $c) if ($c['id'] === $id) return $c;
    return null;
}

function civ_default_state($def) {
    return array(
        'id' => $def['id'],
        'credits' => 250000,
        'food' => 5000,
        'population' => 120000,
        'fleet' => 40,
        'influence' => 10,
        'territory' => 1,
        'last_tick' => 0,
        'tick_no' => 0,
        'totals' => array('scripted' => 0, 'free' => 0, 'actions' => 0)
    );
}

function civ_state_load() {
    $raw = @file_get_contents(civ_state_path());
    $d = $raw ? json_decode($raw, true) : null;
    return is_array($d) ? $d : array();
}

function civ_state_save($state) {
    $tmp = civ_state_path() . '.tmp';
    file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, civ_state_path());
}

function civ_state_path() {
    global $dataDir;
    $dir = isset($dataDir) && $dataDir ? $dataDir : sys_get_temp_dir();
    return rtrim($dir, '/') . '/' . CIV_STATE_FILE;
}

// Детерминированный ГСЧ: seed + номер тика + соль действия
function civ_rand($seed, $tick, $salt) {
    $h = hash('sha256', $seed . '|' . $tick . '|' . $salt, true);
    $n = unpack('N', substr($h, 0, 4));
    return $n[1] / 4294967296.0;
}

// Каталог действий: что может сделать цивилизация
function civ_actions() {
    return array(
        'produce'  => array('cost' => 0,     'need_credits' => 0,     'gives' => array('credits' => 6000, 'food' => 120)),
        'trade'    => array('cost' => 0,     'need_credits' => 0,     'gives' => array('credits' => 9000)),
        'recruit'  => array('cost' => 8000,  'need_credits' => 8000,  'gives' => array('fleet' => 3)),
        'fortify'  => array('cost' => 5000,  'need_credits' => 5000,  'gives' => array('influence' => 2)),
        'research' => array('cost' => 12000, 'need_credits' => 12000, 'gives' => array('influence' => 3, 'credits' => -12000)),
        'expand'   => array('cost' => 40000, 'need_credits' => 40000, 'gives' => array('territory' => 1, 'credits' => -40000)),
        'raid'     => array('cost' => 0,     'need_credits' => 0,     'gives' => array('credits' => 15000, 'influence' => -1)),
    );
}

// Сценарий фракции: приоритет действий (детерминированный порядок)
function civ_script($def) {
    $a = (float)$def['aggression'];
    $g = (float)$def['greed'];
    $t = (float)$def['tech'];
    $order = array();
    if ($a >= 0.6)      { $order[] = 'raid'; $order[] = 'recruit'; }
    if ($g >= 0.6)      { $order[] = 'trade'; $order[] = 'produce'; }
    if ($t >= 0.7)      { $order[] = 'research'; }
    $order[] = 'produce';
    $order[] = 'fortify';
    $order[] = 'expand';
    return array_values(array_unique($order));
}

// Может ли цивилизация выполнить действие (ресурсная проверка)
function civ_can($state, $action) {
    $def = civ_actions()[$action] ?? null;
    if (!$def) return false;
    if (($state['credits'] ?? 0) < $def['need_credits']) return false;
    if ($action === 'expand' && ($state['territory'] ?? 0) >= 12) return false;
    if ($action === 'raid' && ($state['fleet'] ?? 0) < 5) return false;
    return true;
}

// Применить действие, вернуть изменения (или null, если нельзя)
function civ_apply(&$state, $action) {
    if (!civ_can($state, $action)) return null;
    $def = civ_actions()[$action];
    $max = max(0, -1 * (int)$def['cost']);
    $before = $state;
    if ($action === 'research') {
        $state['credits'] -= 12000;
        $state['influence'] += 3;
    } else {
        foreach (($def['gives'] ?? array()) as $k => $v) {
            $state[$k] = ($state[$k] ?? 0) + $v;
        }
        if ($action === 'raid') {
            $state['fleet'] = max(0, $state['fleet'] - 1);
            $state['food'] = max(0, $state['food'] - 50);
        }
    }
    // границы, чтобы бот не ушёл в бесконечность
    $state['credits'] = max(0, (float)$state['credits']);
    $state['food'] = max(0, (float)$state['food']);
    $state['fleet'] = min(400, max(0, (int)$state['fleet']));
    $state['influence'] = min(200, max(0, (int)$state['influence']));
    $state['territory'] = min(12, max(1, (int)$state['territory']));
    $state['population'] = min(5000000, max(0, (int)$state['population']));

    return array(
        'action' => $action,
        'credits_delta' => round($state['credits'] - $before['credits'], 2),
        'food_delta' => round($state['food'] - $before['food'], 2),
        'pop_delta' => round($state['population'] - $before['population'], 2)
    );
}

// Один тик всех цивилизаций. autonomy_pct = доля свободных действий.
function civ_tick_all($now = null) {
    $now = $now ?? time();
    $state = civ_state_load();
    $out = array('tick_at' => $now, 'civs' => array(), 'actions' => array());
    foreach (civ_list() as $def) {
        $id = $def['id'];
        $s = $state[$id] ?? civ_default_state($def);
        $s['tick_no'] = (int)$s['tick_no'] + 1;
        $tickNo = $s['tick_no'];
        $freeTarget = (int)round(CIV_ACTIONS_PER_TICK * (float)$def['autonomy_pct']);
        $freeTarget = max(0, min(CIV_ACTIONS_PER_TICK, $freeTarget));
        $script = civ_script($def);
        $done = array();

        for ($i = 0; $i < CIV_ACTIONS_PER_TICK; $i++) {
            $isFree = ($i < $freeTarget);
            if ($isFree) {
                // свободное действие: взвешенный выбор среди доступных
                $pool = array_values(array_filter(array_keys(civ_actions()), function ($a) use ($s) {
                    return civ_can($s, $a);
                }));
                if (!$pool) break;
                $r = civ_rand((int)$def['seed'], $tickNo, 'free' . $i);
                $action = $pool[(int)floor($r * count($pool)) % count($pool)];
                $kind = 'free';
            } else {
                $action = null;
                foreach ($script as $candidate) {
                    if (civ_can($s, $candidate)) { $action = $candidate; break; }
                }
                if ($action === null) {
                    $pool = array_values(array_filter(array_keys(civ_actions()), function ($a) use ($s) { return civ_can($s, $a); }));
                    $action = $pool ? $pool[0] : null;
                }
                if ($action === null) break;
                $kind = 'scripted';
            }
            $res = civ_apply($s, $action);
            if ($res === null) continue;
            $res['kind'] = $kind;
            $res['civ'] = $id;
            $done[] = $res;
        }

        $s['last_tick'] = $now;
        $s['totals']['scripted'] = (int)$s['totals']['scripted'] + count(array_filter($done, fn($x) => $x['kind'] === 'scripted'));
        $s['totals']['free'] = (int)$s['totals']['free'] + count(array_filter($done, fn($x) => $x['kind'] === 'free'));
        $s['totals']['actions'] = (int)$s['totals']['actions'] + count($done);
        $state[$id] = $s;
        $out['civs'][$id] = array(
            'name' => $def['name'], 'autonomy_pct' => (float)$def['autonomy_pct'],
            'actions' => $done, 'state' => $s
        );
        foreach ($done as $d) $out['actions'][] = $d;
    }
    civ_state_save($state);
    civ_log_append($out['actions'], $state);
    // журнал в SQLite: одна запись на тик + по строке на действие с ошибкой
    if (function_exists('bot_log')) {
        bot_log('civ', 'tick', 'civ_tick', array(
            'civs' => count($out['civs']), 'actions' => count($out['actions'])
        ), 'info');
        foreach ($out['actions'] as $a) {
            if (abs((float)$a['credits_delta']) > 50000) {
                bot_log('civ', 'economy', 'large_delta', $a, 'warning');
            }
        }
    }
    return $out;
}

function civ_log_append($actions, $state) {
    global $dataDir;
    if (!isset($dataDir) || !$dataDir) return;
    $file = rtrim($dataDir, '/') . '/civ-log.json';
    $raw = @file_get_contents($file);
    $log = $raw ? json_decode($raw, true) : array();
    if (!is_array($log)) $log = array();
    foreach ($actions as $a) {
        $log[] = array(
            'ts' => time(), 'civ' => $a['civ'], 'action' => $a['action'], 'kind' => $a['kind'],
            'credits' => $a['credits_delta'], 'food' => $a['food_delta']
        );
    }
    if (count($log) > CIV_LOG_KEEP) $log = array_slice($log, -CIV_LOG_KEEP);
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($log, JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, $file);
}

// Доля свободных действий по журналу (сколько реально, а не сколько задано)
function civ_autonomy_report() {
    global $dataDir;
    $file = rtrim((string)$dataDir, '/') . '/civ-log.json';
    $raw = @file_get_contents($file);
    $log = $raw ? json_decode($raw, true) : array();
    if (!is_array($log) || !$log) return array('free' => 0, 'scripted' => 0, 'share' => null, 'by_civ' => array());
    $free = 0; $scripted = 0; $byCiv = array();
    foreach ($log as $e) {
        if (!isset($byCiv[$e['civ']])) $byCiv[$e['civ']] = array('free' => 0, 'scripted' => 0);
        if ($e['kind'] === 'free') { $free++; $byCiv[$e['civ']]['free']++; }
        else { $scripted++; $byCiv[$e['civ']]['scripted']++; }
    }
    foreach ($byCiv as $id => &$v) {
        $tot = $v['free'] + $v['scripted'];
        $v['share'] = $tot ? round($v['free'] / $tot, 3) : null;
    }
    unset($v);
    return array('free' => $free, 'scripted' => $scripted,
                 'share' => ($free + $scripted) ? round($free / ($free + $scripted), 3) : null,
                 'by_civ' => $byCiv);
}
