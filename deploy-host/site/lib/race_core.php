<?php
// ============================================================================
//  RACE_CORE.PHP — расписание заездов Тарсиса (единое для всех игроков).
//  Старт считается от ФИКСИРОВАННОЙ эпохи, а не от «сейчас»: иначе у каждого
//  свой старт. Любой клиент получает одни и те же моменты (±0 мс).
// ============================================================================

const RACE_PERIOD_MS = 6 * 3600 * 1000;     // заезд каждые 6 часов
const RACE_EPOCH_MS  = 1767225600000;       // 2026-01-01T00:00:00Z
const RACE_MAX_AHEAD = 5;

function race_next_start($nowMs = null) {
    $now = $nowMs === null ? (int)round(microtime(true) * 1000) : (int)$nowMs;
    $n = (int)ceil(($now - RACE_EPOCH_MS) / RACE_PERIOD_MS);
    return RACE_EPOCH_MS + $n * RACE_PERIOD_MS;
}

function race_schedule($nowMs = null, $count = RACE_MAX_AHEAD) {
    $now = $nowMs === null ? (int)round(microtime(true) * 1000) : (int)$nowMs;
    $first = race_next_start($now);
    $out = array();
    for ($i = 0; $i < $count; $i++) {
        $start = $first + $i * RACE_PERIOD_MS;
        $out[] = array(
            'start' => $start,                       // мс UTC
            'start_iso' => gmdate('Y-m-d\TH:i:s\Z', (int)($start / 1000)),
            'in_sec' => (int)max(0, ($start - $now) / 1000)
        );
    }
    return array(
        'period_hours' => RACE_PERIOD_MS / 3600000,
        'epoch' => RACE_EPOCH_MS,
        'next' => $first,
        'races' => $out
    );
}

// Заезд уже идёт? (окно 40 минут: 3 круга)
function race_live($nowMs = null) {
    $now = $nowMs === null ? (int)round(microtime(true) * 1000) : (int)$nowMs;
    $last = race_next_start($now) - RACE_PERIOD_MS;
    $elapsed = $now - $last;
    if ($elapsed < 0 || $elapsed > 40 * 60 * 1000) return null;
    return array('started' => $last, 'elapsed_sec' => (int)($elapsed / 1000),
                 'left_sec' => (int)((40 * 60 * 1000 - $elapsed) / 1000));
}
