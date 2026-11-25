<?php
// ============================================================================
//  MOB_CORE.PHP — мобы-личности: 600 жителей (по 100 у каждой цивилизации).
//
//  Смысл: моб живёт — зарабатывает и тратит. Пират, удачно ограбив, спускает
//  награбленное за 1–3 тика (гулянка), а не копит вечно.
//
//  ГЛАВНОЕ ПРАВИЛО (чтобы математика не поплыла):
//    экономика мобов ЗАМКНУТА. Мобы не печатают кредиты игрокам и не забирают
//    их. Сохраняется тождество:
//        сумма(балансы) + сумма(потрачено) = сумма(стартовых) + сумма(заработанных)
//    Это проверяется тестом на каждом тике.
//
//  Пиратский налёт моба ограничен: loot = income × k, k ≤ 3, и тратится
//  в течение 1–3 тиков; остаток не переносится бесконечно (обнуляется в трату).
// ============================================================================

require_once __DIR__ . '/bot_db.php';

const MOB_TICK_SEC   = 600;    // 10 минут, как у цивилизаций
const MOB_STATE_FILE = 'mobs-state.json';
const MOB_LOG_KEEP   = 300;
const MOB_START_CREDITS = 1000;
const MOB_MAX_BALANCE = 60000;  // потолок накоплений, чтобы не копили вечно

function mob_catalog() {
    static $cache = null;
    if ($cache !== null) return $cache;
    $raw = @file_get_contents(__DIR__ . '/mob_catalog.json');
    $d = $raw ? json_decode($raw, true) : array();
    $cache = is_array($d) ? $d : array();
    return $cache;
}

function mob_state_path() {
    global $dataDir;
    $dir = isset($dataDir) && $dataDir ? $dataDir : sys_get_temp_dir();
    return rtrim($dir, '/') . '/' . MOB_STATE_FILE;
}

function mob_state_load() {
    $raw = @file_get_contents(mob_state_path());
    $d = $raw ? json_decode($raw, true) : null;
    return is_array($d) ? $d : array();
}

function mob_state_save($state) {
    $tmp = mob_state_path() . '.tmp';
    file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, mob_state_path());
}

function mob_rand($seed, $tick, $salt) {
    $h = hash('sha256', $seed . '|' . $tick . '|' . $salt, true);
    $n = unpack('N', substr($h, 0, 4));
    return $n[1] / 4294967296.0;
}

function mob_default($m) {
    return array(
        'credits' => MOB_START_CREDITS,
        'earned' => 0.0,
        'spent' => 0.0,
        'loot_pending' => 0.0,
        'spree_ticks' => 0,
        'tick' => 0,
        'mood' => 'спокоен',
        'last' => ''
    );
}

// Профессия и характер → сколько заработал и сколько спустил
function mob_income($m, $r) {
    $base = (float)$m['income'];
    $noise = 0.75 + $r * 0.6;              // ±25 %
    return round($base * $noise, 2);
}

function mob_spend_target($m, $st, $r) {
    $income = (float)$m['income'];
    $thrift = (float)$m['thrift'];
    $greed = (float)$m['greed'];
    $base = $income * (1 - $thrift) * (0.6 + $r * 0.8);
    // жадные меньше тратят на себя, но пираты и игроки спускают больше
    if ($m['role'] === 'pirate' || $m['role'] === 'gambler' || $m['role'] === 'smuggler') {
        $base *= (0.8 + $greed);
    }
    return round(max(0, $base), 2);
}

