<?php
// ============================================================================
//  MOTION_CORE.PHP — серверная копия единых правил движения (1:1 с motion-core.js)
//  Контракт: docs/MOTION-CONTRACT.md
//
//  Любая команда, добавленная здесь, должна быть добавлена и в JS — и наоборот.
//  Проверка соответствия: tools/motion_core_test.php (сверяет позы с эталоном,
//  посчитанным JS-версией).
// ============================================================================

const MOTION_SPEEDS = array(
    'fighter' => 1.00,
    'light'   => 0.40,
    'hauler'  => 0.30,
    'heavy'   => 0.15,
);
const MOTION_BASE_KM_S = 50000.0;
const MOTION_MAX_C_SHARE = 0.95;
const MOTION_C_KM_S = 299792.0;
const MOTION_KM_PER_PX = 808649.0;
const MOTION_MIN_LEG_GAME_MS = 600000.0;      // 600 игровых секунд
const MOTION_MAX_PX_PER_GAME_SEC = 1 / 45.0;  // не быстрее 1 px за 45 с

function motion_registry() {
    static $reg = null;
    if ($reg === null) $reg = array();
    return $reg;
}

function motion_define_command($op, $durationFn, $poseFn) {
    if (!is_string($op) || $op === '' || !is_callable($durationFn) || !is_callable($poseFn)) {
        throw new InvalidArgumentException('motion_define_command: нужны op, duration, pose');
    }
    $reg = motion_registry();
    $reg[$op] = array('duration' => $durationFn, 'pose' => $poseFn);
    // PHP не даёт менять static через ссылку функции — используем глобальный массив
    $GLOBALS['__motion_commands'][$op] = $reg[$op];
    return true;
}

function motion_get_command($op) {
    if (!isset($GLOBALS['__motion_commands'])) return null;
    return isset($GLOBALS['__motion_commands'][$op]) ? $GLOBALS['__motion_commands'][$op] : null;
}

function motion_list_commands() {
    return array_keys(isset($GLOBALS['__motion_commands']) ? $GLOBALS['__motion_commands'] : array());
}

function motion_speed_km_s($cls, $limits = array()) {
    $share = isset(MOTION_SPEEDS[$cls]) ? MOTION_SPEEDS[$cls] : MOTION_SPEEDS['light'];
    $v = MOTION_BASE_KM_S * $share;
    $maxC = isset($limits['maxC']) ? (float)$limits['maxC'] : MOTION_MAX_C_SHARE;
    return min($v, MOTION_C_KM_S * $maxC);
}

// ФИЗИКА: ускорение и потолок класса (1:1 с motion.js / motion-core.js)
const MOTION_CLASS_SPEC = array(
    'fighter' => array('a' => 150, 'vc' => 0.30),
    'light'   => array('a' => 80,  'vc' => 0.25),
    'hauler'  => array('a' => 30,  'vc' => 0.15),
    'heavy'   => array('a' => 15,  'vc' => 0.10),
);

function motion_leg_duration_sec($km, $cls) {
    $spec = isset(MOTION_CLASS_SPEC[$cls]) ? MOTION_CLASS_SPEC[$cls] : MOTION_CLASS_SPEC['light'];
    $a = $spec['a'];
    $vmax = MOTION_C_KM_S * min($spec['vc'], 0.95);
    $tAcc = $vmax / $a;
    $dAcc = 0.5 * $a * $tAcc * $tAcc;
    if (2 * $dAcc >= $km) return 2 * sqrt(max(1, $km) / $a);
    return 2 * $tAcc + ($km - 2 * $dAcc) / $vmax;
}

function motion_leg_duration_ms($from, $to, $cls, $limits = array()) {
    $dx = $to['x'] - $from['x'];
    $dy = $to['y'] - $from['y'];
    $lenPx = sqrt($dx * $dx + $dy * $dy);
    if ($lenPx <= 0) $lenPx = 1.0;
    $km = $lenPx * MOTION_KM_PER_PX;
    return motion_leg_duration_sec($km, $cls) * 1000.0;
}

// ---------- БАЗОВЫЕ КОМАНДЫ ----------
motion_define_command('HOLD',
    function ($o, $ctx) { return max(0, (isset($o['sec']) ? $o['sec'] : 0) * 1000); },
    function ($o, $k, $ctx) { return array('x' => $ctx['at']['x'], 'y' => $ctx['at']['y'], 'ang' => isset($o['ang']) ? $o['ang'] : 0); }
);

motion_define_command('LOAD',
    function ($o, $ctx) { return max(60, isset($o['sec']) ? $o['sec'] : 300) * 1000; },
    function ($o, $k, $ctx) { return array('x' => $ctx['at']['x'], 'y' => $ctx['at']['y'], 'ang' => isset($o['ang']) ? $o['ang'] : 0); }
);

motion_define_command('UNLOAD',
    function ($o, $ctx) { return max(60, isset($o['sec']) ? $o['sec'] : 300) * 1000; },
    function ($o, $k, $ctx) { return array('x' => $ctx['at']['x'], 'y' => $ctx['at']['y'], 'ang' => isset($o['ang']) ? $o['ang'] : 0); }
);

