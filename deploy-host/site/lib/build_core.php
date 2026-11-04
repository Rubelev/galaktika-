<?php
// ============================================================================
//  BUILD_CORE.PHP — хранение сборок в профиле (болид и клон), а не в localStorage.
//  Смысл: сборка должна ехать за игроком на любое устройство и проверяться
//  сервером, а не доверяться клиенту.
// ============================================================================

const BUILD_HULLS = array('strela', 'klinok', 'molot');
const BUILD_STAT_MIN = 1;
const BUILD_STAT_MAX = 20;
const BUILD_STAT_SUM_MAX = 100;
const BUILD_WW_STATS = array('dex', 'cun', 'str', 'end', 'spd');

function build_validate_bolid($b) {
    $errors = array();
    if (!is_array($b)) return array('нет данных болида');
    if (!isset($b['hull']) || !in_array($b['hull'], BUILD_HULLS, true)) {
        $errors[] = 'неизвестный корпус: ' . (isset($b['hull']) ? $b['hull'] : '—');
    }
    if (!isset($b['modules']) || !is_array($b['modules'])) {
        $errors[] = 'нет списка модулей';
    } elseif (count($b['modules']) > 8) {
        $errors[] = 'модулей больше 8';
    }
    if (isset($b['artifacts']) && (!is_array($b['artifacts']) || count($b['artifacts']) > 3)) {
        $errors[] = 'артефактов больше 3';
    }
    return $errors;
}

function build_validate_clone($c) {
    $errors = array();
    if (!is_array($c)) return array('нет данных клона');
    $sum = 0;
    foreach (BUILD_WW_STATS as $k) {
        $v = isset($c[$k]) ? (int)$c[$k] : 0;
        if ($v < BUILD_STAT_MIN || $v > BUILD_STAT_MAX) {
            $errors[] = "параметр $k вне 1..20";
        }
        $sum += $v;
    }
    if ($sum > BUILD_STAT_SUM_MAX) $errors[] = 'сумма параметров больше ' . BUILD_STAT_SUM_MAX;
    return $errors;
}

// Сохранить сборку: kind = bolid | clone
function build_save(&$all, $email, $kind, $data) {
    $errors = $kind === 'clone' ? build_validate_clone($data) : build_validate_bolid($data);
    if ($errors) return array('ok' => false, 'errors' => $errors);
    if (!isset($all[$email]) || !is_array($all[$email])) $all[$email] = array();
    $all[$email][$kind] = array(
        'data' => $data,
        'savedAt' => (int)round(microtime(true) * 1000)
    );
    return array('ok' => true, 'kind' => $kind, 'savedAt' => $all[$email][$kind]['savedAt']);
}

function build_load($all, $email, $kind) {
    if (!isset($all[$email][$kind])) return null;
    return $all[$email][$kind];
}
