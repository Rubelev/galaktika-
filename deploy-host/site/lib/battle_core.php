<?php
// ============================================================================
//  BATTLE_CORE.PHP — живой бой: урон, гибель бортов, события.
//  Правила движения — из motion_core.php (единое ядро), здесь только бой.
// ============================================================================
require_once __DIR__ . '/ship_stats.php';   // единый источник характеристик (C-08)

// HP по классам движения — в lib/ship_stats.php:BATTLE_CLASS_HP (перенесено 1:1,
// баланс не менялся). Значения: fighter 40, light 30, hauler 20.
const BATTLE_PIRATE_HP = 200;
const BATTLE_FLEET_DPS = 1.6;      // урон флота за минуту на живой борт
const BATTLE_PIRATE_DPS = 22;      // урон пиратов за минуту на живого пирата
const BATTLE_SCAN_MIN = 4;         // минут сканирования колец
const BATTLE_MAX_MINUTE = 240;

function battle_new($id, $fleetCount, $pirateCount, $arrivalMin) {
    $ships = array();
    $mix = array('fighter' => 90, 'light' => 40, 'hauler' => 20);
    $n = 0;
    foreach ($mix as $cls => $cnt) {
        for ($i = 0; $i < $cnt && $n < $fleetCount; $i++, $n++) {
            $hp = battle_class_hp($cls);
            $ships[] = array('id' => 'F' . $n, 'cls' => $cls, 'hp' => $hp, 'maxHp' => $hp,
                             'alive' => true, 'killedAt' => null);
        }
    }
    $pirates = array();
    for ($i = 0; $i < $pirateCount; $i++) {
        $pirates[] = array('id' => 'P' . $i, 'hp' => BATTLE_PIRATE_HP, 'maxHp' => BATTLE_PIRATE_HP,
                           'alive' => true, 'killedAt' => null);
    }
    return array(
        'id' => $id,
        'minute' => 0,
        'arrivalMin' => $arrivalMin,
        'scanMin' => BATTLE_SCAN_MIN,
        'ships' => $ships,
        'pirates' => $pirates,
        'events' => array(),
        'phase' => 'перелёт',
        'createdAt' => time()
    );
}

function battle_phase($b) {
    if ($b['minute'] < $b['arrivalMin']) return 'перелёт';
    if ($b['minute'] < $b['arrivalMin'] + $b['scanMin']) return 'сканирование';
    $alive = 0;
    foreach ($b['pirates'] as $p) { if ($p['alive']) $alive++; }
    return $alive > 0 ? 'бой' : 'уничтожены';
}

// Продвинуть бой на $minutes игровых минут (не больше 60 за вызов)
function battle_advance($b, $minutes) {
    $minutes = max(0, min(60, (int)$minutes));
    for ($step = 0; $step < $minutes; $step++) {
        $b['minute']++;
        $combat = $b['minute'] >= $b['arrivalMin'] + $b['scanMin'];
        if (!$combat) continue;

        $aliveFleet = 0; $alivePirates = 0;
        foreach ($b['ships'] as $s) { if ($s['alive']) $aliveFleet++; }
        foreach ($b['pirates'] as $p) { if ($p['alive']) $alivePirates++; }
        if ($alivePirates === 0 || $aliveFleet === 0) continue;

        $dmgToPirates = $aliveFleet * BATTLE_FLEET_DPS;
        $dmgToFleet = $alivePirates * BATTLE_PIRATE_DPS;
        $perShip = $dmgToFleet / max(1, $aliveFleet);

        foreach ($b['ships'] as $i => $s) {
            if (!$s['alive']) continue;
            $hp = $s['hp'] - $perShip;
            if ($hp <= 0) {
                $b['ships'][$i]['alive'] = false;
                $b['ships'][$i]['hp'] = 0;
                $b['ships'][$i]['killedAt'] = $b['minute'];
                $b['events'][] = array('t' => $b['minute'], 'what' => 'потерян ' . $s['cls'] . ' ' . $s['id']);
            } else {
                $b['ships'][$i]['hp'] = $hp;
            }
        }

        // урон пиратам: снимаем с живых по очереди
        $left = $dmgToPirates;
        foreach ($b['pirates'] as $i => $p) {
            if ($left <= 0) break;
            if (!$p['alive']) continue;
            $take = min($left, $p['hp']);
            $b['pirates'][$i]['hp'] -= $take;
            $left -= $take;
            if ($b['pirates'][$i]['hp'] <= 0) {
                $b['pirates'][$i]['alive'] = false;
                $b['pirates'][$i]['hp'] = 0;
                $b['pirates'][$i]['killedAt'] = $b['minute'];
                $b['events'][] = array('t' => $b['minute'], 'what' => 'уничтожен пират ' . $p['id']);
            }
        }
        if (count($b['events']) > 400) $b['events'] = array_slice($b['events'], -400);
    }
    $b['phase'] = battle_phase($b);
    return $b;
}

function battle_summary($b) {
    $byClass = array('fighter' => 0, 'light' => 0, 'hauler' => 0);
    $lost = 0;
    foreach ($b['ships'] as $s) {
        if ($s['alive']) $byClass[$s['cls']]++;
        else $lost++;
    }
    $piratesAlive = 0; $killed = 0;
    foreach ($b['pirates'] as $p) {
        if ($p['alive']) $piratesAlive++; else $killed++;
    }
    return array(
        'minute' => $b['minute'],
        'phase' => $b['phase'],
        'fleet' => count($b['ships']) - $lost,
        'fleetLost' => $lost,
        'byClass' => $byClass,
        'pirates' => $piratesAlive,
        'killed' => $killed,
        'arrivalMin' => $b['arrivalMin'],
        'scanMin' => $b['scanMin']
    );
}