motion_define_command('MOVE_TO',
    function ($o, $ctx) { return motion_leg_duration_ms($ctx['from'], $ctx['to'], $ctx['cls'], $ctx['limits']); },
    function ($o, $k, $ctx) {
        $e = $k * $k * (3 - 2 * $k);
        return array(
            'x' => $ctx['from']['x'] + ($ctx['to']['x'] - $ctx['from']['x']) * $e,
            'y' => $ctx['from']['y'] + ($ctx['to']['y'] - $ctx['from']['y']) * $e,
            'ang' => atan2($ctx['to']['y'] - $ctx['from']['y'], $ctx['to']['x'] - $ctx['from']['x']) * 180 / M_PI + 90
        );
    }
);

motion_define_command('ORBIT',
    function ($o, $ctx) { return max(60, isset($o['sec']) ? $o['sec'] : 240) * 1000; },
    function ($o, $k, $ctx) {
        $r = isset($o['radius']) ? $o['radius'] : 26;
        $turns = isset($o['turns']) ? $o['turns'] : 1;
        $start = isset($o['startAngle']) ? $o['startAngle'] : 0;
        $a = $start + $k * M_PI * 2 * $turns;
        return array(
            'x' => $ctx['at']['x'] + cos($a) * $r,
            'y' => $ctx['at']['y'] + sin($a) * $r,
            'ang' => $a * 180 / M_PI + 90
        );
    }
);

motion_define_command('LAND',
    function ($o, $ctx) { return max(30, isset($o['sec']) ? $o['sec'] : 120) * 1000; },
    function ($o, $k, $ctx) {
        $from = isset($o['radius']) ? $o['radius'] : 26;
        $to = isset($o['surface']) ? $o['surface'] : 7;
        $e = $k * $k * (3 - 2 * $k);
        $r = $from + ($to - $from) * $e;
        $a = isset($o['startAngle']) ? $o['startAngle'] : 0;
        return array(
            'x' => $ctx['at']['x'] + cos($a) * $r,
            'y' => $ctx['at']['y'] + sin($a) * $r,
            'ang' => ($a + M_PI) * 180 / M_PI + 90
        );
    }
);

motion_define_command('PATROL',
    function ($o, $ctx) {
        $pts = array();
        foreach ((isset($o['points']) ? $o['points'] : array()) as $id) {
            if (isset($ctx['world']['bodies'][$id])) $pts[] = $ctx['world']['bodies'][$id];
        }
        if (count($pts) < 2) return MOTION_MIN_LEG_GAME_MS;
        $total = 0;
        $n = count($pts);
        for ($i = 0; $i < $n; $i++) {
            $total += motion_leg_duration_ms($pts[$i], $pts[($i + 1) % $n], $ctx['cls'], $ctx['limits']);
        }
        $loops = max(1, isset($o['loops']) ? $o['loops'] : 1);
        return $total * $loops;
    },
    function ($o, $k, $ctx) {
        $pts = array();
        foreach ((isset($o['points']) ? $o['points'] : array()) as $id) {
            if (isset($ctx['world']['bodies'][$id])) $pts[] = $ctx['world']['bodies'][$id];
        }
        if (count($pts) < 2) return array('x' => $ctx['at']['x'], 'y' => $ctx['at']['y'], 'ang' => 0);
        $legs = count($pts);
        $idx = min($legs - 1, (int)floor($k * $legs));
        $a = $pts[$idx];
        $b = $pts[($idx + 1) % $legs];
        $kk = ($k * $legs) - $idx;
        return array(
            'x' => $a['x'] + ($b['x'] - $a['x']) * $kk,
            'y' => $a['y'] + ($b['y'] - $a['y']) * $kk,
            'ang' => atan2($b['y'] - $a['y'], $b['x'] - $a['x']) * 180 / M_PI + 90
        );
    }
);

// ---------- ПЛАН И ПОЗА ----------
function motion_build_plan($ship, $world) {
    $plan = array();
    $t = isset($ship['startedAt']) ? $ship['startedAt'] : 0;
    $cursor = null;
    $at = isset($ship['at']) ? $ship['at'] : null;
    $cls = isset($ship['cls']) ? $ship['cls'] : 'light';
    $limits = isset($ship['limits']) ? $ship['limits'] : array();

    foreach ((isset($ship['orders']) ? $ship['orders'] : array()) as $order) {
        $op = isset($order['op']) ? $order['op'] : '';
        $spec = motion_get_command($op);
        if (!$spec) continue;

        $atId = isset($order['at']) ? $order['at'] : (isset($order['to']) ? $order['to'] : null);
        if ($cursor !== null) {
            $from = $cursor;
        } else {
            $from = ($at !== null && isset($world['bodies'][$at])) ? $world['bodies'][$at] : array('x' => 0, 'y' => 0);
        }
        $to = ($atId !== null && isset($world['bodies'][$atId])) ? $world['bodies'][$atId] : $from;

        $ctx = array('world' => $world, 'cls' => $cls, 'limits' => $limits,
                     'from' => $from, 'to' => $to, 'at' => $to, 'order' => $order);
        $dur = call_user_func($spec['duration'], $order, $ctx);
        $plan[] = array('op' => $op, 'start' => $t, 'dur' => $dur, 'spec' => $spec, 'ctx' => $ctx, 'order' => $order);
        $t += $dur;
        $cursor = call_user_func($spec['pose'], $order, 1, $ctx);
        if (isset($order['at'])) $at = $order['at'];
    }
    return array('plan' => $plan, 'end' => $t);
}

