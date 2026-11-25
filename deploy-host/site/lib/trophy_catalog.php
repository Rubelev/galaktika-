<?php
// TROPHY_CATALOG.PHP — загрузчик контента трофеев.
// Данные лежат в trophy_catalog.json (24 предмета, 4 сета, числа), чтобы контент
// правился без правки кода. Кэш — в $GLOBALS['TROPHY_CATALOG'].
$__tc_file = __DIR__ . '/trophy_catalog.json';
$__tc_raw = @file_get_contents($__tc_file);
$__tc = $__tc_raw ? json_decode($__tc_raw, true) : null;
if (!is_array($__tc)) {
    $__tc = array('sets' => array(), 'items' => array());
}
$__tc_defaults = array('drop_pct' => 20, 'pity' => 10, 'daily_rolls' => 5,
                       'craft_cost' => 5, 'set_bonus' => 0.02, 'bonus_cap' => 0.06);
foreach ($__tc_defaults as $__tc_k => $__tc_v) {
    if (!isset($__tc[$__tc_k])) $__tc[$__tc_k] = $__tc_v;
}
if (!isset($__tc['sets']) || !is_array($__tc['sets'])) $__tc['sets'] = array();
if (!isset($__tc['items']) || !is_array($__tc['items'])) $__tc['items'] = array();
$GLOBALS['TROPHY_CATALOG'] = $__tc;
unset($__tc_file, $__tc_raw, $__tc, $__tc_defaults, $__tc_k, $__tc_v);
