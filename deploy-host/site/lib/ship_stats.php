<?php
// ============================================================================
//  SHIP_STATS.PHP — ЕДИНЫЙ ИСТОЧНИК характеристик кораблей (C-08/C-10).
//  СГЕНЕРИРОВАНО: tools/make_ship_stats.js из клиентской таблицы SHIPS
//  (src/galaktika.Web/wwwroot/js/solar.js). Руками не править — правка
//  откатится при следующей генерации; меняйте SHIPS и перегенерируйте.
//
//  ДВЕ ШКАЛЫ, ОДИН ИСТОЧНИК (решение владельца: не сводить, C-08):
//    SHIP_STATS        — карточка/цена/витрина: hp (=hull) 40…620, dmg (сумма guns.d),
//                        speed, price 18 000…320 000. Это клиентская шкала.
//    SHIP_COMBAT_STATS — боевая арена: hull 900…12 000, shield, armor/evade/energy/slots.
//                        ОТДЕЛЬНАЯ боевая шкала, не «hp»: отношение к карточке 13.3×…22.5×.
//    BATTLE_CLASS_HP   — живой бой: 3 класса движения (fighter 40, light 30, hauler 20).
//  Сводить арену и карточку в одну величину — отдельное решение владельца баланса,
//  в C-08 сознательно НЕ делалось (это изменило бы исходы боёв).
//  Имена серверных моделей = имена в SHIPS (C-10), id не менялись.
// ============================================================================

const SHIP_STATS_SOURCE = 'solar.js SHIPS sha256:b4a5c4b5511abe6aed9c4b5a4f354c3854deaafa19b01c8350f66af6b04b046d';
const SHIP_STATS_GENERATED = '2026-11-08T21:04:35Z';

const SHIP_STATS = array('jet_scout' => array('name' => '«Искра»', 'hp' => 40, 'shield' => 10, 'dmg' => 6, 'speed' => 2.4, 'price' => 18000, 'guns' => 1, 'parts' => array('steel' => 60, 'copper' => 20, 'nickel' => 10, 'silver' => 2, 'gold' => 1, 'chips' => 8)), 'jet_hauler' => array('name' => '«Баржа»', 'hp' => 90, 'shield' => 15, 'dmg' => 4, 'speed' => 1.2, 'price' => 26000, 'guns' => 1, 'parts' => array('steel' => 120, 'copper' => 40, 'nickel' => 25, 'silver' => 4, 'gold' => 1, 'chips' => 14, 'boards' => 20, 'manip' => 4)), 'ion_courier' => array('name' => '«Стриж»', 'hp' => 55, 'shield' => 25, 'dmg' => 8, 'speed' => 3, 'price' => 34000, 'guns' => 1, 'parts' => array('steel' => 80, 'copper' => 30, 'nickel' => 15, 'silver' => 3, 'gold' => 2, 'chips' => 20, 'boards' => 26, 'manip' => 3)), 'ion_corsair' => array('name' => 'Корсар «Вольный»', 'hp' => 120, 'shield' => 50, 'dmg' => 12, 'speed' => 3, 'price' => 75000, 'guns' => 1, 'parts' => array('steel' => 120, 'copper' => 36, 'nickel' => 18, 'silver' => 3, 'gold' => 1, 'chips' => 14, 'boards' => 16, 'manip' => 3)), 'ion_prospector' => array('name' => '«Старатель»', 'hp' => 110, 'shield' => 20, 'dmg' => 12, 'speed' => 1.4, 'price' => 42000, 'guns' => 2, 'parts' => array('steel' => 140, 'copper' => 60, 'nickel' => 35, 'silver' => 6, 'gold' => 2, 'chips' => 18, 'boards' => 24, 'manip' => 6)), 'plasma_interceptor' => array('name' => '«Клинок»', 'hp' => 70, 'shield' => 40, 'dmg' => 28, 'speed' => 4.2, 'price' => 58000, 'guns' => 2, 'parts' => array('steel' => 110, 'copper' => 45, 'nickel' => 30, 'silver' => 8, 'gold' => 3, 'chips' => 30, 'boards' => 34, 'manip' => 5)), 'plasma_lancer' => array('name' => '«Копьё»', 'hp' => 130, 'shield' => 60, 'dmg' => 42, 'speed' => 3.4, 'price' => 92000, 'guns' => 2, 'parts' => array('steel' => 200, 'copper' => 80, 'nickel' => 50, 'silver' => 14, 'gold' => 5, 'chips' => 44, 'boards' => 48, 'manip' => 8)), 'grav_frigate' => array('name' => '«Щит»', 'hp' => 260, 'shield' => 120, 'dmg' => 36, 'speed' => 2.2, 'price' => 130000, 'guns' => 2, 'parts' => array('steel' => 320, 'copper' => 120, 'nickel' => 80, 'silver' => 24, 'gold' => 8, 'chips' => 70, 'boards' => 76, 'manip' => 14)), 'grav_colossus' => array('name' => '«Молот»', 'hp' => 620, 'shield' => 260, 'dmg' => 98, 'speed' => 1.6, 'price' => 320000, 'guns' => 3, 'parts' => array('steel' => 900, 'copper' => 300, 'nickel' => 200, 'silver' => 60, 'gold' => 20, 'chips' => 160, 'boards' => 180, 'manip' => 30)));