function motion_pose_at($ship, $tMs, $world) {
    $built = motion_build_plan($ship, $world);
    if (!count($built['plan'])) {
        $at = isset($ship['at']) ? $ship['at'] : null;
        $p = ($at !== null && isset($world['bodies'][$at])) ? $world['bodies'][$at] : array('x' => 0, 'y' => 0);
        return array('x' => $p['x'], 'y' => $p['y'], 'ang' => 0, 'op' => 'IDLE', 'k' => 0, 'done' => true);
    }
    foreach ($built['plan'] as $i => $step) {
        if ($tMs < $step['start'] + $step['dur']) {
            $k = $step['dur'] <= 0 ? 1 : max(0, min(1, ($tMs - $step['start']) / $step['dur']));
            $p = call_user_func($step['spec']['pose'], $step['order'], $k, $step['ctx']);
            return array('x' => $p['x'], 'y' => $p['y'], 'ang' => isset($p['ang']) ? $p['ang'] : 0,
                         'op' => $step['op'], 'k' => $k, 'index' => $i, 'done' => false);
        }
    }
    $last = end($built['plan']);
    $p = call_user_func($last['spec']['pose'], $last['order'], 1, $last['ctx']);
    return array('x' => $p['x'], 'y' => $p['y'], 'ang' => isset($p['ang']) ? $p['ang'] : 0,
                 'op' => 'DONE', 'k' => 1, 'index' => count($built['plan']) - 1, 'done' => true);
}

function motion_validate($ship, $world) {
    $problems = array();
    $built = motion_build_plan($ship, $world);
    foreach ($built['plan'] as $step) {
        if (!is_finite($step['dur']) || $step['dur'] < 0) $problems[] = $step['op'] . ': плохая длительность';
        if ($step['op'] === 'MOVE_TO') {
            $dx = $step['ctx']['to']['x'] - $step['ctx']['from']['x'];
            $dy = $step['ctx']['to']['y'] - $step['ctx']['from']['y'];
            $lenPx = sqrt($dx * $dx + $dy * $dy);
            if ($lenPx <= 0) $lenPx = 1;
            $vKmS = ($lenPx * MOTION_KM_PER_PX) / ($step['dur'] / 1000);
            if ($vKmS > MOTION_C_KM_S * MOTION_MAX_C_SHARE) {
                $problems[] = $step['op'] . ': ' . round($vKmS) . ' км/с > 0,95 c';
            }
        }
    }
    return array('ok' => count($problems) === 0, 'problems' => $problems, 'end' => $built['end']);
}


// ===== КЕПЛЕР: позиция тела по орбитальным элементам (1:1 с js/orbit-kepler.js) =====
function motion_kepler_solve($M, $e) {
    $E = $M;
    for ($i = 0; $i < 8; $i++) {
        $f = $E - $e * sin($E) - $M;
        $fp = 1 - $e * cos($E);
        if (abs($fp) < 1e-12) break;
        $E -= $f / $fp;
        if (abs($f) < 1e-10) break;
    }
    return $E;
}

function motion_kepler_position($orbit, $timeMs) {
    $a = max(1e-6, isset($orbit['a']) ? (float)$orbit['a'] : 1.0);
    $e = min(0.9, max(0.0, isset($orbit['e']) ? (float)$orbit['e'] : 0.0));
    $P = max(0.001, isset($orbit['P']) ? (float)$orbit['P'] : 365.25);
    $M0 = deg2rad(isset($orbit['M0']) ? (float)$orbit['M0'] : 0.0);
    $days = $timeMs / 86400000.0;
    $M = $M0 + ($days / $P) * M_PI * 2;
    $E = motion_kepler_solve($M, $e);
    $xv = $a * (cos($E) - $e);
    $yv = $a * sqrt(1 - $e * $e) * sin($E);
    $w = deg2rad(isset($orbit['w']) ? (float)$orbit['w'] : 0.0);
    $om = deg2rad(isset($orbit['om']) ? (float)$orbit['om'] : 0.0);
    $inc = deg2rad(isset($orbit['i']) ? (float)$orbit['i'] : 0.0);
    $x1 = $xv * cos($w) - $yv * sin($w);
    $y1 = $xv * sin($w) + $yv * cos($w);
    $z2 = $y1 * sin($inc);
    $y2 = $y1 * cos($inc);
    $x = $x1 * cos($om) - $y2 * sin($om);
    $y = $x1 * sin($om) + $y2 * cos($om);
    return array('x' => $x, 'y' => $y, 'z' => $z2, 'r' => sqrt($x*$x + $y*$y + $z2*$z2), 'E' => $E);
}