// Один тик мобов. Возвращает отчёт по цивилизациям и контроль тождества.
function mob_tick_all($now = null) {
    $now = $now ?? time();
    $catalog = mob_catalog();
    $state = mob_state_load();
    $out = array('tick_at' => $now, 'mobs' => count($catalog), 'by_civ' => array(), 'samples' => array());

    $sumEarned = 0.0; $sumSpent = 0.0; $sumBalances = 0.0;

    foreach ($catalog as $m) {
        $id = $m['id'];
        $st = $state[$id] ?? mob_default($m);
        $st['tick'] = (int)$st['tick'] + 1;
        $tick = $st['tick'];

        // 1) заработок
        $earned = mob_income($m, mob_rand((int)$m['seed'], $tick, 'earn'));
        $st['credits'] += $earned;
        $st['earned'] += $earned;
        $sumEarned += $earned;

        // 2) пиратский налёт: изредка приносит добычу, которую надо спустить
        if ($m['role'] === 'pirate') {
            $luck = mob_rand((int)$m['seed'], $tick, 'raid');
            if ($luck > 0.72) {
                $loot = round((float)$m['income'] * (1 + $luck), 2);   // ≤ 2× дохода
                $st['loot_pending'] += $loot;
                $st['spree_ticks'] = 1 + (int)floor(mob_rand((int)$m['seed'], $tick, 'spree') * 3);
                $st['mood'] = 'гуляет';
                $st['last'] = 'удачный налёт: ' . $loot;
            }
        }

        // 3) трата: обычная + спуск добычи
        $spend = mob_spend_target($m, $st, mob_rand((int)$m['seed'], $tick, 'spend'));
        if ($st['loot_pending'] > 0 && $st['spree_ticks'] > 0) {
            // за оставшиеся тики спускаем всю добычу
            $per = $st['loot_pending'] / $st['spree_ticks'];
            $spend += $per;
            $st['loot_pending'] = max(0, $st['loot_pending'] - $per);
            $st['spree_ticks']--;
            if ($st['loot_pending'] <= 0.01) { $st['loot_pending'] = 0; $st['mood'] = 'доволен'; $st['last'] = 'спустил всё'; }
        }
        // нельзя потратить больше, чем есть
        $spend = min($spend, $st['credits']);
        $st['credits'] -= $spend;
        $st['spent'] += $spend;
        $sumSpent += $spend;

        if ($st['credits'] > MOB_MAX_BALANCE) $st['credits'] = MOB_MAX_BALANCE;
        if ($st['credits'] < 0) $st['credits'] = 0;
        $st['credits'] = round($st['credits'], 2);
        $sumBalances += $st['credits'];

        $state[$id] = $st;
        $civ = $m['civ'];
        if (!isset($out['by_civ'][$civ])) $out['by_civ'][$civ] = array('mobs' => 0, 'earned' => 0.0, 'spent' => 0.0, 'balances' => 0.0, 'pirates_spree' => 0);
        $out['by_civ'][$civ]['mobs']++;
        $out['by_civ'][$civ]['earned'] += $earned;
        $out['by_civ'][$civ]['spent'] += $spend;
        $out['by_civ'][$civ]['balances'] += $st['credits'];
        if ($m['role'] === 'pirate' && $st['loot_pending'] > 0) $out['by_civ'][$civ]['pirates_spree']++;
        if (count($out['samples']) < 3 && $m['role'] === 'pirate') {
            $out['samples'][] = array('name' => $m['name'], 'civ' => $civ, 'last' => $st['last'],
                                      'credits' => $st['credits'], 'spent' => $st['spent']);
        }
    }

    mob_state_save($state);

    $out['totals'] = array(
        'earned' => round($sumEarned, 2),
        'spent' => round($sumSpent, 2),
        'balances' => round($sumBalances, 2)
    );
    // контроль: балансы + потрачено = стартовые + заработанные
    $expected = count($catalog) * MOB_START_CREDITS + round(array_sum(array_column($state, 'earned')), 2);
    $out['check'] = array(
        'expected' => round($expected, 2),
        'actual' => round($sumBalances + round(array_sum(array_column($state, 'spent')), 2), 2),
        'ok' => abs($expected - ($sumBalances + array_sum(array_column($state, 'spent')))) < 1.0
    );
    mob_log_append($out, $now);          // после totals/check — иначе пишутся null
    if (function_exists('bot_log')) {
        bot_log('mob', 'tick', 'mob_tick', array(
            'mobs' => $out['mobs'], 'earned' => $out['totals']['earned'],
            'spent' => $out['totals']['spent'], 'balances' => $out['totals']['balances'],
            'conservation' => $out['check']['ok']
        ), $out['check']['ok'] ? 'info' : 'critical');
        if (!$out['check']['ok']) {
            bot_issue('mob', 'mob.conservation_broken', 'critical',
                'Тождество экономики мобов не сходится', $out['check']);
        }
        foreach ($out['samples'] as $sp) {
            bot_log('mob', 'story', 'pirate_spree', $sp, 'info');
        }
    }
    return $out;
}

function mob_log_append($report, $now) {
    global $dataDir;
    if (!isset($dataDir) || !$dataDir) return;
    $file = rtrim($dataDir, '/') . '/mob-log.json';
    $raw = @file_get_contents($file);
    $log = $raw ? json_decode($raw, true) : array();
    if (!is_array($log)) $log = array();
    $log[] = array('ts' => $now, 'earned' => $report['totals']['earned'],
                   'spent' => $report['totals']['spent'],
                   'balances' => $report['totals']['balances'],
                   'ok' => $report['check']['ok']);
    if (count($log) > MOB_LOG_KEEP) $log = array_slice($log, -MOB_LOG_KEEP);
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($log, JSON_UNESCAPED_UNICODE), LOCK_EX);
    rename($tmp, $file);
}

// Сводка для API: агрегаты + несколько «живых» историй
function mob_report() {
    $catalog = mob_catalog();
    $state = mob_state_load();
    $byCiv = array();
    $samples = array();
    foreach ($catalog as $m) {
        $st = $state[$m['id']] ?? mob_default($m);
        $civ = $m['civ'];
        if (!isset($byCiv[$civ])) $byCiv[$civ] = array('mobs' => 0, 'credits' => 0.0, 'earned' => 0.0, 'spent' => 0.0, 'spree' => 0);
        $byCiv[$civ]['mobs']++;
        $byCiv[$civ]['credits'] += $st['credits'];
        $byCiv[$civ]['earned'] += $st['earned'];
        $byCiv[$civ]['spent'] += $st['spent'];
        if ($st['loot_pending'] > 0) $byCiv[$civ]['spree']++;
        if (count($samples) < 5 && $m['role'] === 'pirate' && $st['spent'] > 0) {
            $samples[] = array('id' => $m['id'], 'name' => $m['name'], 'civ' => $civ,
                               'credits' => round($st['credits']), 'spent' => round($st['spent']),
                               'mood' => $st['mood'], 'last' => $st['last']);
        }
    }
    foreach ($byCiv as &$v) {
        $v['credits'] = round($v['credits']);
        $v['earned'] = round($v['earned']);
        $v['spent'] = round($v['spent']);
    }
    unset($v);
    return array('mobs_total' => count($catalog), 'by_civ' => $byCiv, 'samples' => $samples);
}