const SHIP_COMBAT_STATS = array('jet_scout' => array('name' => '«Искра»', 'hull' => 900, 'shield' => 300, 'armor' => 0.1, 'evade' => 0.25, 'energy' => 60, 'slots' => 1), 'jet_hauler' => array('name' => '«Баржа»', 'hull' => 1800, 'shield' => 200, 'armor' => 0.2, 'evade' => 0.05, 'energy' => 70, 'slots' => 1), 'ion_courier' => array('name' => '«Стриж»', 'hull' => 1200, 'shield' => 500, 'armor' => 0.15, 'evade' => 0.18, 'energy' => 80, 'slots' => 2), 'ion_corsair' => array('name' => 'Корсар «Вольный»', 'hull' => 1600, 'shield' => 700, 'armor' => 0.2, 'evade' => 0.15, 'energy' => 100, 'slots' => 2), 'ion_prospector' => array('name' => '«Старатель»', 'hull' => 2000, 'shield' => 400, 'armor' => 0.3, 'evade' => 0.05, 'energy' => 90, 'slots' => 1), 'plasma_interceptor' => array('name' => '«Клинок»', 'hull' => 1400, 'shield' => 800, 'armor' => 0.15, 'evade' => 0.3, 'energy' => 110, 'slots' => 2), 'plasma_lancer' => array('name' => '«Копьё»', 'hull' => 2200, 'shield' => 1100, 'armor' => 0.25, 'evade' => 0.12, 'energy' => 130, 'slots' => 3), 'grav_frigate' => array('name' => '«Щит»', 'hull' => 4200, 'shield' => 2000, 'armor' => 0.35, 'evade' => 0.08, 'energy' => 170, 'slots' => 4), 'grav_colossus' => array('name' => '«Молот»', 'hull' => 12000, 'shield' => 5500, 'armor' => 0.45, 'evade' => 0.02, 'energy' => 260, 'slots' => 5));

const BATTLE_CLASS_HP = array('fighter' => 40, 'light' => 30, 'hauler' => 20);

function ship_stat($id) { return isset(SHIP_STATS[$id]) ? SHIP_STATS[$id] : null; }
function ship_combat_stat($id) { return isset(SHIP_COMBAT_STATS[$id]) ? SHIP_COMBAT_STATS[$id] : null; }
function battle_class_hp($cls) { return isset(BATTLE_CLASS_HP[$cls]) ? BATTLE_CLASS_HP[$cls] : BATTLE_CLASS_HP['fighter']; }
