<?php
require_once __DIR__ . '/lib/orders_core.php';
require_once __DIR__ . '/lib/race_core.php';
require_once __DIR__ . '/lib/build_core.php';
require_once __DIR__ . '/lib/presence_core.php';
require_once __DIR__ . '/lib/food_core.php';
require_once __DIR__ . '/lib/civ_core.php';
require_once __DIR__ . '/lib/mob_core.php';
require_once __DIR__ . '/lib/engineer_core.php';
require_once __DIR__ . '/lib/food_market.php';
require_once __DIR__ . '/lib/world_econ.php';
require_once __DIR__ . '/lib/casino_core.php';
require_once __DIR__ . '/lib/casino_vegas.php';
require_once __DIR__ . '/lib/trophy_core.php';
require_once __DIR__ . '/lib/store.php';
require_once __DIR__ . '/lib/battle_core.php';
require_once __DIR__ . '/lib/ship_stats.php';
// ============================================================================
//  СВЯЗИ: что править вместе с этим файлом (api.php)
//  ---------------------------------------------------------------------------
//  Серверная логика игры. При правке констант проверь ВСЕ места:
//   1) Стоимость колонии 150 000 кр — фигурирует ТРИЖДЕ:
//      порог, списание, подсказка о нехватке (поиск по '150000').
//   2) clientlog_clear / clientlog/list — используются аудитом и errwatch.js.
//   3) res_name() — русские названия ресурсов, их ждут UI и агенты.
//   4) CORS + OPTIONS — иначе платежи и API молча падают в браузере.
//   5) После правки: php -l api.php, затем deploy-host/audit_all.py.
// ============================================================================


// Галактика — серверная часть для обычного хостинга (PHP 7.4+).
// Авторизация: /api/auth/login, /register, /me, /profile, /password, /health
// Оплата:       /api/pay/settings (GET публично, POST админ), /api/pay/order,
//               /api/pay/my, /api/pay/orders, /api/pay/status, /api/pay/ack
// Формат users.json и PBKDF2 совместимы с AuthStore.cs: PBKDF2-SHA256, 120000 итераций, 32 байта.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Зеркало .store обращается к тому же API (другой origin), поэтому разрешаем
// явный список доменов и предварительный запрос OPTIONS.
$__origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$__allowed = array('https://warbattleuniverse.store', 'https://www.warbattleuniverse.store',
                   'https://warbattleuniverse.com', 'https://www.warbattleuniverse.com',
                   'http://warbattleuniverse.store');
if ($__origin !== '' && in_array($__origin, $__allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $__origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$action = '';
if (preg_match('#/api/auth/([a-zA-Z_]+)#', $path, $m)) $action = $m[1];
elseif (preg_match('#/api/pay/([a-zA-Z]+)#', $path, $m)) $action = 'pay_' . $m[1];
elseif (strpos($path, '/api/health') === 0) $action = 'health';
if ($action === '' && isset($_GET['action'])) $action = $_GET['action'];

$docroot = __DIR__;
$candidates = array(dirname($docroot) . '/galaktika-data', $docroot . '/data');
$dataDir = null;
foreach ($candidates as $dir) {
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    if (is_dir($dir) && is_writable($dir)) { $dataDir = $dir; break; }
}
if ($dataDir === null) { http_response_code(500); echo json_encode(array('error' => 'нет каталога для данных')); exit; }

$usersFile    = $dataDir . '/users.json';
$tokensFile   = $dataDir . '/tokens.json';
$settingsFile = $dataDir . '/pay-settings.json';
$ordersFile   = $dataDir . '/pay-orders.json';
$marketFile   = $dataDir . '/market.json';
$ranksFile    = $dataDir . '/ranks.json';
$npcFile      = $dataDir . '/npc-market.json';
$walletFile   = $dataDir . '/wallet.json';
$chatFile     = $dataDir . '/chat.json';
$worldsFile    = $dataDir . '/worlds.json';
$feedbackFile  = $dataDir . '/feedback.json';
$clientErrFile = $dataDir . '/client-errors.json';
$pirateFile    = $dataDir . '/pirate-market.json';
$trophiesFile  = $dataDir . '/trophies.json';   // TZ-261108-02: коллекция трофеев, ключ — e-mail

function json_out($code, $payload) { http_response_code($code); echo json_encode($payload, JSON_UNESCAPED_UNICODE); exit; }

function load_json($file, $default) {
    // ЭТАП 1 ШАРДИНГА: профили живут в SQLite; при пустой базе — импорт из JSON.
    // ЭТАП 1 ШАРДИНГА: остальные состояния тоже в SQLite (таблица docs).
    // JSON остаётся снимком, поэтому внешние скрипты и аудит продолжают работать.
    $name0 = basename($file);
    $docNames = array('presence.json','market.json','chat.json','ship-orders.json','builds.json',
        'scenes.json','battles.json','ranks.json','wallet.json','feedback.json','npc-market.json',
        'pay-orders.json','pay-settings.json','worlds.json','client-errors.json');
    if (store_available() && in_array($name0, $docNames, true)) {
        $name = $name0;
        if ($name !== 'users.json') {
            $fromDb = store_doc_load($name, null);
            if ($fromDb !== null) return $fromDb;
            // первый запуск: импортируем из JSON и запоминаем в базе
            if (file_exists($file)) {
                $raw0 = @file_get_contents($file);
                $dec0 = $raw0 ? json_decode($raw0, true) : null;
                if (is_array($dec0)) { store_doc_save($name, $dec0); return $dec0; }
            }
            return $default;
        }
    }
    if (basename($file) === 'users.json' && store_available()) {
        $json = array();
        if (file_exists($file)) {
            $raw = @file_get_contents($file);
            $decoded = $raw ? json_decode($raw, true) : null;
            if (is_array($decoded)) $json = $decoded;
        }
        $db = store_users_load(array());
        if (!$db && $json) { store_import($json); $db = store_users_load(array()); }
        if ($db) return $db;
        return $json ?: $default;
    }
    if (!file_exists($file)) return $default;
    $raw = @file_get_contents($file);
    if ($raw === false || trim($raw) === '') return $default;
    if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

function save_json($file, $data) {
    // профили — сначала в SQLite (истина), затем как раньше JSON-снимок
    $name1 = basename($file);
    $docNames1 = array('presence.json','market.json','chat.json','ship-orders.json','builds.json',
        'scenes.json','battles.json','ranks.json','wallet.json','feedback.json','npc-market.json',
        'pay-orders.json','pay-settings.json','worlds.json','client-errors.json');
    // ВАЖНО: users.json не входит в $docNames1, поэтому проверяем его отдельно.
    // Без этой ветки регистрация новых игроков не сохранялась: JSON перезаписывался
    // из базы при следующем запросе, и аккаунт исчезал.
    if (basename($file) === 'users.json' && store_available()) {
        store_users_save($data);
    } else if (store_available() && in_array($name1, $docNames1, true)) {
        store_doc_save($name1, $data);
    }
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    @rename($tmp, $file);
}





// ---------------- Кошелёк: защита от подмены ----------------
// Сервер помнит последние известные деньги и ресурсы и не даёт клиенту «дописать» их сверх
// разумного прироста за прошедшее время. Траты не ограничиваются.
function wallet_load($file) { return load_json($file, array()); }

function wallet_guard($file, $email, $prevProfile, &$newProfile) {
    $wallet = wallet_load($file);
    $key = norm($email);
    $known = isset($wallet[$key]) ? $wallet[$key] : null;

    $prevCredits = isset($prevProfile['credits']) ? (float)$prevProfile['credits'] : 0;
    if ($known && isset($known['credits'])) $prevCredits = max($prevCredits, (float)$known['credits']);
    $ts = $known && isset($known['ts']) ? (int)$known['ts'] : time();
    $hours = max(0.05, (time() - $ts) / 3600.0);

    $anomaly = array();
    $newCredits = isset($newProfile['credits']) ? (float)$newProfile['credits'] : 0;
    $maxGain = 5000000 * $hours;
    if ($newCredits - $prevCredits > $maxGain) {
        $newProfile['credits'] = $prevCredits + $maxGain;
        $anomaly[] = 'credits';
    }

    $prevRes = isset($prevProfile['resources']) && is_array($prevProfile['resources']) ? $prevProfile['resources'] : array();
    if ($known && isset($known['resources']) && is_array($known['resources'])) {
        foreach ($known['resources'] as $k => $v) {
            if (!isset($prevRes[$k]) || (float)$prevRes[$k] < (float)$v) $prevRes[$k] = (float)$v;
        }
    }
    $newRes = isset($newProfile['resources']) && is_array($newProfile['resources']) ? $newProfile['resources'] : array();
    foreach ($newRes as $k => $v) {
        $before = isset($prevRes[$k]) ? (float)$prevRes[$k] : 0;
        $maxRes = 1000000 * $hours;
        if ((float)$v - $before > $maxRes) {
            $newRes[$k] = $before + $maxRes;
            $anomaly[] = 'res:' . $k;
        }
    }
    $newProfile['resources'] = $newRes;

    $wallet[$key] = array(
        'credits' => isset($newProfile['credits']) ? (float)$newProfile['credits'] : 0,
        'resources' => $newRes,
        'ts' => time(),
    );
    save_json($file, $wallet);
    return $anomaly;
}
// ---------------- Колония (расчёт на сервере) ----------------
function colony_defaults() {
    return array(
        'world' => 'kepler', 'name' => 'Новый Кеплер',
        'stage' => 'moon',   // moon → planet → elevator
        'founded' => time(), 'lastTick' => time(),
        'population' => 50000, 'happiness' => 70, 'taxRate' => 0.10,
        'taxCollected' => 0, 'daysLived' => 0,
        'defense' => 0, 'raids' => 0, 'lastRaid' => time(), 'nextRaidIn' => 0, 'lastReport' => null,
    );
}

// Продвигает колонию на days суток; ресурсы списываются из профиля.
function colony_step(&$profile, $days) {
    $out = array('credits' => 0, 'foodShort' => 0, 'waterShort' => 0, 'deficit' => 0, 'died' => 0);
    if (!isset($profile['colony']) || !is_array($profile['colony'])) return $out;
    $c = &$profile['colony'];
    $days = min(max(0.0000001, (float)$days), 30);
    if ((float)$c['population'] <= 0) return $out;
    if (!isset($profile['resources']) || !is_array($profile['resources'])) $profile['resources'] = array();

    // агрокомплекс: каждый уровень кормит 250 000 жителей без Земли
    $agroLevel = isset($profile['factories']['agro']) ? (int)$profile['factories']['agro'] : 0;
    $agroCapacity = $agroLevel * 250000;
    $autonomy = !empty($c['autonomy']);
    if ($autonomy && (float)$c['population'] > $agroCapacity) {
        // населения больше, чем может прокормить комплекс — автономия падает
        $autonomy = false;
        $c['autonomy'] = false;
        $out['autonomyLost'] = true;
    }
    if ($autonomy) {
        $c['happiness'] = min(100, (float)$c['happiness'] + 0.5 * $days);
    }

    $foodNeed = (float)$c['population'] * 0.3 * $days;
    $waterNeed = (float)$c['population'] * 0.003 * $days;

    // ЗАВОД ЕДЫ: сначала кормят заводы (наука), остаток — зерном
    $foodPlan = null;
    if (!empty($c['food_factories'])) {
        $creditsAvail = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $foodPlan = food_plan((float)$c['population'], $c['food_factories'], $creditsAvail,
                              isset($profile['resources']) ? $profile['resources'] : array(), $days);
        if ($foodPlan['produced_kg'] > 0) {
            $foodNeed = max(0, $foodNeed - $foodPlan['produced_kg']);
            if (isset($profile['credits'])) $profile['credits'] -= $foodPlan['energy_cost'];
            if (isset($profile['resources']['water'])) {
                $profile['resources']['water'] = max(0, $profile['resources']['water'] - $foodPlan['water_needed']);
            }
            // сырьё завода: метан и азот со склада (input_* из food_factory);
            // чего не хватило на складе — уже оплачено кредитами в energy_cost,
            // план помечен resource_limited
            $rawTake = food_raw_take($profile['resources'], array(
                'methane' => $foodPlan['methane_need_kg'],
                'nitrogen' => $foodPlan['nitrogen_kg']
            ));
            $out['foodFactory'] = array(
                'produced_kg' => $foodPlan['produced_kg'],
                'fed_people' => $foodPlan['fed_people'],
                'energy_cost' => $foodPlan['energy_cost'],
                'credit_limited' => $foodPlan['credit_limited'],
                'water_limited' => $foodPlan['water_limited'],
                'raw_used_kg' => array('methane' => round($rawTake['used_kg']['methane'], 2),
                                       'nitrogen' => round($rawTake['used_kg']['nitrogen'], 2)),
                'raw_short_kg' => array('methane' => round($rawTake['short_kg']['methane'], 2),
                                        'nitrogen' => round($rawTake['short_kg']['nitrogen'], 2)),
                'resource_limited' => $rawTake['limited']
            );
        }
    }
    // гидропоника: −30 % зерна; рециклинг: −40 % воды
    if (!empty($c['upgrades']['hydro'])) $foodNeed *= 0.7;
    if (!empty($c['upgrades']['recycle'])) $waterNeed *= 0.6;
    if ($autonomy) { $foodNeed = 0; $waterNeed = 0; }
    // ЕДА (G-05/G-06): база по цене (зерно 4 → синтетика 8–15), затем «эдакое» —
    // деликатесы долей от достатка (кр/чел). Деликатес — последняя линия при голоде.
    // Для аккаунта без food_* результат прежний: всю потребность закрывает зерно.
    $eat = food_feed_population($profile['resources'], $foodNeed,
                                isset($profile['credits']) ? (float)$profile['credits'] : 0,
                                (float)$c['population']);
    $out['foodEatenFromStock'] = round($eat['from_stock_kg'], 2);
    $out['foodEatenFromGrain'] = round($eat['from_grain_kg'], 2);
    $out['foodEatenCost'] = round($eat['cost_total'], 2);
    $out['luxShare'] = $eat['lux_share'];
    $out['luxuryKg'] = round($eat['lux_kg'], 2);
    $out['luxuryCost'] = round($eat['lux_cost'], 2);
    $out['luxActualShare'] = round($eat['lux_share_actual'], 4);
    $out['luxuryShort'] = round($eat['luxury_short_kg'], 2);
    if (!empty($eat['by'])) {
        // по каждому виду: сколько кг и на какую сумму — чтобы потеря не была молчаливой
        $eatBy = array();
        foreach ($eat['by'] as $ek => $erow) {
            $eatBy[$ek] = array('kg' => round($erow['kg'], 2), 'price' => $erow['price'],
                                'cost' => round($erow['cost'], 2));
        }
        $out['foodEatenBy'] = $eatBy;
    }
    $water = isset($profile['resources']['water']) ? max(0, (float)$profile['resources']['water']) : 0;
    $waterGot = min($water, $waterNeed);
    $profile['resources']['water'] = $water - $waterGot;

    $out['foodShort'] = $foodNeed > 0 ? $eat['short_kg'] / $foodNeed : 0;
    $out['waterShort'] = $waterNeed > 0 ? 1 - $waterGot / $waterNeed : 0;
    $out['deficit'] = max($out['foodShort'], $out['waterShort']);

    if ($out['deficit'] > 0.001) {
        $c['happiness'] -= 10 * $out['deficit'] * $days;
    } else {
        $c['happiness'] += 1.0 * $days;   // быстрее выходим из голода
    }
    // «эдакое»: довольство деликатесами, если их доля в рационе ≥20 % и колония не голодает
    $luxHappy = ($out['deficit'] > 0.001) ? 0.0 : food_lux_happy_bonus($eat['lux_share_actual'], $days);
    if ($luxHappy > 0) {
        $c['happiness'] += $luxHappy;
        $out['luxHappy'] = round($luxHappy, 2);
    }
    // театр: культурная программа даёт +1.5 счастья в сутки и требует воды на содержание
    if (!empty($c['theatre'])) {
        $c['happiness'] += 1.5 * $days;
        $theatreWater = (float)$c['population'] * 0.0003 * $days;
        $wNow = isset($profile['resources']['water']) ? max(0, (float)$profile['resources']['water']) : 0;
        $profile['resources']['water'] = max(0, $wNow - $theatreWater);
        $out['theatreWater'] = $theatreWater;
    }
    // РАЗВЛЕЧЕНИЯ: стадион, гоночная трасса, парк — постоянный прирост счастья.
    // Работают только при наличии еды и воды (голодная колония не веселится).
    $funTable = array('stadium' => 1.2, 'raceway' => 1.5, 'park' => 0.9);
    $funBonus = 0;
    foreach ($funTable as $fk => $fval) {
        if (!empty($profile['factories'][$fk])) $funBonus += $fval;
    }
    if ($funBonus > 0 && $out['deficit'] <= 0.001) {
        $c['happiness'] += $funBonus * $days;
        $out['funBonus'] = $funBonus;
    }
    // жадность наказывается: каждый процент ставки выше 15% съедает 0.1 счастья в день
    $taxPct = (float)$c['taxRate'] * 100;
    if ($taxPct > 15) {
        $c['happiness'] -= ($taxPct - 15) * 0.1 * $days;
    }
    $c['happiness'] = max(0, min(100, $c['happiness']));

        // бонусы переселенцев: земляне ускоряют рост, астровитяне — налоги
    $earthC = isset($profile['colonists']['earth']) ? (int)$profile['colonists']['earth'] : 0;
    $astralC = isset($profile['colonists']['astral']) ? (int)$profile['colonists']['astral'] : 0;
    $earthBonus = min(0.5, $earthC / 100000 * 0.5);
    $astralBonus = min(0.4, $astralC / 100000 * 0.4);
    // прогрессивная ставка: 12 кр с человека + 0,001 за каждого жителя, не выше 30
    $popForTax = (float)$c['population'];
    $taxCoef = min(30, 12 + $popForTax * 0.001);
    $premiereBonus = 1;
    if (isset($c['premiereUntil']) && (int)$c['premiereUntil'] > $now) $premiereBonus = 1.01;
    $out['taxCoef'] = $taxCoef;
    // F-03: бонус коллекции трофеев — +2 % за собранный сет, максимум +6 % к налогу.
    // Источник — trophies.json игрока и фактические предметы (а не запись sets).
    $trophyBonus = 1.0;
    if (function_exists('trophy_bonus_from_items')) {
        $tkey = isset($profile['email']) ? norm($profile['email']) : '';
        $meG = isset($GLOBALS['me']) ? $GLOBALS['me'] : null;
        if ($tkey === '' && $meG) $tkey = norm($meG['Email']);
        if ($tkey !== '') {
            // Внутри функции глобальные пути недоступны — берём через $GLOBALS,
            // иначе PHP печатает warning перед JSON и ответ ломается.
            $tfile = isset($GLOBALS['trophiesFile']) && $GLOBALS['trophiesFile']
                ? $GLOBALS['trophiesFile']
                : (rtrim((string)($GLOBALS['dataDir'] ?? ''), '/') . '/trophies.json');
            $tall = load_json($tfile, array());
            $tstate = isset($tall[$tkey]) && is_array($tall[$tkey]) ? $tall[$tkey] : array('items' => array());
            $tb = trophy_bonus_from_items($tstate);
            $trophyBonus = 1 + (float)$tb['bonus'];
        }
    }
    $out['trophyBonus'] = round($trophyBonus - 1, 4);
    $out['credits'] = $popForTax * (float)$c['taxRate'] * $taxCoef * $days * (1 + $astralBonus) * $premiereBonus * $trophyBonus;
    $c['taxCollected'] = (isset($c['taxCollected']) ? (float)$c['taxCollected'] : 0) + $out['credits'];

    $rate = 0.01;   // 1% в день, довольные — вдвое быстрее
    $rate *= (1 + $earthBonus);
    if ($c['happiness'] > 70) $rate *= 2;
    if ($out['deficit'] > 0.3) $rate = -0.10 * $out['deficit'];

    $before = (float)$c['population'];
    if (!isset($c['peak']) || (float)$c['peak'] < $before) $c['peak'] = $before;
    $habitat = isset($c['habitat']) ? (int)$c['habitat'] : 0;
    $stageCap = colony_stage_cap(isset($c['stage']) ? $c['stage'] : 'moon') + $habitat * 50000;
    $c['population'] = max(0, min($stageCap, $before * exp($rate * $days)));   // экспонента: не обнуляет при большом шаге
    // волны переселенцев: удержание месяц, два, три даёт заметный скачок
    $livedBefore = isset($c['daysLived']) ? (float)$c['daysLived'] : 0;
    $livedAfter = $livedBefore + $days;
    foreach (array(30, 60, 90) as $milestone) {
        if ($livedBefore < $milestone && $livedAfter >= $milestone) {
            $c['population'] = min(5000000, (float)$c['population'] * 1.5);
            $out['wave'] = $milestone;
        }
    }
    $out['died'] = max(0, $before - $c['population']);
    $c['daysLived'] = (isset($c['daysLived']) ? (float)$c['daysLived'] : 0) + $days;

    // содержание инфраструктуры: чем больше народу, тем дороже (квадратично)
    $upkeep = pow((float)$c['population'], 2) * 0.000001 * $days;
    // энергия (газ, мегапроекты, аванпосты) снижает содержание до 20%
    $energyStored = isset($profile['energy']) ? (int)$profile['energy'] : 0;
    $energyDiscount = min(0.2, $energyStored / 25000);   // 5 000 энергии = 20%
    $upkeep *= (1 - $energyDiscount);
    $out['energyDiscount'] = round($energyDiscount, 3);
    if ($autonomy) $upkeep *= 0.75;   // своё производство дешевле земного снабжения
    $out['upkeep'] = round($upkeep);
    $net = $out['credits'] - $upkeep;
    if ($net < 0) {
        // инфраструктура не справляется: счастье падает, кредиты не уходят в минус
        $c['happiness'] = max(0, (float)$c['happiness'] - 2 * $days);
        $net = 0;
    }
    // аванпосты на других лунах и газовый завод дают доход и энергию
    $outposts = isset($profile['outposts']) && is_array($profile['outposts']) ? count($profile['outposts']) : 0;
    $gas = isset($profile['gasPlant']) && is_array($profile['gasPlant']) ? (int)$profile['gasPlant']['level'] : 0;
    $passive = $outposts * 2500 + $gas * 8000;
    $energy = $outposts * 2 + $gas * 10;
    // мегапроекты: станция, терраформирование, кольцо Дайсона
    $mega = isset($profile['megaprojects']) && is_array($profile['megaprojects']) ? $profile['megaprojects'] : array();
    if (!empty($mega['orbital']))   { $passive += 25000;   $energy += 30; }
    if (!empty($mega['terraform'])) { $passive += 100000;  $energy += 50; }
    if (!empty($mega['dyson']))     { $passive += 2000000; $energy += 500; }
    $out['passive'] = $passive;
    $out['energy'] = $energy;
    $net += $passive * $days;
    if ($energy > 0) {
        $profile['energy'] = (isset($profile['energy']) ? (int)$profile['energy'] : 0) + (int)($energy * $days);
    }
    if ($net > 0) {
        $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $net;
    }
    // ---- налёт пиратов ----
    $now = time();
    $nextIn = isset($c['nextRaidIn']) ? (int)$c['nextRaidIn'] : 0;
    if ($nextIn <= 0) { $nextIn = mt_rand(8, 20) * 3600; $c['nextRaidIn'] = $nextIn; }
    $lastRaid = isset($c['lastRaid']) ? (int)$c['lastRaid'] : $now;
    if ($now - $lastRaid >= $nextIn && (float)$c['population'] > 0) {
        $raids = isset($c['raids']) ? (int)$c['raids'] : 0;
        // сила рейда растёт, но не бесконечно: потолок 8
        $strength = min(8, mt_rand(1, 3) + intdiv($raids, 3));
        // наёмный патруль добавляет обороны на один рейд
        $patrol = isset($c['patrol']) ? (int)$c['patrol'] : 0;
        $defense = (isset($c['defense']) ? (int)$c['defense'] : 0) + $patrol;
        if ($patrol > 0) { $c['patrol'] = 0; }
        if ($defense >= $strength) {
            $c['happiness'] = min(100, (float)$c['happiness'] + 2);
            $report = array('result' => 'repelled', 'strength' => $strength, 'defense' => $defense, 'losses' => 0, 'stolen' => array());
        } else {
            $dead = (float)$c['population'] * (($strength - $defense) * 0.02);
            $c['population'] = max(0, (float)$c['population'] - $dead);
            $c['happiness'] = max(0, (float)$c['happiness'] - 5);
            $stolen = array();
            foreach (array('grain', 'water') as $res) {
                if (!isset($profile['resources'][$res])) continue;
                $amount = (float)$profile['resources'][$res] * 0.15;
                $profile['resources'][$res] = (float)$profile['resources'][$res] - $amount;
                $stolen[$res] = round($amount);
            }
            // добыча рейда попадает на пиратский рынок (60 % цены NPC)
            if (!empty($stolen)) {
                $pirate = load_json($pirateFile, array('lots' => array()));
                if (!isset($pirate['lots'])) $pirate['lots'] = array();
                foreach ($stolen as $res => $qty) {
                    if ($qty <= 0) continue;
                    $pirate['lots'][] = array(
                        'id' => bin2hex(random_bytes(4)),
                        'resource' => $res,
                        'qty' => (int)$qty,
                        'price' => $res === 'grain' ? 3.6 : 4.5,   // 60 % от NPC
                        'from' => isset($c['name']) ? $c['name'] : 'колония',
                        'ts' => $now,
                    );
                }
                save_json($pirateFile, $pirate);
            }
            $report = array('result' => 'raided', 'strength' => $strength, 'defense' => $defense, 'losses' => round($dead), 'stolen' => $stolen);
        }
        $c['raids'] = $raids + 1;
        $c['lastRaid'] = $now;
        $c['nextRaidIn'] = mt_rand(8, 20) * 3600;
        $c['lastReport'] = $report;
        $out['raid'] = $report;
    }

    return $out;
}
// ---------------- NPC-рынок (общий, на сервере) ----------------
function npc_goods() {
    return array(
        'grain' => array('base' => 4, 'norm' => 400000),
        'water' => array('base' => 7, 'norm' => 200000),
        'ice' => array('base' => 3, 'norm' => 150000),
        'steel' => array('base' => 12, 'norm' => 120000),
        'quartz' => array('base' => 30, 'norm' => 60000),
        'polymer' => array('base' => 25, 'norm' => 80000),
        // Детали для первого корабля: без них обучение упиралось в тупик —
        // в списке были только зерно, вода, лёд, сталь, кварц и полимер.
        'copper' => array('base' => 18, 'norm' => 90000),
        'nickel' => array('base' => 22, 'norm' => 80000),
        'silver' => array('base' => 60, 'norm' => 40000),
        'gold' => array('base' => 180, 'norm' => 20000),
        'chips' => array('base' => 45, 'norm' => 30000),
        'boards' => array('base' => 30, 'norm' => 50000),
        'manip' => array('base' => 120, 'norm' => 15000),
    );
}

function npc_state($file) {
    $state = load_json($file, array());
    $goods = npc_goods();
    if (!isset($state['stock']) || !is_array($state['stock'])) {
        $state = array('stock' => array(), 'updated' => time());
        foreach ($goods as $k => $g) { $state['stock'][$k] = $g['norm']; }
        return $state;
    }
    $hours = (time() - (isset($state['updated']) ? (int)$state['updated'] : time())) / 3600.0;
    if ($hours > 0) {
        $hours = min($hours, 72);
        foreach ($goods as $k => $g) {
            $cur = isset($state['stock'][$k]) ? (float)$state['stock'][$k] : $g['norm'];
            $cur += $g['norm'] * 0.004 * $hours - $g['norm'] * 0.0038 * $hours;
            $state['stock'][$k] = max(0, min($g['norm'] * 3, $cur));
        }
        $state['updated'] = time();
    }
    return $state;
}

function npc_price($state, $key) {
    $goods = npc_goods();
    if (!isset($goods[$key])) return 0;
    $g = $goods[$key];
    $s = isset($state['stock'][$key]) ? (float)$state['stock'][$key] : $g['norm'];
    $factor = 1 + 1.5 * (1 - $s / $g['norm']);
    $factor = max(0.5, min(2.5, $factor));
    return $g['base'] * $factor;
}
// ---------------- Звания ----------------

// ---------------- Достижения ----------------
function ach_defs() {
    return array(
        'first_colony'  => array('title' => 'Первая база на луне', 'cond' => 'colony',   'credits' => 30000,  'crystals' => 1),
        'pop_100k'      => array('title' => 'Сто тысяч под куполом', 'cond' => 'pop100k', 'credits' => 50000,  'crystals' => 2),
        'pop_500k'      => array('title' => 'Полмиллиона', 'cond' => 'pop500k',          'credits' => 150000, 'crystals' => 3),
        'to_planet'     => array('title' => 'Спуск на планету', 'cond' => 'planet',      'credits' => 100000, 'crystals' => 2),
        'elevator'      => array('title' => 'Гравитационный лифт', 'cond' => 'elevator', 'credits' => 300000, 'crystals' => 5),
        'fleet_5'       => array('title' => 'Пять вымпелов', 'cond' => 'ships5',         'credits' => 60000,  'crystals' => 1),
        'workshops_2'   => array('title' => 'Своя ремонтная база', 'cond' => 'workshops2', 'credits' => 40000, 'crystals' => 1),
        'settlers_1k'   => array('title' => 'Тысяча переселенцев', 'cond' => 'colonists1k', 'credits' => 50000, 'crystals' => 1),
        'autonomy_on'   => array('title' => 'Жизнь без Земли', 'cond' => 'autonomy',      'credits' => 80000,  'crystals' => 2),
        'raid_repelled' => array('title' => 'Налёт отбит', 'cond' => 'raid_repelled',     'credits' => 40000,  'crystals' => 1),
        'inherited'     => array('title' => 'Наследник', 'cond' => 'inherited',           'credits' => 60000,  'crystals' => 2),
    );
}

// Проверяет условия достижений и выдаёт награду один раз
function ach_evaluate(&$profile) {
    $defs = ach_defs();
    if (!isset($profile['achievements']) || !is_array($profile['achievements'])) $profile['achievements'] = array();
    $colony = isset($profile['colony']) && is_array($profile['colony']) ? $profile['colony'] : array();
    $pop = isset($colony['population']) ? (float)$colony['population'] : 0;
    $stage = isset($colony['stage']) ? $colony['stage'] : '';
    $ships = isset($profile['ships']) && is_array($profile['ships']) ? count($profile['ships']) : 0;
    $workshops = isset($profile['workshops']) ? (int)$profile['workshops'] : 0;
    $colonists = 0;
    if (isset($profile['colonists']) && is_array($profile['colonists'])) $colonists = array_sum($profile['colonists']);
    elseif (isset($profile['colonists'])) $colonists = (int)$profile['colonists'];
    $state = array(
        'colony' => !empty($colony),
        'pop100k' => $pop >= 100000,
        'pop500k' => $pop >= 500000,
        'planet' => $stage === 'planet' || $stage === 'elevator',
        'elevator' => $stage === 'elevator',
        'ships5' => $ships >= 5,
        'workshops2' => $workshops >= 2,
        'colonists1k' => $colonists >= 1000,
        'autonomy' => !empty($colony['autonomy']),
        'raid_repelled' => isset($colony['lastReport']['result']) && $colony['lastReport']['result'] === 'repelled',
        'inherited' => !empty($colony['inherited']),
    );
    $granted = array();
    foreach ($defs as $key => $d) {
        if (!empty($profile['achievements'][$key])) continue;
        if (empty($state[$d['cond']])) continue;
        $profile['achievements'][$key] = time();
        $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $d['credits'];
        if ($d['crystals'] > 0) {
            if (!isset($profile['resources']['eternity'])) $profile['resources']['eternity'] = 0;
            $profile['resources']['eternity'] += $d['crystals'];
        }
        $granted[] = $d['title'];
    }
    return $granted;
}

// ---------------- Этапы колонии ----------------
function colony_stage_cap($stage) {
    if ($stage === 'elevator') return 5000000;
    if ($stage === 'planet') return 1500000;
    return 250000;   // лунная база
}

function colony_stage_name($stage) {
    if ($stage === 'elevator') return 'Планета с лифтом';
    if ($stage === 'planet') return 'Планета';
    return 'Лунная база';
}

// ---------------- МЕГАПРОЕКТЫ ----------------
function mega_defs() {
    return array(
        'orbital' => array('title' => 'Орбитальная станция', 'credits' => 2000000,
            'steel' => 2000, 'chips' => 300, 'income' => 25000, 'energy' => 30),
        'terraform' => array('title' => 'Терраформирование', 'credits' => 10000000,
            'steel' => 5000, 'chips' => 1000, 'income' => 100000, 'energy' => 50),
        'dyson' => array('title' => 'Кольцо Дайсона', 'credits' => 100000000,
            'steel' => 50000, 'chips' => 5000, 'income' => 2000000, 'energy' => 500),
    );
}

// ---------------- Задания новичка ----------------
function quest_defs() {
    return array(
        'sold'   => array('title' => 'Продать что-нибудь на рынке', 'hint' => 'Рынок → продать ресурс', 'reward' => 10000),
        'ship'   => array('title' => 'Заложить первый корабль', 'hint' => 'Док → купить корабль', 'reward' => 30000),
        'colony' => array('title' => 'Основать колонию', 'hint' => 'Колония → основать за 300 000 кр', 'reward' => 60000),
        'build'  => array('title' => 'Построить сооружение', 'hint' => 'Док → фабрика (после колонии)', 'reward' => 20000),
        'chat'   => array('title' => 'Написать в общий чат', 'hint' => 'Меню → Общий чат', 'reward' => 5000),
        'rent'   => array('title' => 'Арендовать место в доке', 'hint' => 'Меню → Аренда (теперь дёшево)', 'reward' => 25000),
        'hire'   => array('title' => 'Нанять переселенцев', 'hint' => 'Аренда → Найм', 'reward' => 20000, 'crystals' => 1),
        'upgrade' => array('title' => 'Модернизировать корабль', 'hint' => 'Аренда → Модернизация флота', 'reward' => 25000, 'crystals' => 1),
        'idea'   => array('title' => 'Предложить идею по развитию', 'hint' => 'Меню → 💡 Пожелания',
                          'reward' => 25000, 'crystals' => 2),
        'autonomy' => array('title' => 'Замкнуть экономику', 'hint' => 'Колония → Замкнутая экономика', 'reward' => 40000, 'crystals' => 2),
    );
}

// Отмечает задание и начисляет награду один раз
function quest_mark(&$profile, $key) {
    $defs = quest_defs();
    if (!isset($defs[$key])) return null;
    if (!isset($profile['quests']) || !is_array($profile['quests'])) $profile['quests'] = array();
    if (!empty($profile['quests'][$key])) return null;
    $profile['quests'][$key] = time();
    $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $defs[$key]['reward'];
    if (!empty($defs[$key]['crystals'])) {
        if (!isset($profile['resources']['eternity'])) $profile['resources']['eternity'] = 0;
        $profile['resources']['eternity'] += $defs[$key]['crystals'];
    }
    $profile['questReward'] = $defs[$key]['reward'];
    return $defs[$key];
}

// ---------------- Очередь стройки ----------------
// Каждый следующий уровень сооружения строится вдвое дольше предыдущего.
function build_durations() {
    return array(
        'factory_base' => 300,   // первый уровень — 5 минут, второй 10, третий 20
        'module' => 1500,        // модуль колонии — 25 минут
        'ships' => array('jet_scout' => 300, 'jet_hauler' => 480, 'ion_courier' => 600,
            'ion_prospector' => 720, 'ion_corsair' => 720, 'plasma_interceptor' => 900, 'plasma_lancer' => 1200,
            'grav_frigate' => 1800, 'grav_colossus' => 2400),
    );
}

function build_seconds($kind, $id, $level) {
    $d = build_durations();
    if ($kind === 'factory') return $d['factory_base'] * (int)pow(2, max(0, $level - 1));
    if ($kind === 'module') return $d['module'];
    if ($kind === 'ship') return isset($d['ships'][$id]) ? $d['ships'][$id] : 600;
    return 600;
}

function build_titles() {
    return array(
        'robots' => 'Фабрика андроидов', 'equipment' => 'Завод оборудования',
        'jet_scout' => 'Разведчик «Искра»', 'jet_hauler' => 'Грузовик «Баржа»',
        'ion_courier' => 'Курьер «Стриж»', 'ion_prospector' => 'Добытчик «Старатель»', 'ion_corsair' => 'Корсар «Вольный»',
        'plasma_interceptor' => 'Перехватчик «Клинок»', 'plasma_lancer' => 'Ланцет «Копьё»',
        'grav_frigate' => 'Фрегат «Щит»', 'grav_colossus' => 'Линкор «Молот»',
        'cloner' => 'Комплекс клонирования', 'medical_build' => 'Медмодуль (постройка)',
        'medical_buy' => 'Медмодуль (покупка)',
    );
}

// Применяет готовые постройки, чистит очередь
// Приводит время в очереди к секундам. Раньше часть записей сохранялась
// в миллисекундах — отсюда таймер «29858278885:44» и цена ускорения в миллиарды.
function build_norm_queue(&$profile) {
    if (!isset($profile['buildQueue']) || !is_array($profile['buildQueue'])) return;
    foreach ($profile['buildQueue'] as $k => $item) {
        $ends = isset($item['endsAt']) ? (float)$item['endsAt'] : 0;
        $start = isset($item['startedAt']) ? (float)$item['startedAt'] : 0;
        if ($ends > 1e12) { $profile['buildQueue'][$k]['endsAt'] = (int)round($ends / 1000); }
        if ($start > 1e12) { $profile['buildQueue'][$k]['startedAt'] = (int)round($start / 1000); }
        $secs = isset($item['seconds']) ? (int)$item['seconds'] : 0;
        if ($secs > 86400 * 30) { $profile['buildQueue'][$k]['seconds'] = 86400 * 30; }
    }
}

function build_flush(&$profile) {
    $applied = array();
    if (!isset($profile['buildQueue']) || !is_array($profile['buildQueue'])) { $profile['buildQueue'] = array(); return $applied; }
    $now = time();
    $keep = array();
    foreach ($profile['buildQueue'] as $item) {
        if ((int)$item['endsAt'] > $now) { $keep[] = $item; continue; }
        if ($item['kind'] === 'factory') {
            if (!isset($profile['factories']) || !is_array($profile['factories'])) $profile['factories'] = array();
            $profile['factories'][$item['id']] = (int)$item['level'];
        } elseif ($item['kind'] === 'ship') {
            if (!isset($profile['ships']) || !is_array($profile['ships'])) $profile['ships'] = array();
            $profile['ships'][] = array('id' => $item['id'], 'builtAt' => time());
        } elseif ($item['kind'] === 'module') {
            $field = $item['module'] === 'cloner' ? 'cloners' : 'medModules';
            $profile[$field] = (isset($profile[$field]) ? (int)$profile[$field] : 0) + 1;
        }
        $applied[] = $item;
    }
    $profile['buildQueue'] = $keep;
    return $applied;
}
// Модули колонии: клон-комплекс и медмодули
function module_price($kind) {
    if ($kind === 'cloner') return array('credits' => 500000, 'steel' => 0, 'chips' => 0, 'field' => 'cloners');
    if ($kind === 'medical_buy') return array('credits' => 600000, 'steel' => 0, 'chips' => 0, 'field' => 'medModules');
    if ($kind === 'medical_build') return array('credits' => 450000, 'steel' => 200, 'chips' => 60, 'field' => 'medModules');
    return null;
}
// Сооружения: цена уровня и сталь (зеркало FACTORIES на клиенте)
function factory_table() {
    return array(
        'robots' => array('cost' => 45000, 'steel' => 120, 'chips' => 0),
        'equipment' => array('cost' => 38000, 'steel' => 90, 'chips' => 0),
        'agro' => array('cost' => 400000, 'steel' => 300, 'chips' => 0),
        // энергетика и инфраструктура: раньше отсутствовали, из-за чего
        // не списывались чипы (баг Игоря: «ветровой парк не списал 4 чипа»)
        'wind' => array('cost' => 32000, 'steel' => 60, 'chips' => 4),
        'geo' => array('cost' => 54000, 'steel' => 110, 'chips' => 8),
        'tidal' => array('cost' => 48000, 'steel' => 95, 'chips' => 6),
        'elevator' => array('cost' => 90000, 'steel' => 200, 'chips' => 30),
        // развлечения: повышают счастье колонии
        'stadium' => array('cost' => 65000, 'steel' => 180, 'chips' => 12, 'fun' => 8),
        'raceway' => array('cost' => 82000, 'steel' => 240, 'chips' => 18, 'fun' => 10),
        'park' => array('cost' => 48000, 'steel' => 120, 'chips' => 10, 'fun' => 6),
    );
}
// Корабли: цены и комплектующие. Числа — из lib/ship_stats.php (единый источник,
// сгенерирован из клиентской таблицы SHIPS). Здесь только форма ответа.
function ship_table() {
    $out = array();
    foreach (SHIP_STATS as $id => $s) {
        $out[$id] = array('price' => $s['price'], 'parts' => $s['parts']);
    }
    return $out;
}
// Чёрный рынок: курсы обмена ресурсов на кристаллы
function bm_rates() {
    return array('quartz' => 30, 'corundum' => 95, 'diamond' => 420, 'heavy' => 150, 'silver' => 240, 'gold' => 900);
}

function rank_table() {
    return array(
        array('id' => 'cadet', 'name' => 'Капитан-стажёр', 'bonus' => 0, 'needs' => array()),
        array('id' => 'trader', 'name' => 'Торговец', 'bonus' => 5000, 'needs' => array(array('credits', 200000))),
        array('id' => 'owner', 'name' => 'Владелец флота', 'bonus' => 10000, 'needs' => array(array('credits', 250000), array('ships', 5))),
        array('id' => 'industrial', 'name' => 'Промышленник', 'bonus' => 20000, 'needs' => array(array('ships', 5), array('buildings', 3), array('colony_pop', 100000))),
        array('id' => 'governor', 'name' => 'Губернатор колонии', 'bonus' => 40000, 'needs' => array(array('colony_pop', 500000), array('colony_happy', 60))),
        array('id' => 'magnate', 'name' => 'Магнат', 'bonus' => 80000, 'needs' => array(array('credits', 5000000), array('colony_pop', 1500000), array('ships', 10))),
        array('id' => 'legend', 'name' => 'Легенда Галактики', 'bonus' => 150000, 'needs' => array(array('credits', 10000000), array('colony_pop', 3000000), array('ships', 15))),
    );
}

function rank_metrics($p) {
    $ships = 0;
    if (isset($p['ships']) && is_array($p['ships'])) {
        $ships = count($p['ships']);
    } elseif (isset($p['fleet']) && is_array($p['fleet'])) {
        foreach ($p['fleet'] as $v) { $ships += (int)$v; }
    }
    $buildings = 0;
    if (isset($p['factories']) && is_array($p['factories'])) {
        foreach ($p['factories'] as $v) { if ((int)$v > 0) $buildings++; }
    }
    return array(
        'credits' => isset($p['credits']) ? (float)$p['credits'] : 0,
        'ships' => $ships,
        'buildings' => $buildings,
        'colony_pop' => isset($p['colony']['population']) ? (float)$p['colony']['population'] : 0,
        'colony_happy' => isset($p['colony']['happiness']) ? (float)$p['colony']['happiness'] : 0,
    );
}

function rank_evaluate($profile, $currentId = null) {
    $ranks = rank_table();
    $m = rank_metrics($profile);
    $from = 0;
    $current = $currentId !== null ? $currentId : (isset($profile['rankId']) ? $profile['rankId'] : 'cadet');
    foreach ($ranks as $i => $r) { if ($r['id'] === $current) { $from = $i; break; } }
    $target = $from;
    $bonus = 0;
    for ($i = $from + 1; $i < count($ranks); $i++) {
        $ok = true;
        foreach ($ranks[$i]['needs'] as $need) {
            if (!isset($m[$need[0]]) || $m[$need[0]] < $need[1]) { $ok = false; break; }
        }
        if (!$ok) break;
        $target = $i;
        $bonus += $ranks[$i]['bonus'];
    }
    return array('index' => $target, 'from' => $from, 'bonus' => $bonus, 'metrics' => $m);
}
// Разрешённые к торговле ресурсы (совпадает с клиентским рынком)
// Названия ресурсов для сообщений об ошибках: «не хватает чипы» → «не хватает чипов».
function res_name($key) {
    $names = array('steel' => 'стали', 'copper' => 'меди', 'nickel' => 'никеля',
        'silver' => 'серебра', 'gold' => 'золота', 'chips' => 'чипов', 'boards' => 'плат',
        'manip' => 'манипуляторов', 'grain' => 'зерна', 'water' => 'воды', 'ice' => 'льда',
        'quartz' => 'кварца', 'polymer' => 'полимера', 'heavy' => 'тяжёлой воды');
    return isset($names[$key]) ? $names[$key] : $key;
}

function market_goods() {
    return array('grain', 'water', 'ice', 'steel', 'quartz', 'polymer',
                 'copper', 'nickel', 'silver', 'gold', 'chips', 'boards', 'manip');
}

// Читает профиль игрока как массив (там JSON-строка)
function profile_of(&$users, $idx) {
    $p = json_decode($users[$idx]['Profile'], true);
    if (!is_array($p)) $p = array();
    if (!isset($p['resources']) || !is_array($p['resources'])) $p['resources'] = array();
    return $p;
}

function profile_store(&$users, $idx, $profile) {
    $users[$idx]['Profile'] = json_encode($profile, JSON_UNESCAPED_UNICODE);
}

function norm($email) { return strtolower(trim((string)$email)); }
function find_user(&$users, $email) {
    $n = norm($email);
    foreach ($users as $i => $u) { if (norm(isset($u['Email']) ? $u['Email'] : '') === $n) return $i; }
    return -1;
}
function hash_password($password) {
    $salt = random_bytes(16);
    return array(base64_encode($salt), base64_encode(hash_pbkdf2('sha256', $password, $salt, 120000, 32, true)));
}
function verify_password($password, $saltB64, $hashB64) {
    $salt = base64_decode($saltB64, true); $expected = base64_decode($hashB64, true);
    if ($salt === false || $expected === false) return false;
    return hash_equals($expected, hash_pbkdf2('sha256', $password, $salt, 120000, 32, true));
}
function issue_token($email) {
    global $tokensFile;
    $tokens = load_json($tokensFile, array());
    $token = bin2hex(random_bytes(24));
    $tokens[$token] = norm($email);
    save_json($tokensFile, $tokens);
    return $token;
}
function user_by_token($token) {
    global $tokensFile, $usersFile;
    if (!$token) return null;
    $tokens = load_json($tokensFile, array());
    if (!isset($tokens[$token])) return null;
    $users = load_json($usersFile, array());
    $idx = find_user($users, $tokens[$token]);
    return $idx >= 0 ? $users[$idx] : null;
}

function default_settings() {
    return array(
        'enabled' => false,
        'currency' => 'RUB',
        'sbp' => array('link' => '', 'phone' => '', 'recipient' => ''),
        'card' => array('number' => '', 'recipient' => ''),
        'note' => 'В комментарии к переводу укажите код платежа.',
        'packages' => array(
            array('id' => 'p1', 'title' => 'Стартовый', 'credits' => 25, 'price' => 100),
            array('id' => 'p2', 'title' => 'Капитанский', 'credits' => 150, 'price' => 500),
            array('id' => 'p3', 'title' => 'Адмиральский', 'credits' => 500, 'price' => 1500),
        ),
    );
}

$users = load_json($usersFile, array());
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = array();
$token = isset($_SERVER['HTTP_X_AUTH_TOKEN']) ? $_SERVER['HTTP_X_AUTH_TOKEN'] : '';
$method = $_SERVER['REQUEST_METHOD'];
$me = user_by_token($token);
$isAdmin = $me && isset($me['Role']) && $me['Role'] === 'admin';

// ---------- верфь: доки, скорость, рабочие места ----------
function shipyard_table() {
    return array(
        1 => array('docks' => 1, 'speed' => 1.00, 'jobs' => 200,   'cost' => 0,       'steel' => 0,   'hours' => 0),
        2 => array('docks' => 2, 'speed' => 1.15, 'jobs' => 500,   'cost' => 120000,  'steel' => 40,  'hours' => 2),
        3 => array('docks' => 3, 'speed' => 1.35, 'jobs' => 1200,  'cost' => 300000,  'steel' => 120, 'hours' => 4),
        4 => array('docks' => 4, 'speed' => 1.60, 'jobs' => 2500,  'cost' => 800000,  'steel' => 300, 'hours' => 6),
        5 => array('docks' => 5, 'speed' => 2.00, 'jobs' => 5000,  'cost' => 2000000, 'steel' => 700, 'hours' => 8)
    );
}

function shipyard_level($profile) {
    $lvl = isset($profile['shipyard']) ? (int)$profile['shipyard'] : 1;
    return max(1, min(5, $lvl));
}

function shipyard_speed($profile) {
    $t = shipyard_table();
    $lvl = shipyard_level($profile);
    return $t[$lvl]['speed'];
}

// ---------- доки: общий ресурс для постройки и модернизации ----------
function docks_count($profile) {
    $t = shipyard_table();
    $lvl = shipyard_level($profile);
    // доки верфи и арендованные места — раньше клиент и сервер считали их
    // по-разному, из-за чего в окне появлялось «Док: 9 / 1»
    $owned = isset($profile['dockSlots']) ? (int)$profile['dockSlots'] : 1;
    return max($owned, (int)$t[$lvl]['docks']);
}

function docks_upgrade_cost($profile) {
    $t = shipyard_table();
    $next = shipyard_level($profile) + 1;
    return isset($t[$next]) ? (int)$t[$next]['cost'] : 0;
}

function docks_occupied($profile) {
    $now = time();
    $busy = array();
    $shipsT = ship_table();
    // постройка кораблей в доках
    if (isset($profile['buildQueue']) && is_array($profile['buildQueue'])) {
        foreach ($profile['buildQueue'] as $q) {
            if (!isset($q['kind']) || $q['kind'] !== 'ship') continue;
            $sid = isset($q['id']) ? $q['id'] : '';
            $busy[] = array('type' => 'build', 'id' => $sid,
                'title' => (isset($shipsT[$sid]['name']) ? $shipsT[$sid]['name'] : $sid)
                    . ' · постройка',
                'until' => isset($q['endsAt']) ? (int)$q['endsAt'] : $now,
                'left' => max(0, (isset($q['endsAt']) ? (int)$q['endsAt'] : $now) - $now));
        }
    }
    // модернизация кораблей
    if (isset($profile['ships']) && is_array($profile['ships'])) {
        foreach ($profile['ships'] as $i => $sh) {
            if (empty($sh['modKind'])) continue;
            if (isset($sh['modEnds']) && (int)$sh['modEnds'] > $now) {
                $names = array('weapon' => 'оружие', 'shield' => 'щит', 'armor' => 'броня', 'engine' => 'двигатель');
                $busy[] = array('type' => 'mod', 'id' => isset($sh['id']) ? $sh['id'] : ('ship' . $i),
                    'ship' => $i, 'kind' => $sh['modKind'],
                    'title' => (isset($sh['name']) ? $sh['name'] : ('Корабль ' . ($i + 1)))
                        . ' · модернизация: ' . (isset($names[$sh['modKind']]) ? $names[$sh['modKind']] : $sh['modKind']),
                    'until' => (int)$sh['modEnds'], 'left' => (int)$sh['modEnds'] - $now);
            }
        }
    }
    return $busy;
}

// если док освободился — поднимаем первую модернизацию из очереди
function docks_pump(&$profile) {
    $now = time();
    if (!isset($profile['dockQueue']) || !is_array($profile['dockQueue']) || !count($profile['dockQueue'])) return false;
    if (docks_free($profile) < 1) return false;
    $job = array_shift($profile['dockQueue']);
    $si = (int)$job['ship'];
    if (!isset($profile['ships'][$si])) return false;
    $secs = (int)round(300 * pow(1.5, max(0, (int)$job['level'] - 1)));
    $profile['ships'][$si]['modEnds'] = $now + $secs;
    $profile['ships'][$si]['modKind'] = $job['kind'];
    $profile['ships'][$si]['modLevel'] = (int)$job['level'];
    return true;
}

function docks_free($profile) {
    return max(0, docks_count($profile) - count(docks_occupied($profile)));
}

// ---------- модернизация: таблицы ----------
function ship_mod_branches() {
    return array(
        'weapon' => array('name' => 'Оружие', 'stat' => 'урон', 'step' => 0.10),
        'shield' => array('name' => 'Щит', 'stat' => 'ёмкость и регенерация', 'step' => 0.10),
        'armor' => array('name' => 'Броня', 'stat' => 'сопротивление', 'step' => 0.10),
        'engine' => array('name' => 'Двигатель', 'stat' => 'уклонение', 'step' => 0.10)
    );
}

function ship_blueprint_table() {
    return array(
        'bp_plasma_core' => array('name' => 'Плазменный сердечник', 'dmg' => 0.25, 'price' => 120000, 'buy' => true, 'rare' => 'редкий', 'note' => 'усиливает подачу энергии на орудия'),
        'bp_rail_accel' => array('name' => 'Магнитный ускоритель', 'acc' => 0.15, 'price' => 60000, 'buy' => true, 'rare' => 'обычный', 'note' => 'разгоняет снаряды'),
        'bp_shield_harmonic' => array('name' => 'Гармонизатор щита', 'shield' => 0.30, 'price' => 110000, 'buy' => true, 'rare' => 'редкий', 'note' => 'выравнивает поле щита'),
        'bp_armor_adamant' => array('name' => 'Адамантиевая броня', 'armor' => 0.20, 'price' => 95000, 'buy' => true, 'rare' => 'редкий', 'note' => 'слой адамантия'),
        'bp_engine_vector' => array('name' => 'Векторный привод', 'evade' => 0.25, 'price' => 75000, 'buy' => true, 'rare' => 'обычный', 'note' => 'боковые дюзы'),
        'bp_targeting_ai' => array('name' => 'ИИ наводчика', 'dmg' => 0.10, 'acc' => 0.10, 'price' => 85000, 'buy' => true, 'rare' => 'обычный', 'note' => 'предсказывает манёвр'),
        'bp_reactor_overdrive' => array('name' => 'Реактор «Перегрузка»', 'energy' => 0.20, 'price' => 100000, 'buy' => true, 'rare' => 'редкий', 'note' => 'больше пушек в залпе'),
        'bp_repair_drone' => array('name' => 'Ремонтные дроны', 'hull' => 0.15, 'price' => 70000, 'buy' => true, 'rare' => 'обычный', 'note' => 'латают корпус в бою'),
        'bp_torpedo_boost' => array('name' => 'Форсаж торпед', 'pen' => 0.20, 'price' => 80000, 'buy' => true, 'rare' => 'обычный', 'note' => 'пробивает броню'),
        'art_jupiter_eye' => array('name' => 'Глаз Юпитера', 'dmg' => 0.12, 'price' => 0, 'buy' => false, 'rare' => 'артефакт', 'note' => 'найден на станции'),
        'art_void_shard' => array('name' => 'Осколок Пустоты', 'pen' => 0.20, 'price' => 0, 'buy' => false, 'rare' => 'артефакт', 'note' => 'трофей с пиратского рынка'),
        'art_ancient_key' => array('name' => 'Ключ Древних', 'dmg' => 0.08, 'shield' => 0.08, 'armor' => 0.08, 'evade' => 0.08, 'price' => 0, 'buy' => false, 'rare' => 'артефакт', 'note' => 'редкий квест'),
        'art_kepler_core' => array('name' => 'Ядро Кеплера', 'energy' => 0.15, 'price' => 0, 'buy' => false, 'rare' => 'артефакт', 'note' => 'из колонии «Кеплер-1»')
    );
}

function ship_stats_with_mods($ship) {
    $mods = isset($ship['mods']) && is_array($ship['mods']) ? $ship['mods'] : array();
    $bps = isset($ship['blueprints']) && is_array($ship['blueprints']) ? $ship['blueprints'] : array();
    $table = ship_blueprint_table();
    $mult = array('dmg' => 1, 'shield' => 1, 'armor' => 1, 'evade' => 1, 'hull' => 1, 'energy' => 1, 'acc' => 1, 'pen' => 0);
    foreach (array('weapon' => 'dmg', 'shield' => 'shield', 'armor' => 'armor', 'engine' => 'evade') as $branch => $stat) {
        $lvl = isset($mods[$branch]) ? (int)$mods[$branch] : 0;
        $mult[$stat] *= (1 + 0.10 * $lvl);
    }
    foreach ($bps as $bid) {
        if (!isset($table[$bid])) continue;
        $bp = $table[$bid];
        foreach (array('dmg', 'shield', 'armor', 'evade', 'hull', 'energy', 'acc') as $k) {
            if (isset($bp[$k])) $mult[$k] *= (1 + $bp[$k]);
        }
        if (isset($bp['pen'])) $mult['pen'] += $bp['pen'];
    }
    return $mult;
}

// ---------- боевая математика ----------
function combat_ship_table() {
    // Баланс арены не менялся: числа перенесены 1:1 в lib/ship_stats.php
    // (SHIP_COMBAT_STATS). hull 900..12000 — ДРУГАЯ единица, не клиентский hp.
    return SHIP_COMBAT_STATS;
}

function combat_gun_table() {
    return array(
        'rail' => array('name' => 'Рельса', 'type' => 'kinetic', 'dmg' => 220, 'rate' => 1.0, 'acc' => 0.80, 'pen' => 0.35, 'energy' => 25),
        'plasma' => array('name' => 'Плазма', 'type' => 'thermal', 'dmg' => 320, 'rate' => 1.0, 'acc' => 0.70, 'pen' => 0.15, 'energy' => 40),
        'torpedo' => array('name' => 'Торпеды', 'type' => 'explosive', 'dmg' => 520, 'rate' => 0.5, 'acc' => 0.85, 'pen' => 0.10, 'energy' => 35),
        'laser' => array('name' => 'Лазер', 'type' => 'energy', 'dmg' => 260, 'rate' => 1.5, 'acc' => 0.75, 'pen' => 0.20, 'energy' => 30)
    );
}

function combat_resist_table() {
    return array(
        'kinetic' => array('shield' => 0.55, 'armor' => 0.95),
        'thermal' => array('shield' => 1.20, 'armor' => 0.70),
        'explosive' => array('shield' => 0.75, 'armor' => 1.25),
        'energy' => array('shield' => 1.45, 'armor' => 0.80)
    );
}

function combat_upgrades() {
    return array(
        'weapon' => array('dmg' => 0.12, 'acc' => 0.04),
        'shield' => array('cap' => 0.18, 'regen' => 0.20),
        'armor' => array('armor' => 0.08),
        'engine' => array('evade' => 0.06)
    );
}

function combat_build($shipId, $spec) {
    $ships = combat_ship_table();
    if (!isset($ships[$shipId])) $shipId = 'jet_scout';
    $base = $ships[$shipId];
    $guns = combat_gun_table();
    $gid = isset($spec['gun']) && isset($guns[$spec['gun']]) ? $spec['gun'] : 'laser';
    $gun = $guns[$gid];
    $count = isset($spec['guns']) ? max(1, min(5, (int)$spec['guns'])) : 1;
    $count = min($count, (int)$base['slots']);
    // энергия ограничивает число пушек
    while ($count > 1 && $count * $gun['energy'] > $base['energy']) $count--;
    $up = isset($spec['upgrades']) && is_array($spec['upgrades']) ? $spec['upgrades'] : array();
    $wl = isset($up['weapon']) ? max(0, min(3, (int)$up['weapon'])) : 0;
    $sl = isset($up['shield']) ? max(0, min(3, (int)$up['shield'])) : 0;
    $al = isset($up['armor']) ? max(0, min(3, (int)$up['armor'])) : 0;
    $el = isset($up['engine']) ? max(0, min(3, (int)$up['engine'])) : 0;
    return array(
        'ship' => $shipId, 'name' => $base['name'], 'gun' => $gid, 'gunName' => $gun['name'],
        'gunType' => $gun['type'], 'guns' => $count,
        'hull' => (float)$base['hull'],
        'shield' => (float)$base['shield'] * (1 + 0.18 * $sl),
        'armor' => min(0.85, (float)$base['armor'] * (1 + 0.08 * $al)),
        'evade' => min(0.70, (float)$base['evade'] * (1 + 0.06 * $el)),
        'dmg' => (float)$gun['dmg'] * (1 + 0.12 * $wl),
        'rate' => (float)$gun['rate'],
        'acc' => (float)$gun['acc'] * (1 + 0.04 * $wl) * (1 - 0.04 * ($count - 1)),
        'pen' => (float)$gun['pen'],
        'regen' => (0.05 + 0.20 * $sl),
        'levels' => array('weapon' => $wl, 'shield' => $sl, 'armor' => $al, 'engine' => $el)
    );
}

function combat_simulate($aSpec, $dSpec) {
    $A = combat_build(isset($aSpec['ship']) ? $aSpec['ship'] : 'plasma_lancer', $aSpec);
    $D = combat_build(isset($dSpec['ship']) ? $dSpec['ship'] : 'grav_frigate', $dSpec);
    $resist = combat_resist_table();

    $sides = array(
        'attacker' => array('ship' => $A, 'shield' => $A['shield'], 'hull' => $A['hull']),
        'defender' => array('ship' => $D, 'shield' => $D['shield'], 'hull' => $D['hull'])
    );
    $pair = array('attacker' => 'defender', 'defender' => 'attacker');
    $log = array();
    $rounds = 0;

    while ($rounds < 30 && $sides['attacker']['hull'] > 0 && $sides['defender']['hull'] > 0) {
        $rounds++;
        $entry = array('round' => $rounds);
        foreach ($pair as $who => $foe) {
            $att = $sides[$who]['ship'];
            $tgt = $sides[$foe]['ship'];
            $shots = $att['rate'] * $att['guns'];
            $n = (int)ceil($shots);
            $hits = 0; $toShield = 0; $toHull = 0;
            $rs = $resist[$att['gunType']]['shield'];
            $ra = $resist[$att['gunType']]['armor'];
            $chance = min(0.98, max(0.20, $att['acc'] * (1 - $tgt['evade'])));

            for ($i = 0; $i < $n; $i++) {
                if (mt_rand() / mt_getrandmax() > $chance) continue;
                $hits++;
                $dmg = $att['dmg'];
                $rest = $dmg;
                // щит поглощает свою долю, излишек проходит в броню и корпус
                if ($sides[$foe]['shield'] > 0) {
                    $potential = $rest * $rs;
                    if ($sides[$foe]['shield'] >= $potential) {
                        $sides[$foe]['shield'] -= $potential;
                        $toShield += $potential;
                        $rest = 0;
                    } else {
                        $absorbed = $sides[$foe]['shield'];
                        $toShield += $absorbed;
                        $rest -= $absorbed / max(0.01, $rs);   // сколько «сырого» урона ушло в щит
                        $sides[$foe]['shield'] = 0;
                    }
                }
                if ($rest > 0.01) {
                    $armorK = 1 - $tgt['armor'] * (1 - $att['pen']);
                    $hd = $rest * $ra * $armorK;
                    $sides[$foe]['hull'] = max(0, $sides[$foe]['hull'] - $hd);
                    $toHull += $hd;
                }
            }
            // регенерация щита цели
            $sides[$foe]['shield'] = min($tgt['shield'], $sides[$foe]['shield'] + $tgt['shield'] * $tgt['regen']);

            $entry[$who] = array(
                'hits' => $hits,
                'shieldDmg' => round($toShield),
                'hullDmg' => round($toHull),
                'targetShield' => round($sides[$foe]['shield']),
                'targetHull' => round($sides[$foe]['hull'])
            );
            if ($sides['attacker']['hull'] <= 0 || $sides['defender']['hull'] <= 0) break;
        }
        $log[] = $entry;
    }

    $winner = 'draw';
    if ($sides['defender']['hull'] <= 0 && $sides['attacker']['hull'] > 0) $winner = 'attacker';
    elseif ($sides['attacker']['hull'] <= 0 && $sides['defender']['hull'] > 0) $winner = 'defender';

    return array(
        'attacker' => $A, 'defender' => $D, 'rounds' => $rounds, 'log' => $log,
        'winner' => $winner,
        'attackerHull' => round($sides['attacker']['hull']),
        'defenderHull' => round($sides['defender']['hull']),
        'attackerShield' => round($sides['attacker']['shield']),
        'defenderShield' => round($sides['defender']['shield'])
    );
}

function combat_matrix($upgrade, $guns, $target) {
    $gunT = combat_gun_table();
    $resist = combat_resist_table();
    $targets = array(
        'shield' => array('armor' => 0.10, 'evade' => 0.05, 'label' => 'щит'),
        'armor' => array('armor' => 0.45, 'evade' => 0.02, 'label' => 'броня'),
        'balanced' => array('armor' => 0.25, 'evade' => 0.12, 'label' => 'смешанный')
    );
    $t = isset($targets[$target]) ? $targets[$target] : $targets['balanced'];
    $rows = array();
    foreach ($gunT as $gid => $g) {
        $dmg = $g['dmg'] * (1 + 0.12 * $upgrade);
        $acc = $g['acc'] * (1 + 0.04 * $upgrade) * (1 - 0.04 * ($guns - 1));
        $acc = min(0.98, max(0.20, $acc * (1 - $t['evade'])));
        $shots = $g['rate'] * $guns;
        $perRound = $dmg * $acc * $shots;
        $rows[] = array(
            'gun' => $g['name'], 'type' => $g['type'],
            'vsShield' => round($perRound * $resist[$g['type']]['shield']),
            'vsArmor' => round($perRound * $resist[$g['type']]['armor'] * (1 - $t['armor'] * (1 - $g['pen']))),
            'vsHull' => round($perRound)
        );
    }
    return $rows;
}

switch ($action) {
    case 'health':
        json_out(200, array('ok' => true, 'time' => gmdate('c')));

    case 'login':
        if ($method !== 'POST') json_out(405, array('error' => 'method'));
        $email = isset($input['email']) ? $input['email'] : '';
        $password = isset($input['password']) ? $input['password'] : '';
        $idx = find_user($users, $email);
        if ($idx < 0 || !verify_password($password, $users[$idx]['Salt'], $users[$idx]['Hash'])) {
            json_out(401, array('error' => 'invalid credentials'));
        }
        $u = $users[$idx];
        // отметка активности: по ней cron решает, жива колония или брошена
        $parsed = json_decode($u['Profile'], true);
        if (!is_array($parsed)) $parsed = array();
        if (!empty($parsed['resetPending'])) {
            // колонию забрали, пока игрока не было: начинаем заново
            $parsed = array(
                'lastName' => isset($parsed['lastName']) ? $parsed['lastName'] : '',
                'gameName' => isset($parsed['gameName']) ? $parsed['gameName'] : '',
                'faction' => isset($parsed['faction']) ? $parsed['faction'] : '',
                'credits' => 250000,
                'hasSeenLegend' => false,
                'resetAt' => time(),
                'resetReason' => 'colony_taken',
                'resetBy' => isset($parsed['resetBy']) ? $parsed['resetBy'] : '',
            );
        }
        $parsed['lastSeen'] = time();
        ach_evaluate($parsed);
        $users[$idx]['Profile'] = json_encode($parsed, JSON_UNESCAPED_UNICODE);
        save_json($usersFile, $users);
        $u = $users[$idx];
        json_out(200, array('token' => issue_token($u['Email']), 'role' => $u['Role'], 'profile' => $u['Profile']));

    case 'register':
        if ($method !== 'POST') json_out(405, array('error' => 'method'));
        $email = norm(isset($input['email']) ? $input['email'] : '');
        $password = isset($input['password']) ? $input['password'] : '';
        if (strlen($email) < 3 || strpos($email, '@') === false) json_out(400, array('error' => 'неверная почта'));
        if (strlen($password) < 6) json_out(400, array('error' => 'пароль короче 6 символов'));
        if (find_user($users, $email) >= 0) json_out(400, array('error' => 'такая почта уже есть'));
        list($salt, $hash) = hash_password($password);
        $refBonus = array('credits' => 25000, 'crystals' => 10);
        $refBy = '';
        $refCode = isset($input['ref']) ? strtolower(trim($input['ref'])) : '';
        if ($refCode !== '') {
            foreach ($users as $u2) {
                $p2 = json_decode(isset($u2['Profile']) ? $u2['Profile'] : '', true);
                if (!is_array($p2)) continue;
                if (isset($p2['refCode']) && strtolower($p2['refCode']) === $refCode && norm($u2['Email']) !== $email) {
                    $refBy = norm($u2['Email']);
                    break;
                }
            }
        }
        $profile = json_encode(array(
            'lastName' => isset($input['lastName']) ? $input['lastName'] : '',
            'gameName' => isset($input['gameName']) ? $input['gameName'] : '',
            'faction' => isset($input['faction']) ? $input['faction'] : '',
            'credits' => 200000 + ($refBy !== '' ? $refBonus['credits'] : 0), 'hasSeenLegend' => false,
            'refCode' => substr(md5(strtolower($email) . 'glk'), 0, 8),
            'referredBy' => $refBy,
            'referrals' => 0,
            'lastSeen' => time(),
            'dockSlots' => 2, 'workshops' => 0,
            // стартовый набор: хватает на первый корабль и первые шаги
            // хватает и на разведчик (60 стали), и на фабрику (120 стали)
            'resources' => array('steel' => 250, 'copper' => 60, 'nickel' => 30, 'silver' => 6,
                'gold' => 3, 'chips' => 24, 'boards' => 30, 'manip' => 6, 'grain' => 2000, 'water' => 200,
                'eternity' => ($refBy !== '' ? $refBonus['crystals'] : 0)),
        ), JSON_UNESCAPED_UNICODE);
        $role = ($email === 'ab@btema.ru') ? 'admin' : 'user';
        $users[] = array('Email' => $email, 'Salt' => $salt, 'Hash' => $hash, 'Profile' => $profile,
                         'Role' => $role, 'Created' => gmdate('c'));
        save_json($usersFile, $users);
        json_out(200, array('token' => issue_token($email), 'role' => $role, 'profile' => $profile));

    case 'me':
        if (!$me) json_out(401, array('error' => 'unauthorized'));
        json_out(200, array('email' => $me['Email'], 'role' => $me['Role'], 'profile' => $me['Profile']));

    // обучение пройдено или отменено: больше не показываем
    case 'onb_done':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $profile['onbDone'] = 1;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true));

    case 'profile':
        if (!$me) json_out(401, array('error' => 'unauthorized'));
        $profile = isset($input['profile']) ? $input['profile'] : '';
        if ($profile === '') json_out(400, array('error' => 'empty profile'));
        $idx = find_user($users, $me['Email']);
        // ранг хранится на сервере: клиент не может сбросить его, прислав профиль без rankId
        $rankMap = load_json($ranksFile, array());
        $emailKey = norm($me['Email']);
        if (isset($rankMap[$emailKey])) {
            $parsed = json_decode($profile, true);
            if (is_array($parsed)) {
                foreach (rank_table() as $rr) {
                    if ($rr['id'] === $rankMap[$emailKey]) { $parsed['rankId'] = $rr['id']; $parsed['rank'] = $rr['name']; break; }
                }
                $profile = json_encode($parsed, JSON_UNESCAPED_UNICODE);
            }
        }
        $prevProfile = json_decode($users[$idx]['Profile'], true);
        if (!is_array($prevProfile)) $prevProfile = array();
        $newProfile = json_decode($profile, true);
        if (!is_array($newProfile)) $newProfile = array();
        $anomaly = wallet_guard($walletFile, $me['Email'], $prevProfile, $newProfile);
        $profile = json_encode($newProfile, JSON_UNESCAPED_UNICODE);
        $users[$idx]['Profile'] = $profile;
        save_json($usersFile, $users);
        json_out(200, array('saved' => true, 'anomaly' => $anomaly));

    case 'password':
        if (!$me) json_out(401, array('error' => 'unauthorized'));
        $old = isset($input['oldPassword']) ? $input['oldPassword'] : '';
        $new = isset($input['newPassword']) ? $input['newPassword'] : '';
        if (!verify_password($old, $me['Salt'], $me['Hash']) || strlen($new) < 6) json_out(400, array('error' => 'не удалось сменить пароль'));
        list($salt, $hash) = hash_password($new);
        $idx = find_user($users, $me['Email']);
        $users[$idx]['Salt'] = $salt; $users[$idx]['Hash'] = $hash;
        save_json($usersFile, $users);
        json_out(200, array('changed' => true));

    // ---------------- ОПЛАТА ----------------

    case 'pay_settings':
        $settings = load_json($settingsFile, default_settings());
        if ($method === 'POST') {
            if (!$isAdmin) json_out(403, array('error' => 'только для администратора'));
            $incoming = isset($input['settings']) && is_array($input['settings']) ? $input['settings'] : $input;
            $settings = array(
                'enabled' => !empty($incoming['enabled']),
                'currency' => isset($incoming['currency']) ? $incoming['currency'] : 'RUB',
                'sbp' => array(
                    'link' => isset($incoming['sbp']['link']) ? trim($incoming['sbp']['link']) : '',
                    'phone' => isset($incoming['sbp']['phone']) ? trim($incoming['sbp']['phone']) : '',
                    'recipient' => isset($incoming['sbp']['recipient']) ? trim($incoming['sbp']['recipient']) : '',
                ),
                'card' => array(
                    'number' => isset($incoming['card']['number']) ? trim($incoming['card']['number']) : '',
                    'recipient' => isset($incoming['card']['recipient']) ? trim($incoming['card']['recipient']) : '',
                ),
                'note' => isset($incoming['note']) ? $incoming['note'] : '',
                'packages' => array(),
            );
            if (isset($incoming['packages']) && is_array($incoming['packages'])) {
                foreach ($incoming['packages'] as $i => $p) {
                    $credits = isset($p['credits']) ? (int)$p['credits'] : 0;
                    $price = isset($p['price']) ? (int)$p['price'] : 0;
                    if ($credits <= 0 || $price <= 0) continue;
                    $settings['packages'][] = array(
                        'id' => isset($p['id']) && $p['id'] !== '' ? preg_replace('/[^a-zA-Z0-9_]/', '', $p['id']) : 'p' . ($i + 1),
                        'title' => isset($p['title']) ? $p['title'] : ('Пакет ' . ($i + 1)),
                        'credits' => $credits,
                        'price' => $price,
                    );
                }
            }
            if (!count($settings['packages'])) $settings['packages'] = default_settings()['packages'];
            save_json($settingsFile, $settings);
            json_out(200, array('saved' => true, 'settings' => $settings));
        }
        json_out(200, array('settings' => $settings));

    case 'pay_order':
        if ($method !== 'POST') json_out(405, array('error' => 'method'));
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $settings = load_json($settingsFile, default_settings());
        if (empty($settings['enabled'])) json_out(403, array('error' => 'оплата отключена администратором'));
        $packageId = isset($input['packageId']) ? $input['packageId'] : '';
        $payMethod = isset($input['method']) && $input['method'] === 'card' ? 'card' : 'sbp';
        $package = null;
        foreach ($settings['packages'] as $p) { if ($p['id'] === $packageId) { $package = $p; break; } }
        if (!$package) json_out(400, array('error' => 'пакет не найден'));
        $orders = load_json($ordersFile, array());
        $code = 'GLK-' . strtoupper(bin2hex(random_bytes(3)));
        $order = array(
            'id' => bin2hex(random_bytes(8)),
            'code' => $code,
            'email' => norm($me['Email']),
            'packageId' => $package['id'],
            'title' => $package['title'],
            'credits' => (int)$package['credits'],
            'price' => (int)$package['price'],
            'method' => $payMethod,
            'status' => 'pending',
            'created' => gmdate('c'),
            'paidAt' => null,
            'applied' => false,
        );
        $orders[] = $order;
        save_json($ordersFile, $orders);
        json_out(200, array('order' => $order, 'settings' => array(
            'sbp' => $settings['sbp'], 'card' => $settings['card'],
            'note' => $settings['note'], 'currency' => $settings['currency'],
        )));

    case 'pay_my':
        if (!$me) json_out(401, array('error' => 'unauthorized'));
        $orders = load_json($ordersFile, array());
        $mine = array();
        $pendingCredits = 0;
        foreach ($orders as $o) {
            if ($o['email'] !== norm($me['Email'])) continue;
            $mine[] = $o;
            if ($o['status'] === 'paid' && empty($o['applied'])) $pendingCredits += (int)$o['credits'];
        }
        json_out(200, array('orders' => $mine, 'pendingCredits' => $pendingCredits));

    case 'pay_ack':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'unauthorized'));
        $ids = isset($input['ids']) && is_array($input['ids']) ? $input['ids'] : array();
        $orders = load_json($ordersFile, array());
        $changed = false;
        foreach ($orders as $i => $o) {
            if ($o['email'] === norm($me['Email']) && in_array($o['id'], $ids, true) && empty($o['applied'])) {
                $orders[$i]['applied'] = true; $changed = true;
            }
        }
        if ($changed) save_json($ordersFile, $orders);
        json_out(200, array('ok' => true));

    case 'pay_orders':
        if (!$isAdmin) json_out(403, array('error' => 'только для администратора'));
        $orders = load_json($ordersFile, array());
        usort($orders, function ($a, $b) { return strcmp($b['created'], $a['created']); });
        json_out(200, array('orders' => $orders));

    case 'pay_status':
        if ($method !== 'POST') json_out(405, array('error' => 'method'));
        if (!$isAdmin) json_out(403, array('error' => 'только для администратора'));
        $id = isset($input['id']) ? $input['id'] : '';
        $status = isset($input['status']) ? $input['status'] : '';
        if (!in_array($status, array('paid', 'rejected', 'pending'), true)) json_out(400, array('error' => 'неверный статус'));
        $orders = load_json($ordersFile, array());
        $found = false;
        foreach ($orders as $i => $o) {
            if ($o['id'] !== $id) continue;
            $orders[$i]['status'] = $status;
            $orders[$i]['paidAt'] = $status === 'paid' ? gmdate('c') : null;
            $found = true;
            if ($status === 'paid') {
                // начисляем «Кристаллы Вечности» (resources.eternity) — премиальную валюту игры
                $users = load_json($usersFile, array());
                $uidx = find_user($users, $o['email']);
                if ($uidx >= 0) {
                    $profile = json_decode($users[$uidx]['Profile'], true);
                    if (!is_array($profile)) $profile = array();
                    if (!isset($profile['resources']) || !is_array($profile['resources'])) $profile['resources'] = array();
                    $profile['resources']['eternity'] = (isset($profile['resources']['eternity']) ? (int)$profile['resources']['eternity'] : 0) + (int)$o['credits'];
                    $users[$uidx]['Profile'] = json_encode($profile, JSON_UNESCAPED_UNICODE);
                    save_json($usersFile, $users);
                }
            }
            break;
        }
        if (!$found) json_out(404, array('error' => 'заказ не найден'));
        save_json($ordersFile, $orders);
        json_out(200, array('saved' => true));


    // ---------------- ОБЩИЙ РЫНОК ИГРОКОВ ----------------

    case 'market_list':
        $offers = load_json($marketFile, array());
        usort($offers, function ($a, $b) { return strcmp($b['created'], $a['created']); });
        json_out(200, array('offers' => $offers));

    case 'market_offer':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $resource = isset($input['resource']) ? $input['resource'] : '';
        $qty = isset($input['qty']) ? (int)$input['qty'] : 0;
        $price = isset($input['price']) ? (float)$input['price'] : 0;
        if (!in_array($resource, market_goods(), true)) json_out(400, array('error' => 'этим товаром торговать нельзя'));
        if ($qty <= 0 || $price <= 0) json_out(400, array('error' => 'проверьте количество и цену'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $have = isset($profile['resources'][$resource]) ? (int)$profile['resources'][$resource] : 0;
        if ($have < $qty) json_out(400, array('error' => 'на складе только ' . $have));
        $profile['resources'][$resource] = $have - $qty;
        $offers = load_json($marketFile, array());
        $offer = array('id' => bin2hex(random_bytes(6)), 'email' => norm($me['Email']),
            'seller' => isset($profile['gameName']) ? $profile['gameName'] : norm($me['Email']),
            'resource' => $resource, 'qty' => $qty, 'price' => round($price, 2), 'created' => gmdate('c'));
        $offers[] = $offer;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        save_json($marketFile, $offers);
        json_out(200, array('offer' => $offer));

    case 'market_cancel':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти'));
        $id = isset($input['id']) ? $input['id'] : '';
        $offers = load_json($marketFile, array());
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $found = false;
        foreach ($offers as $i => $o) {
            if ($o['id'] !== $id) continue;
            if ($o['email'] !== norm($me['Email'])) json_out(403, array('error' => 'это не ваше предложение'));
            $profile['resources'][$o['resource']] = (isset($profile['resources'][$o['resource']]) ? (int)$profile['resources'][$o['resource']] : 0) + (int)$o['qty'];
            unset($offers[$i]);
            $found = true;
            break;
        }
        if (!$found) json_out(404, array('error' => 'предложение не найдено'));
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        save_json($marketFile, array_values($offers));
        json_out(200, array('cancelled' => true));

    case 'market_buy':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти'));
        $id = isset($input['id']) ? $input['id'] : '';
        $qty = isset($input['qty']) ? (int)$input['qty'] : 0;
        if ($qty <= 0) json_out(400, array('error' => 'количество'));
        $offers = load_json($marketFile, array());
        $offerIdx = -1;
        foreach ($offers as $i => $o) { if ($o['id'] === $id) { $offerIdx = $i; break; } }
        if ($offerIdx < 0) json_out(404, array('error' => 'предложение не найдено'));
        $offer = $offers[$offerIdx];
        if ($offer['email'] === norm($me['Email'])) json_out(400, array('error' => 'нельзя купить у себя'));
        $qty = min($qty, (int)$offer['qty']);
        $sum = round($qty * (float)$offer['price'], 2);
        $bIdx = find_user($users, $me['Email']);
        $sIdx = find_user($users, $offer['email']);
        if ($sIdx < 0) json_out(404, array('error' => 'продавец не найден'));
        $buyer = profile_of($users, $bIdx);
        $seller = profile_of($users, $sIdx);
        $credits = isset($buyer['credits']) ? (float)$buyer['credits'] : 0;
        if ($credits < $sum) json_out(400, array('error' => 'не хватает кредитов'));
        $buyer['credits'] = $credits - $sum;
        $seller['credits'] = (isset($seller['credits']) ? (float)$seller['credits'] : 0) + $sum;
        $buyer['resources'][$offer['resource']] = (isset($buyer['resources'][$offer['resource']]) ? (int)$buyer['resources'][$offer['resource']] : 0) + $qty;
        profile_store($users, $bIdx, $buyer);
        profile_store($users, $sIdx, $seller);
        $offers[$offerIdx]['qty'] = (int)$offer['qty'] - $qty;
        if ($offers[$offerIdx]['qty'] <= 0) { unset($offers[$offerIdx]); $offers = array_values($offers); }
        save_json($usersFile, $users);
        save_json($marketFile, $offers);
        json_out(200, array('bought' => $qty, 'sum' => $sum));


    // ---------------- ЗВАНИЯ ----------------

    case 'rank_check':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $rankMap = load_json($ranksFile, array());
        $emailKey = norm($me['Email']);
        $stored = isset($rankMap[$emailKey]) ? $rankMap[$emailKey] : null;
        $r = rank_evaluate($profile, $stored);
        $ranks = rank_table();
        if ($r['index'] > $r['from']) {
            $rankMap[$emailKey] = $ranks[$r['index']]['id'];
            save_json($ranksFile, $rankMap);
            $profile['rankId'] = $ranks[$r['index']]['id'];
            $profile['rank'] = $ranks[$r['index']]['name'];
            if ($r['bonus'] > 0) {
                $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $r['bonus'];
            }
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
        }
        $finalId = isset($rankMap[$emailKey]) ? $rankMap[$emailKey] : (isset($profile['rankId']) ? $profile['rankId'] : 'cadet');
        $finalName = 'Капитан-стажёр';
        foreach ($ranks as $rr) { if ($rr['id'] === $finalId) { $finalName = $rr['name']; break; } }
        json_out(200, array(
            'rankId' => $finalId,
            'rank' => $finalName,
            'promoted' => $r['index'] - $r['from'],
            'bonus' => $r['bonus'],
            'credits' => isset($profile['credits']) ? $profile['credits'] : 0,
            'metrics' => $r['metrics'],
        ));


    // ---------------- NPC-РЫНОК ----------------

    case 'npcmarket_quote':
        $state = npc_state($npcFile);
        $out = array();
        foreach (npc_goods() as $k => $g) {
            $out[$k] = array(
                'stock' => (int)$state['stock'][$k],
                'buy' => round(npc_price($state, $k) * 1.05, 2),
                'sell' => round(npc_price($state, $k) * 0.95, 2),
            );
        }
        json_out(200, array('prices' => $out));

    case 'npcmarket_trade':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $key = isset($input['key']) ? $input['key'] : '';
        $qty = isset($input['qty']) ? (int)$input['qty'] : 0;
        $side = isset($input['side']) && $input['side'] === 'sell' ? 'sell' : 'buy';
        $goods = npc_goods();
        if (!isset($goods[$key])) json_out(400, array('error' => 'неизвестный товар'));
        if ($qty <= 0) json_out(400, array('error' => 'количество'));
        $state = npc_state($npcFile);
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $have = isset($profile['resources'][$key]) ? (int)$profile['resources'][$key] : 0;
        $unit = npc_price($state, $key);
        if ($side === 'buy') {
            $unit *= 1.03;
            // оптовый контракт торговца: закупка на 15% дешевле
            if (!empty($profile['contracts']['wholesale']) && (int)$profile['contracts']['wholesale'] > time()) {
                $unit *= 0.85;
            }
            $sum = $unit * $qty;
            if ((int)$state['stock'][$key] < $qty) json_out(400, array('error' => 'на складе NPC только ' . (int)$state['stock'][$key]));
            if ($credits < $sum) json_out(400, array('error' => 'не хватает кредитов'));
            $profile['credits'] = $credits - $sum;
            $profile['resources'][$key] = $have + $qty;
            $state['stock'][$key] = (int)$state['stock'][$key] - $qty;
        } else {
            $unit *= 0.97;
            if ($have < $qty) json_out(400, array('error' => 'на складе только ' . $have));
            $sum = $unit * $qty;
            $profile['credits'] = $credits + $sum;
        quest_mark($profile, 'sold');
            $profile['resources'][$key] = $have - $qty;
            $state['stock'][$key] = min($goods[$key]['norm'] * 3, (int)$state['stock'][$key] + $qty);
        }
        $state['updated'] = time();
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        save_json($npcFile, $state);
        json_out(200, array('sum' => round($sum, 2), 'price' => round($unit, 2), 'credits' => $profile['credits'], 'have' => $profile['resources'][$key]));


    // ---------------- КОЛОНИЯ ----------------

    case 'colony_found':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (isset($profile['colony']) && is_array($profile['colony'])) json_out(400, array('error' => 'колония уже есть'));
        // до чужой системы надо долететь: нужен хотя бы один корабль в доке
        $ships = isset($profile['ships']) && is_array($profile['ships']) ? count($profile['ships']) : 0;
        if ($ships < 1) json_out(400, array('error' => 'нужен корабль: сначала постройте его в доке'));
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < 150000) json_out(400, array('error' => 'нужно 150 000 кредитов на колонию'));
        $profile['credits'] = $credits - 150000;
        $profile['colony'] = colony_defaults();
        // корабль-колонизатор садится на луну и перестраивается в жилой модуль и док
        $used = null;
        foreach ($profile['ships'] as $i => $sh) {
            $used = $i;
            if (isset($sh['id']) && $sh['id'] === 'jet_hauler') break;   // грузовик — лучший вариант
        }
        if ($used !== null) array_splice($profile['ships'], $used, 1);
        $profile['colony']['habitat'] = 1;   // жилой модуль из корпуса колонизатора
        $profile['colony']['docks'] = 1;     // док для обслуживания флота на месте
        quest_mark($profile, 'colony');
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $profile['colony'], 'credits' => $profile['credits']));

    case 'colony_tick':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $now = time();
        $last = isset($profile['colony']['lastTick']) ? (int)$profile['colony']['lastTick'] : $now;
        $days = ($now - $last) / 86400.0;
        $report = colony_step($profile, $days);
        $profile['colony']['lastTick'] = $now;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array(
            'colony' => $profile['colony'],
            'credits' => isset($profile['credits']) ? $profile['credits'] : 0,
            'resources' => array(
                'grain' => isset($profile['resources']['grain']) ? $profile['resources']['grain'] : 0,
                'water' => isset($profile['resources']['water']) ? $profile['resources']['water'] : 0,
            ),
            'report' => $report,
        ));


    // ---------------- ЧАТ ----------------

    case 'chat_list':
        $messages = load_json($chatFile, array());
        $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
        $out = array();
        foreach ($messages as $m) { if ((int)$m['id'] > $since) $out[] = $m; }
        if (count($out) > 200) $out = array_slice($out, -200);
        json_out(200, array('messages' => $out, 'serverTime' => time()));

    case 'chat_tips':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = $idx >= 0 ? profile_of($users, $idx) : array();
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $ships = isset($profile['ships']) && is_array($profile['ships']) ? $profile['ships'] : array();
        $colony = !empty($profile['colony']);
        $steel = isset($profile['resources']['steel']) ? (float)$profile['resources']['steel'] : 0;

        $tips = array();
        if (empty($ships)) {
            $tips[] = 'Первым делом нужен корабль: «🚀 Флот» → «Искра» (18 000 кр, 60 кг стали, 20 меди, 10 никеля, 8 чипов, 12 плат). Без него не выйти со станции.';
            if ($credits < 18000) {
                $tips[] = 'Кредитов ' . round($credits) . '. Продайте излишки на «📈 Бирже» — сталь и медь покупают всегда.';
            }
            if ($steel < 60) {
                $tips[] = 'Стали только ' . round($steel) . ' кг. Купите 60 кг на бирже (около 12 кр за кг) — иначе корабль не собрать.';
            }
        } elseif (!$colony) {
            $need = 150000 - $credits;
            if ($need > 0) {
                $tips[] = 'Корабль есть. Следующая цель — колония: нужно 300 000 кр, не хватает ' . round($need) . '.';
                $tips[] = 'Источники денег: биржа (продажа ресурсов), разведка астероидов (3 000 кр за рейс), налоги будущей колонии.';
            } else {
                $tips[] = 'Денег достаточно: «🏙 Колония» → Основать. Корабль уйдёт на перевозку людей.';
            }
        } else {
            $tips[] = 'Колония основана. Держите запас зерна и воды: 0,3 кг и 0,003 т на человека в день.';
            $tips[] = 'Дальше — налоги (ставка 15–20 % даёт рост), аванпост на луне (+2 энергии) и газовый завод.';
        }
        $tips[] = 'Авария на станции: меню «🚨 Авария на станции» — починить реактор за 120 секунд и получить энергию с кредитами.';

        json_out(200, array('name' => 'Советник', 'tips' => $tips, 'ts' => time()));

    case 'chat_send':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $text = isset($input['text']) ? trim($input['text']) : '';
        if ($text === '') json_out(400, array('error' => 'пустое сообщение'));
        if (function_exists('mb_strlen')) { $len = mb_strlen($text, 'UTF-8'); } else { $len = strlen($text); }
        if ($len > 300) json_out(400, array('error' => 'не длиннее 300 символов'));
        $messages = load_json($chatFile, array());
        $email = norm($me['Email']);
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            if ($messages[$i]['email'] !== $email) continue;
            if (time() - (int)$messages[$i]['ts'] < 3) json_out(429, array('error' => 'слишком часто'));
            break;
        }
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $lastId = 0;
        foreach ($messages as $m) { if ((int)$m['id'] > $lastId) $lastId = (int)$m['id']; }
        $msg = array(
            'id' => $lastId + 1,
            'email' => $email,
            'name' => isset($profile['gameName']) ? $profile['gameName'] : $email,
            'faction' => isset($profile['faction']) ? $profile['faction'] : '',
            'text' => $text,
            'ts' => time(),
        );
        $messages[] = $msg;
        if (count($messages) > 500) $messages = array_slice($messages, -500);
        save_json($chatFile, $messages);
        $uidx = find_user($users, $me['Email']);
        if ($uidx >= 0) {
            $uprof = profile_of($users, $uidx);
            if (quest_mark($uprof, 'chat')) {
                profile_store($users, $uidx, $uprof);
                save_json($usersFile, $users);
            }
        }
        json_out(200, array('message' => $msg));

    case 'quests':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $defs = quest_defs();
        $done = isset($profile['quests']) && is_array($profile['quests']) ? $profile['quests'] : array();
        $list = array();
        foreach ($defs as $key => $d) {
            $list[] = array(
                'key' => $key, 'title' => $d['title'], 'hint' => $d['hint'],
                'reward' => $d['reward'], 'done' => !empty($done[$key]),
                'at' => !empty($done[$key]) ? (int)$done[$key] : 0,
            );
        }
        $granted = ach_evaluate($profile);
        if ($granted) { profile_store($users, $idx, $profile); save_json($usersFile, $users); }
        $adefs = ach_defs();
        $adone = isset($profile['achievements']) && is_array($profile['achievements']) ? $profile['achievements'] : array();
        $achievements = array();
        foreach ($adefs as $key => $a) {
            $achievements[] = array(
                'key' => $key, 'title' => $a['title'],
                'credits' => $a['credits'], 'crystals' => $a['crystals'],
                'done' => !empty($adone[$key]),
            );
        }
        json_out(200, array('quests' => $list, 'achievements' => $achievements,
            'granted' => $granted,
            'credits' => isset($profile['credits']) ? $profile['credits'] : 0,
            'eternity' => isset($profile['resources']['eternity']) ? $profile['resources']['eternity'] : 0));

    // найм переселенцев: платить можно деньгами и зерном вперемешку
    case 'plans_save':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $raw = isset($input['plans']) && is_array($input['plans']) ? $input['plans'] : array();
        $allowed = array('build_ship', 'sell', 'buy', 'hire', 'colony_tick', 'build_factory');
        $ships = array('jet_scout', 'jet_hauler', 'ion_courier', 'ion_prospector', 'ion_corsair');
        $out = array();
        foreach ($raw as $pl) {
            if (count($out) >= 10) break;
            if (!is_array($pl)) continue;
            $action = isset($pl['action']) ? (string)$pl['action'] : '';
            if (!in_array($action, $allowed, true)) continue;
            $arg = isset($pl['arg']) ? $pl['arg'] : '';
            if ($action === 'build_ship' && !in_array($arg, $ships, true)) $arg = 'jet_scout';
            if (in_array($action, array('sell', 'buy'), true)) $arg = max(1, min(100000, (int)$arg));
            if ($action === 'hire') $arg = max(1, min(5000, (int)$arg));
            $out[] = array(
                'enabled' => !empty($pl['enabled']),
                'when' => isset($pl['when']) ? mb_substr((string)$pl['when'], 0, 20) : 'every_10',
                'action' => $action,
                'arg' => $arg,
                'lastRun' => isset($pl['lastRun']) ? (int)$pl['lastRun'] : 0,
            );
        }
        $profile['plans'] = $out;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('plans' => $out));

    case 'plans_list':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        json_out(200, array('plans' => isset($profile['plans']) && is_array($profile['plans']) ? $profile['plans'] : array()));

    case 'design_save':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $m = isset($input['model']) && is_array($input['model']) ? $input['model'] : null;
        if (!$m || empty($m['parts']) || !is_array($m['parts'])) json_out(400, array('error' => 'пустая модель'));
        $parts = array();
        $allowed = array('pad', 'slab', 'column', 'beam', 'truss', 'ring', 'tank', 'ladder',
                         'pipe', 'cable', 'antenna', 'gantry', 'rail', 'winch');
        foreach ($m['parts'] as $pt) {
            if (count($parts) >= 400) break;
            if (!is_array($pt)) continue;
            $type = isset($pt['type']) ? (string)$pt['type'] : '';
            if (!in_array($type, $allowed, true)) continue;
            $clean = array('type' => $type);
            foreach (array('x', 'y', 'z', 'w', 'h', 'd', 'r') as $k) {
                if (isset($pt[$k])) $clean[$k] = max(-500, min(500, (float)$pt[$k]));
            }
            if (isset($pt['color'])) $clean['color'] = preg_replace('/[^#a-fA-F0-9x]/', '', (string)$pt['color']);
            if (isset($pt['label'])) $clean['label'] = mb_substr((string)$pt['label'], 0, 60);
            $parts[] = $clean;
        }
        $profile['design'] = array(
            'title' => isset($m['title']) ? mb_substr((string)$m['title'], 0, 80) : 'Модель',
            'parts' => $parts,
            'ts' => time(),
        );
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('parts' => count($parts)));

    case 'design_load':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        json_out(200, array('model' => isset($profile['design']) ? $profile['design'] : null));

    case 'planet_save':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $world = isset($input['world']) ? preg_replace('/[^a-z0-9_-]/i', '', (string)$input['world']) : '';
        if ($world === '') json_out(400, array('error' => 'не указан мир'));
        $script = isset($input['script']) ? (string)$input['script'] : '';
        if (mb_strlen($script) > 30000) json_out(400, array('error' => 'слишком большая застройка'));
        if (!isset($profile['planets']) || !is_array($profile['planets'])) $profile['planets'] = array();
        $profile['planets'][$world] = array('script' => $script, 'ts' => time());
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('world' => $world, 'blocks' => substr_count($script, "\n")));

    case 'planet_load':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $world = isset($_GET['world']) ? preg_replace('/[^a-z0-9_-]/i', '', (string)$_GET['world']) : '';
        $all = isset($profile['planets']) && is_array($profile['planets']) ? $profile['planets'] : array();
        json_out(200, array('world' => $world,
            'script' => isset($all[$world]['script']) ? $all[$world]['script'] : '',
            'worlds' => array_keys($all)));

    case 'scene_save':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $script = isset($input['script']) ? (string)$input['script'] : '';
        if (mb_strlen($script) < 5) json_out(400, array('error' => 'пустая сцена'));
        if (mb_strlen($script) > 20000) json_out(400, array('error' => 'скрипт сцены до 20 000 символов'));
        $name = isset($input['name']) ? mb_substr((string)$input['name'], 0, 60) : 'Сцена';
        $scenes = load_json($dataDir . '/scenes.json', array());
        $id = 1;
        foreach ($scenes as $sc) { if ((int)$sc['id'] >= $id) $id = (int)$sc['id'] + 1; }
        $scenes[] = array('id' => $id, 'email' => norm($me['Email']), 'name' => $name,
            'script' => $script, 'ts' => time());
        if (count($scenes) > 300) $scenes = array_slice($scenes, -300);
        save_json($dataDir . '/scenes.json', $scenes);
        json_out(200, array('id' => $id, 'name' => $name));

    case 'scene_list':
        $scenes = load_json($dataDir . '/scenes.json', array());
        $out = array();
        foreach (array_slice($scenes, -40) as $sc) {
            $out[] = array('id' => (int)$sc['id'], 'name' => $sc['name'],
                'script' => $sc['script'], 'ts' => (int)$sc['ts']);
        }
        json_out(200, array('scenes' => $out));

    case 'reactor_start':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (empty($profile['ships'])) json_out(400, array('error' => 'нужен корабль, чтобы долететь до станции'));
        $now = time();
        $cd = isset($profile['reactorCooldown']) ? (int)$profile['reactorCooldown'] : 0;
        if ($cd > $now) json_out(429, array('error' => 'следующая авария через ' . ceil(($cd - $now) / 60) . ' мин'));

        $scenarios = array(
            'overheat' => array(
                'title' => 'Перегрев контура',
                'brief' => 'Температура в первом контуре растёт: 2 400 °C и выше. Плазма ещё держится.',
                'order' => array('gate', 'coolant', 'gas', 'valve', 'coil', 'core'),
            ),
            'rupture' => array(
                'title' => 'Разрыв контура',
                'brief' => 'Давление сорвало трубу: пар в коридоре, стрелка манометра в красной зоне.',
                'order' => array('gate', 'valve', 'gas', 'coolant', 'coil', 'core'),
            ),
            'drift' => array(
                'title' => 'Сбой удержания',
                'brief' => 'Плазма уходит к стенке камеры: магнитное поле нестабильно, счёт на секунды.',
                'order' => array('gate', 'coil', 'gas', 'valve', 'coolant', 'core'),
            ),
        );
        $keys = array_keys($scenarios);
        $pick = $keys[array_rand($keys)];
        $sc = $scenarios[$pick];

        $session = array(
            'token' => bin2hex(random_bytes(8)),
            'started' => $now,
            'limit' => 120,
            'scenario' => $pick,
            'title' => $sc['title'],
            'brief' => $sc['brief'],
            'order' => $sc['order'],
            'done' => array(),
            'hints' => 0,
        );
        $profile['reactor'] = $session;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array(
            'token' => $session['token'],
            'limit' => $session['limit'],
            'steps' => count($session['order']),
            'scenario' => $pick,
            'title' => $sc['title'],
            'brief' => $sc['brief'],
        ));

    case 'reactor_hint':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (empty($profile['reactor']['token'])) json_out(400, array('error' => 'авария не начата'));
        $r = $profile['reactor'];
        if (!isset($input['token']) || $input['token'] !== $r['token']) json_out(400, array('error' => 'сессия устарела'));
        $next = $r['order'][count($r['done'])];
        $penalty = 10;
        $r['started'] -= $penalty;          // подсказка стоит 10 секунд
        $r['hints'] = (int)(isset($r['hints']) ? $r['hints'] : 0) + 1;
        $profile['reactor'] = $r;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('next' => $next, 'penalty' => $penalty, 'hints' => $r['hints']));

    case 'reactor_step':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (empty($profile['reactor']['token'])) json_out(400, array('error' => 'авария не начата'));
        $r = $profile['reactor'];
        if (isset($input['token']) && $input['token'] !== $r['token']) json_out(400, array('error' => 'сессия устарела'));
        $step = isset($input['step']) ? (string)$input['step'] : '';
        $elapsed = time() - (int)$r['started'];
        if ($elapsed > (int)$r['limit'] + 5) {
            unset($profile['reactor']);
            $profile['reactorCooldown'] = time() + 1800;
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
            json_out(400, array('error' => 'время вышло: станция потеряна', 'lost' => true));
        }
        $expected = $r['order'][count($r['done'])];
        if ($step !== $expected) {
            unset($profile['reactor']);
            $profile['reactorCooldown'] = time() + 1800;
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
            json_out(400, array('error' => 'неверное действие: плазма вырвалась', 'lost' => true));
        }
        $r['done'][] = $step;
        $profile['reactor'] = $r;
        $finished = count($r['done']) >= count($r['order']);
        $reward = null;
        if ($finished) {
            unset($profile['reactor']);
            $profile['reactorCooldown'] = time() + 6 * 3600;
            // быстрее — щедрее
            if ($elapsed <= 45) { $cr = 3; $money = 30000; $grade = 'S'; }
            elseif ($elapsed <= 75) { $cr = 2; $money = 20000; $grade = 'A'; }
            else { $cr = 1; $money = 15000; $grade = 'B'; }
            $profile['energy'] = (int)(isset($profile['energy']) ? $profile['energy'] : 0) + 800;
            $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $money;
            $profile['crystals'] = (int)(isset($profile['crystals']) ? $profile['crystals'] : 0) + $cr;
            $reward = array('energy' => 800, 'credits' => $money, 'crystals' => $cr, 'grade' => $grade);
        }
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('step' => $step, 'done' => count($r['done']), 'total' => count($r['order']),
            'finished' => $finished, 'elapsed' => $elapsed,
            'reward' => $reward,
            'cooldown' => $finished ? 6 * 3600 : 0));

    case 'contract_buy':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $type = isset($input['type']) ? $input['type'] : '';
        if ($type !== 'wholesale') json_out(400, array('error' => 'неизвестный контракт'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $now = time();
        $until = isset($profile['contracts']['wholesale']) ? (int)$profile['contracts']['wholesale'] : 0;
        if ($until > $now) {
            json_out(400, array('error' => 'контракт уже действует до ' . date('d.m.Y', $until)));
        }
        $price = 50000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
        $profile['credits'] = $credits - $price;
        if (!isset($profile['contracts']) || !is_array($profile['contracts'])) $profile['contracts'] = array();
        $profile['contracts']['wholesale'] = $now + 30 * 86400;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('type' => 'wholesale', 'until' => $profile['contracts']['wholesale'],
            'credits' => $profile['credits'], 'discount' => 0.15));

    case 'hire':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $count = isset($input['count']) ? (int)$input['count'] : 0;
        if ($count < 100 || $count > 100000) json_out(400, array('error' => 'от 100 до 100 000 человек'));
        $source = isset($input['source']) ? $input['source'] : 'earth';
        $prices = array('earth' => 1200, 'mars' => 2000, 'astral' => 1500);
        if (!isset($prices[$source])) json_out(400, array('error' => 'неизвестный источник'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $grain = isset($profile['resources']['grain']) ? (float)$profile['resources']['grain'] : 0;

        $pricePer = $prices[$source];           // кр за человека
        $full = $count * $pricePer;
        // зерно принимаем по 10 кр за кг (рынок ~4), не больше половины суммы и не больше склада
        $grainPerPerson = 3;                     // до 3 кг на человека
        $grainRate = 10;
        $payGrain = min($grain, (float)($count * $grainPerPerson), (float)floor($full / 2 / $grainRate));
        $payCredits = $full - $payGrain * $grainRate;
        if ($credits < $payCredits) {
            json_out(400, array('error' => 'нужно ' . (int)$payCredits . ' кр (или больше зерна)'));
        }
        $profile['credits'] = $credits - $payCredits;
        $profile['resources']['grain'] = $grain - $payGrain;
        if (!isset($profile['colonists']) || !is_array($profile['colonists'])) {
            // старый формат мог быть числом — переносим в землян
            $old = isset($profile['colonists']) ? (int)$profile['colonists'] : 0;
            $profile['colonists'] = array('earth' => $old, 'mars' => 0, 'astral' => 0);
        }
        $profile['colonists'][$source] = (isset($profile['colonists'][$source]) ? (int)$profile['colonists'][$source] : 0) + $count;
        $profile['colonistsTotal'] = array_sum($profile['colonists']);
        quest_mark($profile, 'hire');
        if (!isset($profile['colony']) || !is_array($profile['colony'])) {
            // пока колонии нет — люди ждут на корабле-носителе
        } else {
            $profile['colony']['population'] = (float)$profile['colony']['population'] + $count;
        }
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('hired' => $count, 'source' => $source, 'paidCredits' => $payCredits, 'paidGrain' => (int)$payGrain,
            'credits' => $profile['credits'], 'grain' => (int)$profile['resources']['grain'],
            'colonists' => $profile['colonists'], 'colonistsTotal' => $profile['colonistsTotal']));

    // модернизация корабля: нужны мастерские, платим кредитами и сталью
    case 'ship_upgrade':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $index = isset($input['index']) ? (int)$input['index'] : -1;
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['ships'][$index])) json_out(400, array('error' => 'такого корабля нет'));
        $workshops = isset($profile['workshops']) ? (int)$profile['workshops'] : 0;
        if ($workshops < 1) json_out(400, array('error' => 'нужна хотя бы одна ремонтная мастерская'));
        $level = isset($profile['ships'][$index]['level']) ? (int)$profile['ships'][$index]['level'] : 0;
        if ($level >= $workshops) json_out(400, array('error' => 'уровень ограничен числом мастерских: ' . $workshops));
        $marsC = isset($profile['colonists']['mars']) ? (int)$profile['colonists']['mars'] : 0;
        $marsDiscount = min(0.4, $marsC / 100000 * 0.4);   // технократы дешевле модернизируют
        $price = (int)round(50000 * ($level + 1) * (1 - $marsDiscount));
        $steelNeed = (int)round(100 * ($level + 1) * (1 - $marsDiscount));
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
        if ($steel < $steelNeed) json_out(400, array('error' => 'нужно ' . $steelNeed . ' т стали'));
        $profile['credits'] = $credits - $price;
        $profile['resources']['steel'] = $steel - $steelNeed;
        $profile['ships'][$index]['level'] = $level + 1;
        quest_mark($profile, 'upgrade');
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('level' => $level + 1, 'credits' => $profile['credits'],
            'steel' => $profile['resources']['steel'], 'cost' => $price));

    case 'rent':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $what = isset($input['what']) ? $input['what'] : '';
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $slots = isset($profile['dockSlots']) ? (int)$profile['dockSlots'] : 2;
        $workshops = isset($profile['workshops']) ? (int)$profile['workshops'] : 0;

        if ($what === 'dock') {
            $price = 25000 * $slots;      // 3-е место 50 000, 4-е 75 000: аренда не должна съедать колонию
            if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
            $profile['credits'] = $credits - $price;
            $profile['dockSlots'] = $slots + 1;
            $value = $slots + 1;
        } elseif ($what === 'workshop') {
            $price = 120000 + 60000 * $workshops;   // каждая следующая мастерская дороже
            if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
            $profile['credits'] = $credits - $price;
            $profile['workshops'] = $workshops + 1;
            $value = $workshops + 1;
        } else {
            json_out(400, array('error' => 'неизвестная аренда'));
        }
        quest_mark($profile, 'rent');
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('what' => $what, 'value' => $value, 'credits' => $profile['credits'],
            'dockSlots' => $profile['dockSlots'], 'workshops' => isset($profile['workshops']) ? $profile['workshops'] : 0));

    // ---------------- ЛУНЫ И ГАЗ ----------------

    // ---------------- ПОЖЕЛАНИЯ К РАЗВИТИЮ ----------------

    case 'feedback_purge':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        if (!isset($me['Role']) || $me['Role'] !== 'admin') json_out(403, array('error' => 'только администратор'));
        $list = load_json($feedbackFile, array());
        $removed = 0;
        foreach ($list as $i => $f) {
            if (!isset($f['attachments']) || !is_array($f['attachments']) || !count($f['attachments'])) continue;
            if (empty($f['filesRemoved']) && in_array($f['status'], array('new', 'review'), true)) continue;
            foreach ($f['attachments'] as $att) {
                $rel = isset($att['url']) ? (string)$att['url'] : '';
                if (strpos($rel, '/uploads/feedback/') !== 0) continue;
                $path = __DIR__ . $rel;
                if (is_file($path) && @unlink($path)) $removed++;
            }
            $list[$i]['filesRemoved'] = true;
        }
        save_json($feedbackFile, $list);
        $tmp = $dataDir . '/uploads-tmp';
        if (is_dir($tmp)) {
            foreach (glob($tmp . '/*.part') as $part) {
                if (time() - filemtime($part) > 3600) @unlink($part);
            }
        }
        json_out(200, array('removed' => $removed));

    case 'feedback_upload':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $uploadId = isset($input['uploadId']) ? preg_replace('/[^a-f0-9]/', '', (string)$input['uploadId']) : '';
        if (strlen($uploadId) < 8) json_out(400, array('error' => 'неверный идентификатор загрузки'));
        $chunkIndex = isset($input['chunkIndex']) ? (int)$input['chunkIndex'] : 0;
        $chunks = isset($input['chunks']) ? (int)$input['chunks'] : 1;
        $name = isset($input['name']) ? (string)$input['name'] : 'file';
        $data = isset($input['data']) ? (string)$input['data'] : '';
        if ($data === '') json_out(400, array('error' => 'пустой фрагмент'));
        $bin = base64_decode($data, true);
        if ($bin === false) json_out(400, array('error' => 'фрагмент повреждён'));

        $tmpDir = $dataDir . '/uploads-tmp';
        if (!is_dir($tmpDir)) @mkdir($tmpDir, 0775, true);
        $part = $tmpDir . '/' . $uploadId . '.part';
        if (file_put_contents($part, $bin, FILE_APPEND) === false) json_out(500, array('error' => 'не удалось сохранить фрагмент'));

        if ($chunkIndex + 1 < $chunks) {
            json_out(200, array('chunk' => $chunkIndex, 'done' => false));
        }

        $size = filesize($part);
        $head = file_get_contents($part, false, null, 0, 16);
        $types = array(
            "\xFF\xD8\xFF" => array('ext' => 'jpg', 'kind' => 'image'),
            "\x89PNG\r\n\x1a\n" => array('ext' => 'png', 'kind' => 'image'),
            'RIFF' => array('ext' => 'webp', 'kind' => 'image'),
            'GIF8' => array('ext' => 'gif', 'kind' => 'image'),
            "\x1A\x45\xDF\xA3" => array('ext' => 'webm', 'kind' => 'video'),
            'ftyp' => array('ext' => 'mp4', 'kind' => 'video'),
        );
        $detected = null;
        foreach ($types as $sig => $info) {
            if (strpos($head, $sig) === 0 || strpos($head, $sig) === 4) { $detected = $info; break; }
        }
        if (!$detected) { @unlink($part); json_out(400, array('error' => 'только картинки (jpg, png, webp, gif) или видео (mp4, webm)')); }
        $maxImage = 8 * 1024 * 1024;
        $maxVideo = 40 * 1024 * 1024;
        if ($detected['kind'] === 'image' && $size > $maxImage) { @unlink($part); json_out(400, array('error' => 'картинка больше 8 МБ')); }
        if ($detected['kind'] === 'video' && $size > $maxVideo) { @unlink($part); json_out(400, array('error' => 'видео больше 40 МБ')); }

        $dir = __DIR__ . '/uploads/feedback';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $stored = $uploadId . '.' . $detected['ext'];
        $target = $dir . '/' . $stored;
        if (!@rename($part, $target)) {
            if (!@copy($part, $target)) { @unlink($part); json_out(500, array('error' => 'не удалось сохранить файл')); }
            @unlink($part);
        }
        @chmod($target, 0644);
        json_out(200, array('done' => true, 'url' => '/uploads/feedback/' . $stored,
            'kind' => $detected['kind'], 'name' => $name, 'size' => $size));

    case 'feedback_send':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $text = isset($input['text']) ? trim($input['text']) : '';
        if (function_exists('mb_strlen')) { $len = mb_strlen($text, 'UTF-8'); } else { $len = strlen($text); }
        if ($len < 3) json_out(400, array('error' => 'напишите хотя бы пару слов'));
        if ($len > 4000) json_out(400, array('error' => 'не длиннее 4000 символов'));
    $attachments = array();
    if (isset($input['attachments']) && is_array($input['attachments'])) {
        foreach ($input['attachments'] as $att) {
            if (count($attachments) >= 5) break;
            if (!is_array($att)) continue;
            $url = isset($att['url']) ? (string)$att['url'] : '';
            if (!preg_match('#^/uploads/feedback/[a-f0-9]{16,}\.(jpg|png|webp|gif|mp4|webm)$#', $url)) continue;
            $attachments[] = array(
                'url' => $url,
                'kind' => (isset($att['kind']) && $att['kind'] === 'video') ? 'video' : 'image',
                'name' => isset($att['name']) ? mb_substr((string)$att['name'], 0, 80) : '',
            );
        }
    }
        $list = load_json($feedbackFile, array());
        $email = norm($me['Email']);
        for ($i = count($list) - 1; $i >= 0; $i--) {
            if ($list[$i]['email'] === $email) {
                if (time() - (int)$list[$i]['ts'] < 60) json_out(429, array('error' => 'слишком часто: раз в минуту'));
                break;
            }
        }
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $lastId = 0;
        foreach ($list as $f) { if ((int)$f['id'] > $lastId) $lastId = (int)$f['id']; }
        $kinds = array('idea', 'ship', 'building', 'equipment');
        $kind = isset($input['kind']) ? $input['kind'] : 'idea';
        if (!in_array($kind, $kinds, true)) $kind = 'idea';
        $entry = array(
            'id' => $lastId + 1,
            'email' => $email,
            'name' => isset($profile['gameName']) ? $profile['gameName'] : $email,
            'kind' => $kind,
            'text' => $text,
            'attachments' => $attachments,
            'ts' => time(),
            'read' => false,
            'status' => 'new',      // new → review → accepted / rejected
            'reward' => 0,
            'comment' => '',
            'seen' => false,
        );
        $list[] = $entry;
        if (count($list) > 1000) $list = array_slice($list, -1000);
        save_json($feedbackFile, $list);

        // задание «Предложить идею по развитию»: бонус один раз за первую идею
        $bonus = quest_mark($profile, 'idea');
        if ($bonus) {
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
        }
        json_out(200, array('entry' => $entry,
            'quest' => $bonus ? array('title' => $bonus['title'], 'credits' => $bonus['reward'],
                                      'crystals' => isset($bonus['crystals']) ? $bonus['crystals'] : 0) : null,
            'credits' => isset($profile['credits']) ? $profile['credits'] : 0));

    case 'feedback_list':
        if (!$me || $me['Role'] !== 'admin') json_out(403, array('error' => 'только администратор'));
        $list = load_json($feedbackFile, array());
        $onlyNew = isset($_GET['new']) && $_GET['new'] === '1';
        $out = array();
        foreach ($list as $f) {
            if ($onlyNew && !empty($f['read'])) continue;
            if (!isset($f['status'])) $f['status'] = 'new';   // старые записи без статуса
            $out[] = $f;
        }
        json_out(200, array('feedback' => $out, 'total' => count($list), 'new' => count($out)));

    case 'feedback_review':
        if ($method !== 'POST' || !$me || $me['Role'] !== 'admin') json_out(403, array('error' => 'только администратор'));
        $id = isset($input['id']) ? (int)$input['id'] : 0;
        $status = isset($input['status']) ? $input['status'] : 'review';
        if (!in_array($status, array('new', 'review', 'accepted', 'rejected'), true)) json_out(400, array('error' => 'неизвестный статус'));
        $list = load_json($feedbackFile, array());
        $found = -1;
        foreach ($list as $i => $f) { if ((int)$f['id'] === $id) { $found = $i; break; } }
        if ($found < 0) json_out(404, array('error' => 'пожелание не найдено'));
        $list[$found]['status'] = $status;
        $list[$found]['comment'] = isset($input['comment']) ? trim($input['comment']) : '';
        $awarded = 0;
        if ($status === 'accepted') {
            $awarded = isset($input['reward']) ? max(0, min(50, (int)$input['reward'])) : 5;
            $list[$found]['reward'] = $awarded;
            // награда автору: кристаллы и запись в профиль
            $author = $list[$found]['email'];
            $uidx = find_user($users, $author);
            if ($uidx >= 0) {
                $up = profile_of($users, $uidx);
                if (!isset($up['resources']['eternity'])) $up['resources']['eternity'] = 0;
                $up['resources']['eternity'] += $awarded;
                if (!isset($up['feedbackAccepted']) || !is_array($up['feedbackAccepted'])) $up['feedbackAccepted'] = array();
                $up['feedbackAccepted'][] = array('text' => $list[$found]['text'], 'at' => time(), 'reward' => $awarded);
                profile_store($users, $uidx, $up);
                save_json($usersFile, $users);
                $list[$found]['seen'] = false;
            }
        }
        // прочитано и разобрано — вложения с сервера удаляем
        if (($status === 'accepted' || $status === 'rejected') && !empty($list[$found]['attachments'])) {
            foreach ($list[$found]['attachments'] as $att) {
                $rel = isset($att['url']) ? (string)$att['url'] : '';
                if (strpos($rel, '/uploads/feedback/') !== 0) continue;
                $path = __DIR__ . $rel;
                if (is_file($path)) @unlink($path);
            }
            $list[$found]['filesRemoved'] = true;
        }
        save_json($feedbackFile, $list);
        json_out(200, array('id' => $id, 'status' => $status, 'awarded' => $awarded));

    case 'feedback_mine':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $email = norm($me['Email']);
        $list = load_json($feedbackFile, array());
        $mine = array();
        $notices = array();
        $changed = false;
        foreach ($list as $i => $f) {
            if ($f['email'] !== $email) continue;
            $mine[] = array('id' => $f['id'], 'text' => $f['text'], 'ts' => $f['ts'],
                'status' => isset($f['status']) ? $f['status'] : 'new',
                'reward' => isset($f['reward']) ? (int)$f['reward'] : 0,
                'comment' => isset($f['comment']) ? $f['comment'] : '');
            if (empty($f['seen']) && isset($f['status']) && in_array($f['status'], array('accepted', 'rejected'), true)) {
                $notices[] = array('id' => $f['id'], 'status' => $f['status'], 'reward' => (int)$f['reward'],
                    'comment' => isset($f['comment']) ? $f['comment'] : '');
                $list[$i]['seen'] = true;
                $changed = true;
            }
        }
        if ($changed) save_json($feedbackFile, $list);
        json_out(200, array('mine' => $mine, 'notices' => $notices));

    case 'feedback_read':
        if ($method !== 'POST' || !$me || $me['Role'] !== 'admin') json_out(403, array('error' => 'только администратор'));
        $ids = isset($input['ids']) && is_array($input['ids']) ? $input['ids'] : array();
        $list = load_json($feedbackFile, array());
        $n = 0;
        foreach ($list as $i => $f) {
            if (in_array((int)$f['id'], array_map('intval', $ids), true)) { $list[$i]['read'] = true; $n++; }
        }
        save_json($feedbackFile, $list);
        json_out(200, array('marked' => $n));

    case 'referral_info':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $code = isset($profile['refCode']) ? $profile['refCode'] : '';
        if ($code === '') {
            $code = substr(md5(norm($me['Email']) . 'glk'), 0, 8);
            $profile['refCode'] = $code;
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
        }
        $invited = 0;
        foreach ($users as $u2) {
            $p2 = json_decode(isset($u2['Profile']) ? $u2['Profile'] : '', true);
            if (is_array($p2) && isset($p2['referredBy']) && $p2['referredBy'] === norm($me['Email'])) $invited++;
        }
        json_out(200, array('code' => $code, 'invited' => $invited,
            'bonus' => array('credits' => 25000, 'crystals' => 10)));

    case 'referral_claim':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['refClaimed']) || !is_array($profile['refClaimed'])) $profile['refClaimed'] = array();
        $new = 0;
        foreach ($users as $u2) {
            $email2 = norm($u2['Email']);
            if ($email2 === norm($me['Email'])) continue;
            $p2 = json_decode(isset($u2['Profile']) ? $u2['Profile'] : '', true);
            if (!is_array($p2) || !isset($p2['referredBy']) || $p2['referredBy'] !== norm($me['Email'])) continue;
            if (in_array($email2, $profile['refClaimed'], true)) continue;
            $profile['refClaimed'][] = $email2;
            $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + 25000;
            if (!isset($profile['resources']['eternity'])) $profile['resources']['eternity'] = 0;
            $profile['resources']['eternity'] += 10;
            $profile['referrals'] = (isset($profile['referrals']) ? (int)$profile['referrals'] : 0) + 1;
            $new++;
        }
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('newRewards' => $new, 'credits' => $profile['credits'],
            'eternity' => $profile['resources']['eternity'], 'referrals' => isset($profile['referrals']) ? $profile['referrals'] : 0));

    // Очистка журнала клиентских ошибок (только администратор).
    // ---------------- ЖИВОЙ БОЙ ----------------
    case 'battle_start':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $battleFile = $dataDir . '/battles.json';
        $battles = load_json($battleFile, array());
        $key = norm($me['Email']);
        $b = battle_new($key . '-' . time(), 150, 12, 50);
        $battles[$key] = $b;
        save_json($battleFile, $battles);
        json_out(200, array('battle' => battle_summary($b), 'events' => array_slice($b['events'], -8)));

    case 'battle_tick':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $battleFile = $dataDir . '/battles.json';
        $battles = load_json($battleFile, array());
        $key = norm($me['Email']);
        if (!isset($battles[$key])) json_out(404, array('error' => 'боя нет'));
        $mins = isset($input['minutes']) ? (int)$input['minutes'] : 1;
        $battles[$key] = battle_advance($battles[$key], $mins);
        save_json($battleFile, $battles);
        json_out(200, array(
            'battle' => battle_summary($battles[$key]),
            'events' => array_slice($battles[$key]['events'], -10),
            'ships' => $battles[$key]['ships'],
            'pirates' => $battles[$key]['pirates']
        ));

    case 'battle_state':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $battleFile = $dataDir . '/battles.json';
        $battles = load_json($battleFile, array());
        $key = norm($me['Email']);
        if (!isset($battles[$key])) json_out(404, array('error' => 'боя нет'));
        json_out(200, array(
            'battle' => battle_summary($battles[$key]),
            'events' => array_slice($battles[$key]['events'], -10),
            'ships' => $battles[$key]['ships'],
            'pirates' => $battles[$key]['pirates']
        ));

    // ---------------- ПРИКАЗЫ КОРАБЛЯМ ----------------
    case 'ship_order':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $ordersFile = $dataDir . '/ship-orders.json';
        $all = load_json($ordersFile, array());
        $key = norm($me['Email']);
        $ship = isset($all[$key]) && is_array($all[$key]) ? $all[$key] : null;
        if (!$ship) {
            $ship = array('id' => 'ship-' . substr(md5($key), 0, 6), 'cls' => 'light',
                          'at' => 'earth', 'startedAt' => 0, 'orders' => array());
        }
        $world = array('bodies' => array(
            'earth' => array('x' => 0.0, 'y' => 0.0),
            'mars' => array('x' => 102.0, 'y' => 0.0),
            'jupiter' => array('x' => 527.0, 'y' => 60.0),
            'saturn' => array('x' => 620.0, 'y' => -40.0)
        ));
        $r = orders_place($ship, $world, isset($input['order']) ? $input['order'] : $input);
        if (!$r['ok']) json_out(400, array('error' => 'приказ отклонён', 'problems' => $r['errors']));
        $ship['orders'] = $r['orders'];
        $all[$key] = $ship;
        save_json($ordersFile, $all);
        json_out(200, array('ok' => true, 'status' => orders_status($ship, $world, 0)));

    case 'ship_orders':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $ordersFile = $dataDir . '/ship-orders.json';
        $all = load_json($ordersFile, array());
        $key = norm($me['Email']);
        if (!isset($all[$key])) json_out(404, array('error' => 'приказов нет'));
        json_out(200, array('ship' => $all[$key]));

    // ---------------- РАСПИСАНИЕ ЗАЕЗДОВ ----------------
    case 'race_schedule':
        json_out(200, array('ok' => true, 'schedule' => race_schedule(), 'live' => race_live()));

    // ---------------- СБОРКИ В ПРОФИЛЕ ----------------
    case 'build_save':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $file = $dataDir . '/builds.json';
        $all = load_json($file, array());
        $kind = isset($input['kind']) ? $input['kind'] : 'bolid';
        $r = build_save($all, norm($me['Email']), $kind, isset($input['data']) ? $input['data'] : array());
        if (!$r['ok']) json_out(400, array('error' => 'сборка отклонена', 'problems' => $r['errors']));
        save_json($file, $all);
        json_out(200, $r);

    case 'build_load':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $all = load_json($dataDir . '/builds.json', array());
        $kind = isset($_GET['kind']) ? $_GET['kind'] : 'bolid';
        $b = build_load($all, norm($me['Email']), $kind);
        if (!$b) json_out(404, array('error' => 'сборки нет'));
        json_out(200, array('ok' => true, 'kind' => $kind, 'build' => $b));

    // ---------------- ИГРОКИ ОНЛАЙН ----------------
    case 'presence_ping':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $file = $dataDir . '/presence.json';
        $all = load_json($file, array());
        $errs = presence_update($all, norm($me['Email']), $input);
        if ($errs) json_out(400, array('error' => 'пинг отклонён', 'problems' => $errs));
        save_json($file, $all);
        json_out(200, array('ok' => true, 'players' => presence_list($all, norm($me['Email'])), 'ttl' => PRESENCE_TTL_SEC));

    case 'players_online':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $all = load_json($dataDir . '/presence.json', array());
        json_out(200, array('ok' => true, 'players' => presence_list($all, norm($me['Email'])), 'ttl' => PRESENCE_TTL_SEC));

    // ---------------- ЗАВОД ЕДЫ ----------------
    case 'food_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $c = isset($profile['colony']) ? $profile['colony'] : null;
        if (!$c) json_out(400, array('error' => 'колонии нет'));
        $fac = isset($c['food_factories']) ? $c['food_factories'] : array();
        $cap = food_capacity($fac);
        $plan = food_plan((float)$c['population'], $fac, (float)$profile['credits'],
                          isset($profile['resources']) ? $profile['resources'] : array(), 1);
        json_out(200, array('ok' => true, 'capacity' => $cap, 'plan' => $plan,
                            'factory' => isset($c['food_factory']) ? $c['food_factory'] : null));

    case 'food_build':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $c = isset($profile['colony']) ? $profile['colony'] : null;
        if (!$c) json_out(400, array('error' => 'колонии нет'));
        $tier = isset($input['tier']) ? (int)$input['tier'] : 0;
        $count = isset($input['count']) ? max(1, (int)$input['count']) : 1;
        $cost = food_build_cost($tier, $count);
        if (!$cost) json_out(400, array('error' => 'нет такого этапа завода'));
        if ((float)$profile['credits'] < $cost['cost']) {
            json_out(400, array('error' => 'не хватает кредитов', 'need' => $cost['cost'],
                                'have' => (float)$profile['credits']));
        }
        $profile['credits'] -= $cost['cost'];
        $c['food_factories'] = isset($c['food_factories']) ? $c['food_factories'] : array();
        $found = false;
        foreach ($c['food_factories'] as &$ff) {
            if ((int)$ff['tier'] === $tier) { $ff['count'] = (int)$ff['count'] + $count; $found = true; break; }
        }
        unset($ff);
        if (!$found) $c['food_factories'][] = array('tier' => $tier, 'count' => $count);
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'built' => $cost, 'credits' => $profile['credits'],
                            'factories' => $c['food_factories']));

    // ---------------- ЭКОНОМИКА ЗРЕЛИЩ: ВАРМИР И ТАРСИС ----------------
    case 'world_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $focus = isset($profile['worldFocus']) ? $profile['worldFocus'] : 'race';
        $eventId = $focus === 'war'
            ? (isset($profile['war']['arena']) ? $profile['war']['arena'] : 'war_sphere')
            : 'race_tarsis';
        $def = world_econ_def($eventId);
        if (!$def) json_out(400, array('error' => 'нет такого события'));
        // заполняемость зависит от времени суток: утро/вечер — полные трибуны
        // ЖИВЫЕ ЗРИТЕЛИ: заполняемость от реального онлайна, а не от часа суток.
        // 25 % занято всегда (персонал, ложи), каждый игрок в игре добавляет 5 %.
        $presence = load_json($dataDir . '/presence.json', array());
        $onlineNow = count(presence_list($presence, '', null));
        $fill = min(1.0, 0.25 + 0.05 * $onlineNow);
        $guests = (int)round($def['capacity'] * $fill);
        $bal = world_event_balance($eventId, $guests);
        $next = null;
        if ($focus === 'race') {
            $sch = race_schedule();
            $next = $sch['races'][0];
        }
        json_out(200, array('ok' => true, 'focus' => $focus, 'event' => $def['event'],
                            'eventId' => $eventId, 'fill' => round($fill, 3), 'online' => $onlineNow,
                            'next' => $next, 'balance' => $bal,
                            'lastTick' => isset($profile['worldLastTick']) ? $profile['worldLastTick'] : 0));

    case 'world_tick':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $focus = isset($profile['worldFocus']) ? $profile['worldFocus'] : 'race';
        $eventId = $focus === 'war'
            ? (isset($profile['war']['arena']) ? $profile['war']['arena'] : 'war_sphere')
            : 'race_tarsis';
        $def = world_econ_def($eventId);
        if (!$def) json_out(400, array('error' => 'нет такого события'));
        // H-01: частоту задаёт сервер. force — только для админа,
        // у обычного игрока он игнорируется и он ждёт кулдаун (429 + wait_sec).
        $force = !empty($input['force']);
        $now = time();
        $last = isset($profile['worldLastTick']) ? (int)$profile['worldLastTick'] : 0;
        $gate = world_tick_gate($last, $now, $isAdmin, $force);
        if (!$gate['ok']) {
            json_out(429, array('error' => $gate['error'], 'wait_sec' => $gate['wait_sec'],
                                'cooldown' => WE_TICK_COOLDOWN));
        }
        $presence = load_json($dataDir . '/presence.json', array());
        $onlineNow = count(presence_list($presence, '', null));
        $fill = min(1.0, 0.25 + 0.05 * $onlineNow);
        $guests = (int)round($def['capacity'] * $fill);
        $bal = world_event_balance($eventId, $guests);
        $before = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $profile['credits'] = $before + (float)$bal['profit'];
        $profile['worldLastTick'] = $now;
        $profile['worldRevenue'] = (isset($profile['worldRevenue']) ? (float)$profile['worldRevenue'] : 0) + $bal['profit'];
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'event' => $def['event'], 'guests' => $guests,
                            'fill' => round($fill, 3), 'online' => $onlineNow, 'balance' => $bal,
                            'forced' => $gate['forced'], 'wait_sec' => $gate['wait_sec'],
                            'credits_before' => $before, 'credits_after' => $profile['credits']));

    // ---------------- ТРОФЕЙНАЯ КОЛЛЕКЦИЯ (TZ-261108-02) ----------------
    // Состояние — отдельный trophies.json по e-mail (profile затирается целиком).
    // Бросок делает СЕРВЕР: клиент присылает только set и roll_id (идемпотентность).
    // Кристаллы не участвуют ни в получении, ни в крафте — на попытку 400.
    case 'trophy_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $tkey = norm($me['Email']);
        $tall = load_json($trophiesFile, array());
        $tstate = (isset($tall[$tkey]) && is_array($tall[$tkey])) ? $tall[$tkey] : array();
        $tnow = time();
        trophy_normalize($tstate, $tnow);
        $tcan = trophy_can_roll($tstate, $tnow);
        $tprog = trophy_progress($tstate);
        json_out(200, array(
            'ok' => true,
            'progress' => $tprog,
            'shards' => (int)$tstate['shards'],
            'craft_cost' => trophy_craft_cost(),
            'pity' => (int)$tstate['pity'],
            'rolls' => array('used' => $tcan['used'], 'left' => $tcan['left'],
                             'limit' => $tcan['limit'], 'wait_sec' => $tcan['wait_sec'],
                             'day' => $tstate['day']),
            'bonuses' => trophy_bonuses($tstate)
        ));

    case 'trophy_roll':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        if (!empty($input['crystals']) || !empty($input['buy'])) {
            json_out(400, array('error' => 'предметы и осколки не продаются за кристаллы'));
        }
        $tkey = norm($me['Email']);
        $tall = load_json($trophiesFile, array());
        $tstate = (isset($tall[$tkey]) && is_array($tall[$tkey])) ? $tall[$tkey] : array();
        $tnow = time();
        $trollId = isset($input['roll_id']) ? (string)$input['roll_id'] : '';
        $tres = trophy_roll($tstate, isset($input['set']) ? (string)$input['set'] : '', $tnow, $trollId);
        if (empty($tres['ok'])) json_out(isset($tres['code']) ? (int)$tres['code'] : 400, $tres);
        $tall[$tkey] = $tstate;
        save_json($trophiesFile, $tall);
        $tprog = trophy_progress($tstate);
        $tres['shards_total'] = (int)$tstate['shards'];
        $tres['have'] = $tprog['have'];
        $tres['collected'] = $tprog['collected'];
        $tres['total'] = $tprog['total'];
        json_out(200, $tres);

    case 'trophy_craft':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        if (!empty($input['crystals']) || !empty($input['buy'])) {
            json_out(400, array('error' => 'крафт только за осколки, кристаллы не участвуют'));
        }
        $tkey = norm($me['Email']);
        $tall = load_json($trophiesFile, array());
        $tstate = (isset($tall[$tkey]) && is_array($tall[$tkey])) ? $tall[$tkey] : array();
        $tnow = time();
        $tres = trophy_craft($tstate,
            isset($input['set']) ? (string)$input['set'] : '',
            isset($input['item']) ? (string)$input['item'] : '', $tnow);
        if (empty($tres['ok'])) json_out(isset($tres['code']) ? (int)$tres['code'] : 400, $tres);
        $tall[$tkey] = $tstate;
        save_json($trophiesFile, $tall);
        $tprog = trophy_progress($tstate);
        $tres['have'] = $tprog['have'];
        $tres['collected'] = $tprog['collected'];
        $tres['total'] = $tprog['total'];
        json_out(200, $tres);

    // ---------------- КАЗИНО ----------------
    case 'casino_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        json_out(200, array('ok' => true, 'games' => $GLOBALS['CASINO'],
                            'credits' => isset($profile['credits']) ? (float)$profile['credits'] : 0,
                            'history' => isset($profile['casinoHistory']) ? array_slice($profile['casinoHistory'], -10) : array()));

    case 'casino_play':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $gameId = isset($input['game']) ? (string)$input['game'] : 'roulette_eu';
        $stake = isset($input['stake']) ? (float)$input['stake'] : 0;
        $chk = casino_check_bet($gameId, $stake);
        if (!$chk['ok']) json_out(400, $chk);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $stake) json_out(400, array('error' => 'не хватает кредитов', 'have' => $credits));

        $result = array();
        $payout = 0.0;   // сколько вернулось игроку (включая ставку)
        if (strpos($gameId, 'roulette_') === 0) {
            $bet = isset($input['bet']) && is_array($input['bet']) ? $input['bet'] : array('type' => 'red');
            $spin = roulette_spin($gameId);
            $mult = roulette_payout_mult($gameId, $spin['pocket'], $bet);
            if ($mult > 0 && $spin['mult'] > 1 && ($bet['type'] ?? '') === 'number') {
                $mult = $mult * $spin['mult'];
            }
            $payout = $stake * $mult;
            $result = array('pocket' => $spin['pocket'], 'mult' => $spin['mult'], 'bet' => $bet,
                            'multiplier' => $mult, 'win' => $mult > 1,
                            'color' => ($spin['pocket'] === 0 ? 'green' : (in_array($spin['pocket'], casino_red_numbers(), true) ? 'red' : 'black')));
        } elseif ($gameId === 'horses' || strpos($gameId, 'horses_') === 0) {
            $track = strpos($gameId, 'horses_') === 0 ? substr($gameId, 7) : 'ceres';
            $odds = horses_odds_for_track($track);
            $odds = array_slice($odds, 0, 8);
            $pick = isset($input['pick']) ? max(0, min(count($odds) - 1, (int)$input['pick'])) : 0;
            $winner = casino_horses_run($odds);
            $won = ($winner === $pick);
            $profit = casino_horses_payout($stake, $odds[$pick], $won, 0.15);
            $payout = $won ? $stake + $profit : 0.0;
            $result = array('winner' => $winner, 'pick' => $pick, 'odds' => $odds[$pick], 'win' => $won);
        } elseif (in_array($gameId, array('blackjack','blackjack_switch','poker_three','bridge'), true)) {
            if ($gameId === 'poker_three') {
                $hand = poker_three_deal();
                $rank = poker_three_rank($hand);
                $payout = $rank['mult'] > 0 ? $stake * (1 + $rank['mult']) : 0.0;
                $result = array('hand' => array_map(fn($c) => $c['r'], $hand), 'rank' => $rank['name'],
                                'win' => $rank['mult'] > 0, 'multiplier' => $rank['mult']);
            } elseif ($gameId === 'bridge') {
                $odds = array(1.9, 2.3, 3.1, 4.2);
                $pick = max(0, min(3, (int)($input['pick'] ?? 0)));
                $winner = bridge_round($odds);
                $won = ($winner === $pick);
                $profit = $won ? $stake * ($odds[$pick] - 1) : -$stake;
                $payout = $won ? $stake + $profit : 0.0;
                $result = array('winner' => $winner, 'pick' => $pick, 'odds' => $odds[$pick], 'win' => $won);
            } else {
                $ret = blackjack_round($gameId === 'blackjack_switch');
                $payout = $stake * $ret;
                $result = array('return_mult' => $ret, 'win' => $ret > 1, 'push' => $ret == 1.0);
            }
        } elseif ($gameId === 'sports' || strpos($gameId, 'sport_') === 0) {
            $events = casino_sports_events((int)floor(time() / 3600));
            $evIdx = isset($input['event']) ? max(0, min(2, (int)$input['event'])) : 0;
            $pick = isset($input['pick']) ? max(0, min(2, (int)$input['pick'])) : 0;
            $ev = $events[$evIdx];
            $winner = casino_sports_run($ev);
            $won = ($winner === $pick);
            $odds = $ev['odds'][$pick];
            $profit = casino_sports_settle($stake, $odds, $won);
            $payout = $won ? $stake + $profit : 0.0;
            $result = array('event' => $ev['name'], 'outcome' => $ev['outcomes'][$winner],
                            'pick' => $ev['outcomes'][$pick], 'odds' => $odds, 'win' => $won);
        } elseif (strpos($gameId, 'slot_') === 0 || $gameId === 'slots') {
            $def = casino_def($gameId);
            $rtp = $def ? (1 - (float)$def['house_edge']) : 0.96;
            $reels = slots_spin_cfg($rtp);
            $payout = slots_payout_cfg($reels, $stake, $rtp);
            $result = array('reels' => $reels, 'win' => $payout > 0, 'multiplier' => round($payout / $stake, 2));
        } else {
            json_out(400, array('error' => 'эта игра пока не подключена', 'game' => $gameId));
        }

        $profile['credits'] = $credits - $stake + $payout;
        $entry = array('game' => $gameId, 'stake' => $stake, 'payout' => round($payout, 0),
                       'net' => round($payout - $stake, 0), 'ts' => time(), 'result' => $result);
        $h = isset($profile['casinoHistory']) ? $profile['casinoHistory'] : array();
        $h[] = $entry;
        if (count($h) > 50) $h = array_slice($h, -50);
        $profile['casinoHistory'] = $h;
        $profile['casinoNet'] = (isset($profile['casinoNet']) ? (float)$profile['casinoNet'] : 0) + ($payout - $stake);
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'result' => $result, 'stake' => $stake,
                            'payout' => round($payout, 0), 'net' => round($payout - $stake, 0),
                            'credits' => $profile['credits'], 'history' => array_slice($h, -5)));

    // ---------------- НАГРУЗКА ПО СИСТЕМАМ (для будущего шардинга) ----------------
    case 'systems_load':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $all = load_json($dataDir . '/presence.json', array());
        $rows = presence_list($all, '', null);
        $bySystem = array();
        foreach ($rows as $r) {
            $sid = isset($r['system']) && $r['system'] !== '' ? $r['system'] : 'sol';
            if (!isset($bySystem[$sid])) $bySystem[$sid] = array('system' => $sid, 'players' => 0);
            $bySystem[$sid]['players']++;
        }
        // события: заезды идут по расписанию, арены — по фокусу игроков
        $races = race_schedule();
        // карта шардов: пока все системы на shard-1, вынос — по метрикам
        $shardMap = load_json($dataDir . '/shard-map.json', array());
        foreach ($bySystem as $sid => &$row) {
            $row['shard'] = isset($shardMap['systems'][$sid]) ? $shardMap['systems'][$sid]
                : (isset($shardMap['default']) ? $shardMap['default'] : 'shard-1');
        }
        unset($row);
        $out = array('ok' => true, 'systems' => array_values($bySystem),
                     'total_online' => count($rows), 'races_next' => $races['races'][0],
                     'shard_hint' => count($rows) > 0 ? 'sol' : null);
        json_out(200, $out);

    case 'shard_map':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $map = load_json($dataDir . '/shard-map.json', array());
        if (!$map) json_out(404, array('error' => 'карта шардов не найдена'));
        json_out(200, array('ok' => true, 'map' => $map));

    // ---------------- МЕТРИКИ ШАРДОВ ----------------
    // Прокси-метрики: онлайн по системам, события, размер состояния и время
    // расчёта «тика» (что считается за кадр: присутствие + расписание + баланс).
    case 'shard_metrics':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $t0 = microtime(true);
        $presence = load_json($dataDir . '/presence.json', array());
        $players = presence_list($presence, '', null);
        $t1 = microtime(true);
        $races = race_schedule();
        $t2 = microtime(true);

        $bySystem = array();
        foreach ($players as $p) {
            $sid = isset($p['system']) && $p['system'] !== '' ? $p['system'] : 'sol';
            if (!isset($bySystem[$sid])) $bySystem[$sid] = 0;
            $bySystem[$sid]++;
        }
        // события системы: у Тарсиса — расписание заездов, у Вармира — арены
        $events = array(
            'sol' => 0,
            'war' => count(world_econ_list('war')),
            'tarsis' => 1
        );
        $balWar = world_event_balance('war_sphere');
        $balRace = world_event_balance('race_tarsis');
        $t3 = microtime(true);

        $docsBytes = 0; $docsCount = 0;
        $names = store_doc_names();
        foreach ($names as $n) {
            $d = store_doc_load($n, null);
            if ($d !== null) { $docsBytes += strlen(json_encode($d)); $docsCount++; }
        }

        $map = load_json($dataDir . '/shard-map.json', array());
        $systems = array();
        $allSids = array_unique(array_merge(array_keys($events), array_keys($bySystem), array('sol', 'war', 'tarsis')));
        foreach ($allSids as $sid) {
            $systems[] = array(
                'system' => $sid,
                'shard' => isset($map['systems'][$sid]) ? $map['systems'][$sid] : (isset($map['default']) ? $map['default'] : 'shard-1'),
                'players' => isset($bySystem[$sid]) ? $bySystem[$sid] : 0,
                'events' => isset($events[$sid]) ? $events[$sid] : 0,
                'next_race_sec' => $sid === 'tarsis' ? $races['races'][0]['in_sec'] : null,
                'profit' => $sid === 'war' ? $balWar['profit'] : ($sid === 'tarsis' ? $balRace['profit'] : 0)
            );
        }
        usort($systems, function ($a, $b) { return $b['players'] - $a['players']; });

        json_out(200, array(
            'ok' => true,
            'systems' => $systems,
            'total_online' => count($players),
            'docs' => array('count' => $docsCount, 'bytes' => $docsBytes, 'kb' => round($docsBytes / 1024, 1)),
            'tick_ms' => array(
                'presence' => round(($t1 - $t0) * 1000, 2),
                'schedule' => round(($t2 - $t1) * 1000, 2),
                'econ' => round(($t3 - $t2) * 1000, 2),
                'total' => round(($t3 - $t0) * 1000, 2)
            ),
            'thresholds' => array('players_share' => 0.4, 'tick_ms' => 30.0, 'state_mb_day' => 100)
        ));

    // ---------------- РЫНОК ЕДЫ ----------------
    case 'food_market':
        $list = food_market_list();
        $ratio = food_market_ratio_check();
        json_out(200, array('ok' => true, 'kinds' => $list,
                            'rule' => array('delicacy_mult' => 10, 'fee' => FOOD_TRADE_FEE,
                                            'violations' => $ratio['violations'])));

    case 'food_trade':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $q = food_market_quote(
            isset($input['id']) ? (string)$input['id'] : '',
            isset($input['qty']) ? (float)$input['qty'] : 0,
            isset($input['side']) ? (string)$input['side'] : 'buy');
        if (!$q['ok']) json_out(400, $q);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if (!isset($profile['resources']) || !is_array($profile['resources'])) $profile['resources'] = array();
        $resKey = 'food_' . $q['id'];
        $have = isset($profile['resources'][$resKey]) ? (float)$profile['resources'][$resKey] : 0;
        if ($q['side'] === 'buy') {
            if ($credits < $q['total']) {
                json_out(400, array('error' => 'не хватает кредитов', 'need' => $q['total'], 'have' => $credits));
            }
            $profile['credits'] = $credits - $q['total'];
            $profile['resources'][$resKey] = $have + $q['qty'];
        } else {
            if ($have < $q['qty']) {
                json_out(400, array('error' => 'на складе меньше', 'have' => $have, 'need' => $q['qty']));
            }
            $profile['credits'] = $credits + $q['total'];
            $profile['resources'][$resKey] = $have - $q['qty'];
        }
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'quote' => $q, 'credits' => round($profile['credits'], 2),
                            'stock' => round($profile['resources'][$resKey], 2)));

    // ---------------- БОТЫ-ЦИВИЛИЗАЦИИ ----------------
    case 'civ_status':
        $state = civ_state_load();
        $list = array();
        foreach (civ_list() as $c) {
            $st = $state[$c['id']] ?? civ_default_state($c);
            $list[] = array(
                'id' => $c['id'], 'name' => $c['name'], 'faction' => $c['faction'],
                'home' => $c['home'], 'motto' => $c['motto'],
                'autonomy_pct' => (float)$c['autonomy_pct'],
                'state' => array(
                    'credits' => round($st['credits']), 'food' => round($st['food']),
                    'population' => (int)$st['population'], 'fleet' => (int)$st['fleet'],
                    'influence' => (int)$st['influence'], 'territory' => (int)$st['territory'],
                    'last_tick' => (int)$st['last_tick'], 'tick_no' => (int)$st['tick_no']
                ),
                'totals' => $st['totals']
            );
        }
        json_out(200, array('ok' => true, 'civs' => $list, 'autonomy' => civ_autonomy_report()));

    case 'civ_log':
        $file = $dataDir . '/civ-log.json';
        $log = is_file($file) ? (json_decode(file_get_contents($file), true) ?: array()) : array();
        json_out(200, array('ok' => true, 'total' => count($log), 'log' => array_slice($log, -50)));

    case 'civ_tick':
        if (!$me || (isset($me['Role']) && $me['Role'] !== 'admin')) {
            json_out(403, array('error' => 'только администратор'));
        }
        $res = civ_tick_all();
        json_out(200, array('ok' => true, 'tick_at' => $res['tick_at'],
                            'actions' => count($res['actions']), 'civs' => count($res['civs']),
                            'autonomy' => civ_autonomy_report()));

    // ---------------- КЕП-ВЕГАС ----------------
    case 'casino_zones':
        $zones = array();
        foreach (casino_zones() as $z) {
            $games = casino_zone_games($z['id']);
            $zones[] = array(
                'id' => $z['id'], 'name' => $z['name'], 'theme' => $z['theme'],
                'description' => $z['description'],
                'min_stake' => (float)$z['min_stake'], 'max_stake' => (float)$z['max_stake'],
                'halls' => casino_halls($z['id']),
                'games_total' => count($games),
                'games' => array_slice($games, 0, 24)
            );
        }
        json_out(200, array('ok' => true, 'zones' => $zones, 'halls_total' => count(casino_halls()),
                            'games_total' => count($GLOBALS['CASINO'])));

    // ---------------- МОБЫ-ЛИЧНОСТИ ----------------
    case 'mob_status':
        json_out(200, array('ok' => true, 'report' => mob_report()));

    case 'mob_list':
        $civ = isset($_GET['civ']) ? (string)$_GET['civ'] : '';
        $role = isset($_GET['role']) ? (string)$_GET['role'] : '';
        $state = mob_state_load();
        $out = array();
        foreach (mob_catalog() as $m) {
            if ($civ !== '' && $m['civ'] !== $civ) continue;
            if ($role !== '' && $m['role'] !== $role) continue;
            $st = $state[$m['id']] ?? mob_default($m);
            $out[] = array('id' => $m['id'], 'name' => $m['name'], 'civ' => $m['civ'], 'role' => $m['role'],
                           'credits' => round($st['credits']), 'earned' => round($st['earned']),
                           'spent' => round($st['spent']), 'mood' => $st['mood'], 'last' => $st['last']);
            if (count($out) >= 200) break;
        }
        json_out(200, array('ok' => true, 'total' => count($out), 'mobs' => $out));

    case 'mob_tick':
        if (!$me || (isset($me['Role']) && $me['Role'] !== 'admin')) {
            json_out(403, array('error' => 'только администратор'));
        }
        $res = mob_tick_all();
        json_out(200, array('ok' => true, 'mobs' => $res['mobs'], 'totals' => $res['totals'], 'check' => $res['check']));

    // ---------------- БОТ-ИНЖЕНЕР И ЖУРНАЛ БОТОВ ----------------
    case 'engineer_status':
        if (!$me || (isset($me['Role']) && $me['Role'] !== 'admin')) {
            json_out(403, array('error' => 'только администратор'));
        }
        $rep = eng_scan(false);
        json_out(200, $rep);

    case 'engineer_scan':
        if ($method !== 'POST' || !$me || (isset($me['Role']) && $me['Role'] !== 'admin')) {
            json_out(403, array('error' => 'только администратор'));
        }
        $rep = eng_scan(true);
        json_out(200, $rep);

    case 'bot_log':
        if (!$me || (isset($me['Role']) && $me['Role'] !== 'admin')) {
            json_out(403, array('error' => 'только администратор'));
        }
        $bot = isset($_GET['bot']) ? (string)$_GET['bot'] : null;
        $lvl = isset($_GET['level']) ? (string)$_GET['level'] : null;
        $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 50;
        json_out(200, array('ok' => true, 'stats' => bot_log_stats(),
                            'log' => bot_log_recent($limit, $bot, $lvl),
                            'issues' => bot_issues('open', 50)));

    case 'clientlog_clear':
        if ($method !== 'POST') json_out(405, array('error' => 'method'));
        if (!$isAdmin) json_out(403, array('error' => 'только администратор'));
        save_json($clientErrFile, array());
        json_out(200, array('cleared' => true));

    case 'clientlog':
        if ($method !== 'POST') json_out(405, array('error' => 'method'));
        $msg = isset($input['msg']) ? trim((string)$input['msg']) : '';
        if ($msg === '') json_out(400, array('error' => 'empty'));
        if (function_exists('mb_substr')) $msg = mb_substr($msg, 0, 500, 'UTF-8');
        $list = load_json($clientErrFile, array());
        $list[] = array(
            'ts' => time(),
            'msg' => $msg,
            'src' => isset($input['src']) ? substr((string)$input['src'], 0, 200) : '',
            'line' => isset($input['line']) ? (int)$input['line'] : 0,
            'stack' => isset($input['stack']) ? substr((string)$input['stack'], 0, 800) : '',
            'url' => isset($input['url']) ? substr((string)$input['url'], 0, 300) : '',
            'ua' => isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 200) : '',
            'email' => $me ? norm($me['Email']) : '',
        );
        if (count($list) > 300) $list = array_slice($list, -300);
        save_json($clientErrFile, $list);
        json_out(200, array('ok' => true));

    case 'clientlog_list':
        if (!$me || $me['Role'] !== 'admin') json_out(403, array('error' => 'только администратор'));
        $list = load_json($clientErrFile, array());
        json_out(200, array('errors' => array_slice($list, -30), 'total' => count($list)));

    case 'leaderboard':
        $by = isset($_GET['by']) ? $_GET['by'] : 'population';
        $rows = array();
        foreach ($users as $u2) {
            if (isset($u2['Role']) && $u2['Role'] === 'admin') continue;   // служебный аккаунт в рейтинг не идёт
            $p2 = json_decode(isset($u2['Profile']) ? $u2['Profile'] : '', true);
            if (!is_array($p2)) continue;
            $colony = isset($p2['colony']) && is_array($p2['colony']) ? $p2['colony'] : array();
            $rows[] = array(
                'name' => isset($p2['gameName']) && $p2['gameName'] !== '' ? $p2['gameName'] : explode('@', $u2['Email'])[0],
                'faction' => isset($p2['faction']) ? $p2['faction'] : '',
                'population' => isset($colony['population']) ? (int)$colony['population'] : 0,
                'stage' => isset($colony['stage']) ? $colony['stage'] : '',
                'credits' => isset($p2['credits']) ? (int)$p2['credits'] : 0,
                'ships' => isset($p2['ships']) && is_array($p2['ships']) ? count($p2['ships']) : 0,
            );
        }
        usort($rows, function ($a, $b) use ($by) {
            if ($by === 'credits') return $b['credits'] <=> $a['credits'];
            if ($by === 'ships') return $b['ships'] <=> $a['ships'];
            return $b['population'] <=> $a['population'];
        });
        json_out(200, array('by' => $by, 'rows' => array_slice($rows, 0, 20)));

    case 'mega_list':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $built = isset($profile['megaprojects']) && is_array($profile['megaprojects']) ? $profile['megaprojects'] : array();
        $list = array();
        foreach (mega_defs() as $id => $d) {
            $d['id'] = $id;
            $d['done'] = !empty($built[$id]);
            $list[] = $d;
        }
        json_out(200, array('projects' => $list,
            'credits' => isset($profile['credits']) ? $profile['credits'] : 0,
            'steel' => isset($profile['resources']['steel']) ? $profile['resources']['steel'] : 0,
            'chips' => isset($profile['resources']['chips']) ? $profile['resources']['chips'] : 0));

    case 'mega_build':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $id = isset($input['id']) ? $input['id'] : '';
        $defs = mega_defs();
        if (!isset($defs[$id])) json_out(400, array('error' => 'неизвестный проект'));
        $def = $defs[$id];
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'нужна своя колония'));
        $built = isset($profile['megaprojects']) && is_array($profile['megaprojects']) ? $profile['megaprojects'] : array();
        if (!empty($built[$id])) json_out(400, array('error' => 'уже построено'));
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        $chips = isset($profile['resources']['chips']) ? (int)$profile['resources']['chips'] : 0;
        if ($credits < $def['credits']) json_out(400, array('error' => 'нужно ' . number_format($def['credits'], 0, '', ' ') . ' кредитов'));
        if ($steel < $def['steel']) json_out(400, array('error' => 'нужно ' . $def['steel'] . ' т стали'));
        if ($chips < $def['chips']) json_out(400, array('error' => 'нужно ' . $def['chips'] . ' чипов'));
        $profile['credits'] = $credits - $def['credits'];
        $profile['resources']['steel'] = $steel - $def['steel'];
        $profile['resources']['chips'] = $chips - $def['chips'];
        $built[$id] = time();
        $profile['megaprojects'] = $built;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('id' => $id, 'title' => $def['title'], 'credits' => $profile['credits'],
            'steel' => $profile['resources']['steel'], 'chips' => $profile['resources']['chips'],
            'income' => $def['income'], 'energy' => $def['energy']));

    case 'outposts':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $moons = array(
            'luna' => 'Луна', 'io' => 'Ио', 'europa' => 'Европа', 'ganymede' => 'Ганимед',
            'callisto' => 'Каллисто', 'titan' => 'Титан', 'enceladus' => 'Энцелад', 'triton' => 'Тритон',
        );
        $mine = array();
        foreach ((isset($profile['outposts']) && is_array($profile['outposts']) ? $profile['outposts'] : array()) as $o) {
            $mine[] = $o;
        }
        json_out(200, array(
            'moons' => $moons, 'outposts' => $mine,
            'gasPlant' => isset($profile['gasPlant']) ? $profile['gasPlant'] : null,
            'energy' => isset($profile['energy']) ? (int)$profile['energy'] : 0,
            'income' => count($mine) * 2500 + (isset($profile['gasPlant']['level']) ? (int)$profile['gasPlant']['level'] * 8000 : 0),
        ));

    case 'outpost_found':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $moon = isset($input['moon']) ? $input['moon'] : '';
        $moons = array('luna', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'enceladus', 'triton');
        if (!in_array($moon, $moons, true)) json_out(400, array('error' => 'нет такой луны'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'сначала своя колония'));
        if (!isset($profile['outposts']) || !is_array($profile['outposts'])) $profile['outposts'] = array();
        foreach ($profile['outposts'] as $o) { if ($o['moon'] === $moon) json_out(400, array('error' => 'эта луна уже освоена')); }
        if (count($profile['outposts']) >= 5) json_out(400, array('error' => 'больше 5 аванпостов не освоить'));
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $cost = 150000 + count($profile['outposts']) * 50000;   // каждый следующий дороже
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $profile['outposts'][] = array('moon' => $moon, 'founded' => time(), 'income' => 2500, 'energy' => 2);
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('moon' => $moon, 'outposts' => count($profile['outposts']), 'cost' => $cost, 'credits' => $profile['credits']));

    case 'gasplant_build':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'сначала своя колония'));
        $level = isset($profile['gasPlant']['level']) ? (int)$profile['gasPlant']['level'] : 0;
        if ($level >= 3) json_out(400, array('error' => 'завод уже максимального уровня'));
        $cost = 400000 + $level * 250000;
        $steelNeed = 300 + $level * 150;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        if ($steel < $steelNeed) json_out(400, array('error' => 'нужно ' . $steelNeed . ' т стали'));
        $profile['credits'] = $credits - $cost;
        $profile['resources']['steel'] = $steel - $steelNeed;
        $profile['gasPlant'] = array('level' => $level + 1, 'built' => time());
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('level' => $level + 1, 'cost' => $cost, 'credits' => $profile['credits'],
            'income' => ($level + 1) * 8000, 'energy' => ($level + 1) * 10));

    case 'colony_stage':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $to = isset($input['to']) ? $input['to'] : '';
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        $stage = isset($c['stage']) ? $c['stage'] : 'moon';
        $pop = isset($c['population']) ? (float)$c['population'] : 0;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        $chips = isset($profile['resources']['chips']) ? (int)$profile['resources']['chips'] : 0;

        if ($to === 'planet') {
            if ($stage !== 'moon') json_out(400, array('error' => 'спуск уже выполнен'));
            if ($pop < 100000) json_out(400, array('error' => 'нужно 100 000 жителей на лунной базе'));
            if ($credits < 500000) json_out(400, array('error' => 'нужно 500 000 кредитов'));
            if ($steel < 500) json_out(400, array('error' => 'нужно 500 т стали'));
            $profile['credits'] = $credits - 500000;
            $profile['resources']['steel'] = $steel - 500;
            $profile['colony']['stage'] = 'planet';
            $profile['colony']['happiness'] = min(100, (float)$c['happiness'] + 5);
        } elseif ($to === 'elevator') {
            if ($stage !== 'planet') json_out(400, array('error' => 'лифт строится только на планете'));
            if ($pop < 500000) json_out(400, array('error' => 'нужно 500 000 жителей на планете'));
            if ($credits < 2000000) json_out(400, array('error' => 'нужно 2 000 000 кредитов'));
            if ($steel < 2000) json_out(400, array('error' => 'нужно 2 000 т стали'));
            if ($chips < 200) json_out(400, array('error' => 'нужно 200 чипов'));
            $profile['credits'] = $credits - 2000000;
            $profile['resources']['steel'] = $steel - 2000;
            $profile['resources']['chips'] = $chips - 200;
            $profile['colony']['stage'] = 'elevator';
            $profile['colony']['happiness'] = min(100, (float)$c['happiness'] + 10);
        } else {
            json_out(400, array('error' => 'неизвестный этап'));
        }
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array(
            'stage' => $profile['colony']['stage'],
            'stageName' => colony_stage_name($profile['colony']['stage']),
            'capacity' => colony_stage_cap($profile['colony']['stage']),
            'credits' => $profile['credits'],
        ));

    case 'colony_autonomy':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $on = !empty($input['on']);
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $agroLevel = isset($profile['factories']['agro']) ? (int)$profile['factories']['agro'] : 0;
        $capacity = $agroLevel * 250000;
        $pop = isset($profile['colony']['population']) ? (float)$profile['colony']['population'] : 0;
        if ($on) {
            if ($agroLevel < 1) json_out(400, array('error' => 'нужен агрокомплекс: постройте его в доке'));
            if ($pop > $capacity) json_out(400, array('error' => 'агрокомплекс кормит не больше ' . $capacity . ' жителей'));
        }
        $profile['colony']['autonomy'] = $on;
        if ($on) quest_mark($profile, 'autonomy');
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('autonomy' => $on, 'capacity' => $capacity, 'population' => $pop,
            'agroLevel' => $agroLevel));

    case 'colony_restore_population':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        $pop = (float)$c['population'];
        $peak = isset($c['peak']) ? (float)$c['peak'] : $pop;
        $lost = (int)floor($peak - $pop);
        if ($lost < 100) json_out(400, array('error' => 'восстанавливать нечего: население на прежнем уровне'));
        $count = isset($input['count']) ? (int)$input['count'] : $lost;
        $count = max(100, min($count, $lost));
        $price = 100 * $count;                    // программа переселения: 100 кр за человека
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
        $profile['credits'] = $credits - $price;
        $profile['colony']['population'] = $pop + $count;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('restored' => $count, 'population' => $profile['colony']['population'],
            'credits' => $profile['credits'], 'cost' => $price, 'lost' => $lost));

    case 'colony_restore':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $fid = isset($input['id']) ? $input['id'] : '';
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']['ruins']) || !is_array($profile['colony']['ruins'])) {
            json_out(400, array('error' => 'восстанавливать нечего'));
        }
        $found = -1;
        foreach ($profile['colony']['ruins'] as $i => $r) {
            if ($r['id'] === $fid) { $found = $i; break; }
        }
        if ($found < 0) json_out(400, array('error' => 'эта руина уже восстановлена'));
        $ruin = $profile['colony']['ruins'][$found];
        $max = isset($ruin['max']) ? (int)$ruin['max'] : 1;
        $table = factory_table();
        if (!isset($table[$fid])) json_out(400, array('error' => 'неизвестное сооружение'));
        $price = (int)round($table[$fid]['cost'] * $max * 0.5);
        $steelNeed = (int)round($table[$fid]['steel'] * $max * 0.5);
        $chipsNeed = isset($table[$fid]['chips']) ? (int)round($table[$fid]['chips'] * $max * 0.5) : 0;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        $chipsHave = isset($profile['resources']['chips']) ? (int)$profile['resources']['chips'] : 0;
        if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
        if ($steel < $steelNeed) json_out(400, array('error' => 'нужно ' . $steelNeed . ' т стали'));
        if ($chipsNeed > 0 && $chipsHave < $chipsNeed) json_out(400, array('error' => 'нужно ' . $chipsNeed . ' чипов'));
        $profile['credits'] = $credits - $price;
        $profile['resources']['steel'] = $steel - $steelNeed;
        if ($chipsNeed > 0) $profile['resources']['chips'] = $chipsHave - $chipsNeed;
        if (!isset($profile['factories']) || !is_array($profile['factories'])) $profile['factories'] = array();
        $profile['factories'][$fid] = $max;
        array_splice($profile['colony']['ruins'], $found, 1);
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array(
            'factory' => array('id' => $fid, 'level' => $max),
            'cost' => $price,
            'credits' => $profile['credits'],
            'steel' => $profile['resources']['steel'],
            'ruins' => $profile['colony']['ruins'],
        ));

    // ---- досуг колонии: деликатесы и театр ----
    case 'colony_feast':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        $now = time();
        $last = isset($c['lastFeast']) ? (int)$c['lastFeast'] : 0;
        $cool = 12 * 3600;
        if ($now - $last < $cool) {
            json_out(429, array('error' => 'деликатесы уже заказаны, следующий раз через '
                . ceil(($cool - ($now - $last)) / 60) . ' мин'));
        }
        $pop = (float)$c['population'];
        $grain = isset($profile['resources']['grain']) ? (float)$profile['resources']['grain'] : 0;
        if ($grain < $pop * 0.3 * 5) {
            json_out(400, array('error' => 'нужен запас зерна хотя бы на 5 суток'));
        }
        $cost = 8000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        // деликатесы готовят из своего зерна: минус треть суточной нормы
        $profile['resources']['grain'] = max(0, $grain - $pop * 0.1);
        $c['happiness'] = min(100, (float)$c['happiness'] + 6);
        $c['lastFeast'] = $now;
        $c['feasts'] = (isset($c['feasts']) ? (int)$c['feasts'] : 0) + 1;
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $c, 'credits' => $profile['credits'], 'cost' => $cost, 'happiness' => $c['happiness']));

    case 'colony_theatre':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        if (!empty($c['theatre'])) json_out(400, array('error' => 'театр уже построен'));
        $cost = 45000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $c['theatre'] = true;
        $c['theatreAt'] = time();
        $c['happiness'] = min(100, (float)$c['happiness'] + 2);
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $c, 'credits' => $profile['credits'], 'cost' => $cost));

    // ---------- доки ----------
    case 'docks_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $changed = false;
        for ($k = 0; $k < 5; $k++) { if (docks_pump($profile)) { $changed = true; } else break; }
        if ($changed) { profile_store($users, $idx, $profile); save_json($usersFile, $users); }
        $busy = docks_occupied($profile);
        $total = docks_count($profile);
        json_out(200, array(
            'docks' => $total,
            'busy' => $busy,
            'free' => max(0, $total - count($busy)),
            'upgradeCost' => docks_upgrade_cost($profile),
            'max' => 5,
            'canUpgrade' => $total < 5,
            'queue' => isset($profile['dockQueue']) && is_array($profile['dockQueue']) ? $profile['dockQueue'] : array()
        ));

    case 'docks_upgrade':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $total = docks_count($profile);
        if ($total >= 5) json_out(400, array('error' => 'больше 5 доков не бывает'));
        $cost = docks_upgrade_cost($profile);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . number_format($cost, 0, '', ' ') . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $profile['docks'] = $total + 1;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'docks' => $profile['docks'], 'cost' => $cost,
            'nextCost' => docks_upgrade_cost($profile), 'credits' => $profile['credits']));

    // ---------- верфь ----------
    case 'shipyard_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $t = shipyard_table();
        $lvl = shipyard_level($profile);
        $next = $lvl < 5 ? $t[$lvl + 1] : null;
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        json_out(200, array(
            'level' => $lvl,
            'docks' => $t[$lvl]['docks'],
            'speed' => $t[$lvl]['speed'],
            'jobs' => $t[$lvl]['jobs'],
            'steel' => $steel,
            'next' => $next ? array('level' => $lvl + 1, 'docks' => $next['docks'], 'speed' => $next['speed'],
                'jobs' => $next['jobs'], 'cost' => $next['cost'], 'steel' => $next['steel'], 'hours' => $next['hours']) : null,
            'table' => $t,
            'busy' => count(docks_occupied($profile)),
            'free' => docks_free($profile)
        ));

    case 'shipyard_upgrade':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $t = shipyard_table();
        $lvl = shipyard_level($profile);
        if ($lvl >= 5) json_out(400, array('error' => 'верфь уже максимального уровня (5)'));
        $next = $t[$lvl + 1];
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $next['cost']) {
            json_out(400, array('error' => 'нужно ' . number_format($next['cost'], 0, '', ' ') . ' кредитов'));
        }
        $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
        if ($steel < $next['steel']) json_out(400, array('error' => 'нужно ' . $next['steel'] . ' т стали'));
        $profile['credits'] = $credits - $next['cost'];
        $profile['resources']['steel'] = $steel - $next['steel'];
        $profile['shipyard'] = $lvl + 1;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'level' => $profile['shipyard'], 'docks' => $next['docks'],
            'speed' => $next['speed'], 'jobs' => $next['jobs'], 'credits' => $profile['credits'],
            'steel' => $profile['resources']['steel']));

    // ---------- модернизация кораблей ----------
    case 'ship_mods':
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $ships = isset($profile['ships']) && is_array($profile['ships']) ? $profile['ships'] : array();
        $out = array();
        foreach ($ships as $i => $sh) {
            $out[] = array(
                'index' => $i,
                'id' => isset($sh['id']) ? $sh['id'] : 'ship',
                'name' => isset($sh['name']) ? $sh['name'] : ('Корабль ' . ($i + 1)),
                'mods' => isset($sh['mods']) && is_array($sh['mods']) ? $sh['mods'] : array(),
                'blueprints' => isset($sh['blueprints']) && is_array($sh['blueprints']) ? $sh['blueprints'] : array(),
                'busy' => isset($sh['modEnds']) && (int)$sh['modEnds'] > time(),
                'modEnds' => isset($sh['modEnds']) ? (int)$sh['modEnds'] : 0,
                'modKind' => isset($sh['modKind']) ? $sh['modKind'] : '',
                'modLevel' => isset($sh['modLevel']) ? (int)$sh['modLevel'] : 0
            );
        }
        json_out(200, array('shipyard' => array('level' => shipyard_level($profile),
            'speed' => shipyard_speed($profile), 'jobs' => shipyard_table()[shipyard_level($profile)]['jobs']),
            'docks' => array('total' => docks_count($profile), 'busy' => count(docks_occupied($profile)),
            'free' => docks_free($profile), 'upgradeCost' => docks_upgrade_cost($profile)),
            'ships' => $out, 'branches' => ship_mod_branches(),
            'blueprints' => ship_blueprint_table(),
            'owned' => isset($profile['blueprints']) && is_array($profile['blueprints']) ? $profile['blueprints'] : array()));

    case 'ship_mod_start':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $si = isset($input['ship']) ? (int)$input['ship'] : -1;
        $kind = isset($input['kind']) ? (string)$input['kind'] : '';
        if (!isset($profile['ships'][$si])) json_out(400, array('error' => 'нет такого корабля'));
        $branches = ship_mod_branches();
        if (!isset($branches[$kind])) json_out(400, array('error' => 'неизвестная ветка'));
        $sh = $profile['ships'][$si];
        if (docks_free($profile) < 1) {
            // встаём в очередь, если игрок так попросил
            if (!empty($input['queue'])) {
                $lvlQ = isset($sh['mods'][$kind]) ? (int)$sh['mods'][$kind] : 0;
                $costQ = (int)round(8000 * pow(1.6, $lvlQ));
                $creditsQ = isset($profile['credits']) ? (float)$profile['credits'] : 0;
                if ($creditsQ < $costQ) json_out(400, array('error' => 'нужно ' . number_format($costQ, 0, '', ' ') . ' кредитов'));
                if (!isset($profile['dockQueue']) || !is_array($profile['dockQueue'])) $profile['dockQueue'] = array();
                $profile['dockQueue'][] = array('ship' => $si, 'kind' => $kind, 'level' => $lvlQ + 1,
                    'cost' => $costQ, 'queuedAt' => time());
                $profile['credits'] = $creditsQ - $costQ;
                profile_store($users, $idx, $profile);
                save_json($usersFile, $users);
                json_out(200, array('queued' => true, 'position' => count($profile['dockQueue']),
                    'cost' => $costQ, 'credits' => $profile['credits']));
            }
            json_out(429, array('error' => 'нет свободного дока: все ' . docks_count($profile) . ' заняты. Постройте ещё док ('
                . number_format(docks_upgrade_cost($profile), 0, '', ' ') . ' кр) или встаньте в очередь'));
        }
        $lvl = isset($sh['mods'][$kind]) ? (int)$sh['mods'][$kind] : 0;
        if ($lvl >= 10) json_out(400, array('error' => 'уже максимум (10)'));
        $cost = (int)round(8000 * pow(1.6, $lvl));
        $secs = (int)max(20, round(300 * pow(1.5, $lvl) / shipyard_speed($profile)));
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . number_format($cost, 0, '', ' ') . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $profile['ships'][$si]['modEnds'] = time() + $secs;
        $profile['ships'][$si]['modKind'] = $kind;
        $profile['ships'][$si]['modLevel'] = $lvl + 1;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'cost' => $cost, 'seconds' => $secs,
            'finish' => time() + $secs, 'kind' => $kind, 'level' => $lvl + 1, 'credits' => $profile['credits']));

    case 'ship_mod_claim':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $si = isset($input['ship']) ? (int)$input['ship'] : -1;
        if (!isset($profile['ships'][$si])) json_out(400, array('error' => 'нет такого корабля'));
        $sh = $profile['ships'][$si];
        if (empty($sh['modKind'])) json_out(400, array('error' => 'нет начатой модернизации'));
        if ((int)$sh['modEnds'] > time()) {
            json_out(429, array('error' => 'ещё не готово: ' . ceil(((int)$sh['modEnds'] - time()) / 60) . ' мин'));
        }
        $kind = $sh['modKind'];
        $lvl = isset($sh['mods'][$kind]) ? (int)$sh['mods'][$kind] : 0;
        $profile['ships'][$si]['mods'][$kind] = $lvl + 1;
        unset($profile['ships'][$si]['modKind']);
        unset($profile['ships'][$si]['modLevel']);
        unset($profile['ships'][$si]['modEnds']);
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'kind' => $kind, 'level' => $lvl + 1));

    case 'ship_mod_accelerate':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $si = isset($input['ship']) ? (int)$input['ship'] : -1;
        if (!isset($profile['ships'][$si])) json_out(400, array('error' => 'нет такого корабля'));
        if (empty($profile['ships'][$si]['modKind'])) json_out(400, array('error' => 'нет начатой модернизации'));
        $left = max(0, (int)$profile['ships'][$si]['modEnds'] - time());
        if ($left <= 0) json_out(400, array('error' => 'уже готово — заберите результат'));
        $cost = max(1, (int)ceil($left / 60));       // 1 кристалл за минуту
        $have = isset($profile['resources']['eternity']) ? (int)$profile['resources']['eternity'] : 0;
        if ($have < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кристаллов Вечности, есть ' . $have));
        $profile['resources']['eternity'] = $have - $cost;
        $profile['ships'][$si]['modEnds'] = time();
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'crystals' => $cost, 'eternity' => $profile['resources']['eternity']));

    case 'blueprint_buy':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $bid = isset($input['id']) ? (string)$input['id'] : '';
        $bps = ship_blueprint_table();
        if (!isset($bps[$bid])) json_out(400, array('error' => 'нет такого чертежа'));
        $bp = $bps[$bid];
        if (empty($bp['buy'])) json_out(400, array('error' => 'этот чертёж не продаётся — только найти'));
        $owned = isset($profile['blueprints']) && is_array($profile['blueprints']) ? $profile['blueprints'] : array();
        if (in_array($bid, $owned, true)) json_out(400, array('error' => 'чертёж уже есть'));
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $bp['price']) json_out(400, array('error' => 'нужно ' . number_format($bp['price'], 0, '', ' ') . ' кредитов'));
        $profile['credits'] = $credits - $bp['price'];
        $owned[] = $bid;
        $profile['blueprints'] = $owned;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'id' => $bid, 'credits' => $profile['credits'], 'owned' => $owned));

    case 'blueprint_apply':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $bid = isset($input['id']) ? (string)$input['id'] : '';
        $si = isset($input['ship']) ? (int)$input['ship'] : -1;
        $bps = ship_blueprint_table();
        if (!isset($bps[$bid])) json_out(400, array('error' => 'нет такого чертежа'));
        if (!isset($profile['ships'][$si])) json_out(400, array('error' => 'нет такого корабля'));
        $owned = isset($profile['blueprints']) && is_array($profile['blueprints']) ? $profile['blueprints'] : array();
        if (!in_array($bid, $owned, true)) json_out(400, array('error' => 'чертежа нет в ангаре'));
        $applied = isset($profile['ships'][$si]['blueprints']) && is_array($profile['ships'][$si]['blueprints'])
            ? $profile['ships'][$si]['blueprints'] : array();
        if (in_array($bid, $applied, true)) json_out(400, array('error' => 'уже установлен на этом корабле'));
        $applied[] = $bid;
        $profile['ships'][$si]['blueprints'] = $applied;
        // чертёж расходуется
        $profile['blueprints'] = array_values(array_diff($owned, array($bid)));
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('ok' => true, 'id' => $bid, 'ship' => $si, 'blueprints' => $applied,
            'stats' => ship_stats_with_mods($profile['ships'][$si])));

    // ================= БОЙ: характеристики, расчёт, симуляция =================
    case 'combat_ships':
        json_out(200, array('ships' => combat_ship_table(), 'guns' => combat_gun_table(),
            'resist' => combat_resist_table(), 'upgrades' => combat_upgrades()));

    case 'combat_sim':
        if ($method !== 'POST') json_out(405, array('error' => 'только POST'));
        $a = isset($input['attacker']) && is_array($input['attacker']) ? $input['attacker'] : array();
        $d = isset($input['defender']) && is_array($input['defender']) ? $input['defender'] : array();
        $res = combat_simulate($a, $d);
        json_out(200, $res);

    case 'combat_matrix':
        $q = isset($_GET['upgrade']) ? max(0, min(3, (int)$_GET['upgrade'])) : 0;
        $g = isset($_GET['guns']) ? max(1, min(5, (int)$_GET['guns'])) : 1;
        $t = isset($_GET['target']) ? (string)$_GET['target'] : 'balanced';
        json_out(200, array('rows' => combat_matrix($q, $g, $t), 'upgrade' => $q, 'guns' => $g, 'target' => $t));

    // ---- межпланетная торговля: вода Европы, водород Юпитера ----
    case 'trade_routes':
        $routes = array(
            array(
                'id' => 'europa-water', 'from' => 'Европа', 'to' => 'Луна', 'resource' => 'water',
                'unit' => 'т', 'batch' => 500, 'buy' => 3.2, 'sell' => 12.0, 'hours' => 4, 'risk' => 0.02,
                'note' => 'лёд Европы — самая дешёвая вода в системе',
            ),
            array(
                'id' => 'jupiter-hydrogen', 'from' => 'Юпитер', 'to' => 'Луна', 'resource' => 'hydrogen',
                'unit' => 'кг', 'batch' => 4000, 'buy' => 6.5, 'sell' => 14.0, 'hours' => 6, 'risk' => 0.03,
                'note' => 'водород из атмосферы — топливо и сырьё для воды',
            ),
            array(
                'id' => 'earth-oxygen', 'from' => 'Земля', 'to' => 'Луна', 'resource' => 'oxygen',
                'unit' => 'кг', 'batch' => 8000, 'buy' => 1.8, 'sell' => 3.6, 'hours' => 2, 'risk' => 0.01,
                'note' => 'кислород с Земли — второй компонент топливного элемента',
            ),
            array(
                'id' => 'titan-methane', 'from' => 'Титан', 'to' => 'Луна', 'resource' => 'methane',
                'unit' => 'кг', 'batch' => 3000, 'buy' => 4.0, 'sell' => 9.0, 'hours' => 7, 'risk' => 0.04,
                'note' => 'метановые озёра Титана',
            )
        );
        json_out(200, array('routes' => $routes));

    case 'trade_run':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $rid = isset($input['route']) ? (string)$input['route'] : '';
        $qty = isset($input['qty']) ? max(1, min(5, (int)$input['qty'])) : 1;
        $routes = array(
            // микро-маршрут для новичка: 300 кр на закупку, чтобы выйти из тупика
            // «нет денег на первую партию»
            'moon-orbit' => array('from' => 'Луна', 'resource' => 'ice', 'batch' => 20, 'buy' => 15.0, 'sell' => 50.0, 'hours' => 1, 'risk' => 0.005),
            'europa-water' => array('from' => 'Европа', 'resource' => 'water', 'batch' => 500, 'buy' => 3.2, 'sell' => 12.0, 'hours' => 4, 'risk' => 0.02),
            'jupiter-hydrogen' => array('from' => 'Юпитер', 'resource' => 'hydrogen', 'batch' => 4000, 'buy' => 6.5, 'sell' => 14.0, 'hours' => 6, 'risk' => 0.03),
            'earth-oxygen' => array('from' => 'Земля', 'resource' => 'oxygen', 'batch' => 8000, 'buy' => 1.8, 'sell' => 3.6, 'hours' => 2, 'risk' => 0.01),
            'titan-methane' => array('from' => 'Титан', 'resource' => 'methane', 'batch' => 3000, 'buy' => 4.0, 'sell' => 9.0, 'hours' => 7, 'risk' => 0.04),
        );
        if (!isset($routes[$rid])) json_out(400, array('error' => 'неизвестный маршрут'));
        $r = $routes[$rid];
        $ships = isset($profile['ships']) && is_array($profile['ships']) ? count($profile['ships']) : 0;
        if ($ships < 1) json_out(400, array('error' => 'нужен хотя бы один корабль'));
        if ($qty > $ships * 2) json_out(400, array('error' => 'больше партий, чем могут увезти корабли'));
        $now = time();
        $cool = (int)round($r['hours'] * 20 * 60);   // 20 минут на игровой час рейса
        $lastKey = 'lastRun_' . $rid;
        $last = isset($profile['trade'][$lastKey]) ? (int)$profile['trade'][$lastKey] : 0;
        $left = $cool - ($now - $last);
        if ($left > 0) json_out(429, array('error' => 'корабль ещё в рейсе: ' . ceil($left / 60) . ' мин'));
        $mass = $r['batch'] * $qty;
        $cost = (float)round($mass * $r['buy']);
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов на закупку'));
        $profile['credits'] = $credits - $cost;
        // риск: пираты могут забрать груз
        if (mt_rand(0, 1000) / 1000 < $r['risk']) {
            $profile['trade'] = array('lastRun_' . $rid => $now, 'lastRoute' => $rid);
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
            json_out(200, array('result' => 'lost', 'route' => $rid, 'qty' => $mass,
                'credits' => $profile['credits'], 'message' => 'пираты перехватили груз на подходе'));
        }
        // keep = оставить груз себе (для топливного элемента и колонии)
        $keep = !empty($input['keep']);
        if ($keep) {
            $res = $r['resource'];
            $now2 = time();
            $tradeState2 = isset($profile['trade']) && is_array($profile['trade']) ? $profile['trade'] : array();
            $tradeState2['lastRun_' . $rid] = $now2;
            $tradeState2['lastRoute'] = $rid;
            $profile['trade'] = $tradeState2;
            $have = isset($profile['resources'][$res]) ? (float)$profile['resources'][$res] : 0;
            $add = ($res === 'water') ? $mass / 1000 : $mass;   // вода в тоннах
            $profile['resources'][$res] = $have + $add;
            profile_store($users, $idx, $profile);
            save_json($usersFile, $users);
            json_out(200, array('result' => 'kept', 'route' => $rid, 'resource' => $res,
                'qty' => round($add, 2), 'cost' => $cost, 'credits' => $profile['credits']));
        }
        $earn = (float)round($mass * $r['sell']);
        $profile['credits'] = $profile['credits'] + $earn;
        $tradeState = isset($profile['trade']) && is_array($profile['trade']) ? $profile['trade'] : array();
        $tradeState['lastRun_' . $rid] = $now;
        $tradeState['lastRoute'] = $rid;
        $tradeState['totalProfit'] = (isset($tradeState['totalProfit']) ? (float)$tradeState['totalProfit'] : 0) + ($earn - $cost);
        $profile['trade'] = $tradeState;
        if (!isset($profile['tradeStats']) || !is_array($profile['tradeStats'])) $profile['tradeStats'] = array();
        $profile['tradeStats'][$rid] = (isset($profile['tradeStats'][$rid]) ? (int)$profile['tradeStats'][$rid] : 0) + $qty;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('result' => 'ok', 'route' => $rid, 'resource' => $r['resource'],
            'qty' => $mass, 'buy' => $cost, 'sell' => $earn, 'profit' => $earn - $cost,
            'hours' => $r['hours'], 'credits' => $profile['credits']));

    // топливный элемент: водород + кислород → вода и энергия (H2 + O2)
    case 'trade_fuelcell':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $h2 = isset($input['hydrogen']) ? max(0, (int)$input['hydrogen']) : 0;
        if ($h2 < 100) json_out(400, array('error' => 'минимум 100 кг водорода'));
        $have = isset($profile['resources']['hydrogen']) ? (float)$profile['resources']['hydrogen'] : 0;
        if ($have < $h2) json_out(400, array('error' => 'водорода не хватает: есть ' . round($have) . ' кг'));
        $o2need = $h2 * 9;    // 1 кг H2 + 9 кг O2 → 10 кг воды (с запасом), энергия 33 кВт·ч
        $o2have = isset($profile['resources']['oxygen']) ? (float)$profile['resources']['oxygen'] : 0;
        if ($o2have < $o2need) json_out(400, array('error' => 'кислорода нужно ' . $o2need . ' кг, есть ' . round($o2have)));
        $water = $h2 * 9;      // кг воды
        $energy = $h2 * 33;    // кВт·ч
        $profile['resources']['hydrogen'] = $have - $h2;
        $profile['resources']['oxygen'] = $o2have - $o2need;
        $w = isset($profile['resources']['water']) ? (float)$profile['resources']['water'] : 0;
        $profile['resources']['water'] = $w + $water / 1000;   // вода в тоннах
        $profile['trade']['energy'] = (isset($profile['trade']['energy']) ? (float)$profile['trade']['energy'] : 0) + $energy;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('water' => round($water / 1000, 1), 'energy' => $energy,
            'hydrogen' => $profile['resources']['hydrogen'], 'oxygen' => $profile['resources']['oxygen'],
            'resources' => $profile['resources']));

    // продажа энергии, полученной топливным элементом (0,9 кр за кВт·ч)
    case 'trade_energy':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $want = isset($input['kwh']) ? max(0, (float)$input['kwh']) : 0;
        $have = isset($profile['trade']['energy']) ? (float)$profile['trade']['energy'] : 0;
        if ($have < 1) json_out(400, array('error' => 'энергии нет — соберите топливный элемент'));
        $sell = $want > 0 ? min($want, $have) : $have;
        $price = 0.9;   // цена киловатт-часа в игре
        $sum = $sell * $price;
        $profile['trade']['energy'] = $have - $sell;
        $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $sum;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('sold' => $sell, 'sum' => round($sum), 'credits' => $profile['credits'],
            'energy' => $profile['trade']['energy']));

    // рециклинг воды: −40 % расхода, 120 000 кр
    case 'colony_recycle':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        if (!empty($c['upgrades']['recycle'])) json_out(400, array('error' => 'рециклинг уже стоит'));
        $cost = 120000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        if (!isset($c['upgrades']) || !is_array($c['upgrades'])) $c['upgrades'] = array();
        $c['upgrades']['recycle'] = true;
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $c, 'credits' => $profile['credits'], 'cost' => $cost));

    // гидропоника: −30 % зерна, 150 000 кр
    case 'colony_hydro':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        if (!empty($c['upgrades']['hydro'])) json_out(400, array('error' => 'гидропоника уже стоит'));
        $cost = 150000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        if (!isset($c['upgrades']) || !is_array($c['upgrades'])) $c['upgrades'] = array();
        $c['upgrades']['hydro'] = true;
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $c, 'credits' => $profile['credits'], 'cost' => $cost));

    // премьера в театре: +3 счастья и +1 % к налогам на сутки, 5 000 кр, раз в 24 ч
    case 'colony_premiere':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        if (empty($c['theatre'])) json_out(400, array('error' => 'сначала постройте театр'));
        $now2 = time();
        $last = isset($c['premiereAt']) ? (int)$c['premiereAt'] : 0;
        if ($now2 - $last < 24 * 3600) {
            json_out(429, array('error' => 'следующая премьера через ' . ceil((24 * 3600 - ($now2 - $last)) / 3600) . ' ч'));
        }
        $cost = 5000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $c['premiereAt'] = $now2;
        $c['premiereUntil'] = $now2 + 24 * 3600;
        $c['happiness'] = min(100, (float)$c['happiness'] + 3);
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $c, 'credits' => $profile['credits'], 'cost' => $cost));

    // пиратский рынок: список и покупка
    case 'pirate_list':
        $pirate = load_json($pirateFile, array('lots' => array()));
        json_out(200, array('lots' => isset($pirate['lots']) ? $pirate['lots'] : array()));

    case 'pirate_buy':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $pid = isset($input['id']) ? (string)$input['id'] : '';
        $want = isset($input['qty']) ? (int)$input['qty'] : 0;
        $pirate = load_json($pirateFile, array('lots' => array()));
        $lots = isset($pirate['lots']) ? $pirate['lots'] : array();
        $found = -1;
        foreach ($lots as $li => $lot) { if ($lot['id'] === $pid) { $found = $li; break; } }
        if ($found < 0) json_out(404, array('error' => 'лот уже разобрали'));
        $lot = $lots[$found];
        $qty = $want > 0 ? min($want, (int)$lot['qty']) : (int)$lot['qty'];
        $sum = $qty * (float)$lot['price'];
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $sum) json_out(400, array('error' => 'нужно ' . round($sum) . ' кредитов'));
        $profile['credits'] = $credits - $sum;
        $res = $lot['resource'];
        $profile['resources'][$res] = (isset($profile['resources'][$res]) ? (float)$profile['resources'][$res] : 0) + $qty;
        $lots[$found]['qty'] = (int)$lot['qty'] - $qty;
        if ($lots[$found]['qty'] <= 0) array_splice($lots, $found, 1);
        $pirate['lots'] = array_values($lots);
        save_json($pirateFile, $pirate);
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('credits' => $profile['credits'], 'resource' => $res, 'qty' => $qty, 'sum' => round($sum)));

    // наёмный патруль: +2 обороны на один рейд, 20 000 кр
    case 'colony_patrol':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        $cost = 20000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $c['patrol'] = (isset($c['patrol']) ? (int)$c['patrol'] : 0) + 2;
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $c, 'credits' => $profile['credits'], 'cost' => $cost, 'patrol' => $c['patrol']));

    // жилой модуль: +50 000 к лимиту населения, 80 000 кр
    case 'colony_habitat':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $c = $profile['colony'];
        $levels = isset($input['levels']) ? (int)$input['levels'] : 1;
        if ($levels < 1 || $levels > 10) json_out(400, array('error' => 'от 1 до 10 модулей'));
        $have = isset($c['habitat']) ? (int)$c['habitat'] : 0;
        if ($have + $levels > 20) json_out(400, array('error' => 'больше 20 модулей не поместится'));
        $cost = 80000 * $levels;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $c['habitat'] = $have + $levels;
        $profile['colony'] = $c;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array(
            'colony' => $c,
            'credits' => $profile['credits'],
            'cost' => $cost,
            'limit' => colony_stage_cap(isset($c['stage']) ? $c['stage'] : 'moon') + $c['habitat'] * 50000));

    case 'colony_defense':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['colony']) || !is_array($profile['colony'])) json_out(400, array('error' => 'колонии нет'));
        $levels = isset($input['levels']) ? (int)$input['levels'] : 1;
        if ($levels < 1 || $levels > 10) json_out(400, array('error' => 'от 1 до 10 уровней'));
        $cur = isset($profile['colony']['defense']) ? (int)$profile['colony']['defense'] : 0;
        $cost = 0;
        for ($i = 1; $i <= $levels; $i++) { $cost += 150000 * ($cur + $i); }
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));
        $profile['credits'] = $credits - $cost;
        $profile['colony']['defense'] = $cur + $levels;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('colony' => $profile['colony'], 'credits' => $profile['credits'], 'cost' => $cost));


    // ---------------- СТАТУС И БЭКАПЫ ----------------

    case 'stats':
        if (!$me || $me['Role'] !== 'admin') json_out(403, array('error' => 'только администратор'));
        $now = time();
        $day = 86400;
        $total = 0; $newToday = 0; $newWeek = 0; $activeToday = 0; $activeWeek = 0;
        $colonies = 0; $ships = 0; $creditsSum = 0; $withProfile = 0; $idleMonth = 0;
        foreach ($users as $u) {
            $total++;
            $created = isset($u['Created']) ? strtotime($u['Created']) : 0;
            if ($created && $now - $created <= $day) $newToday++;
            if ($created && $now - $created <= 7 * $day) $newWeek++;
            $p = json_decode(isset($u['Profile']) ? $u['Profile'] : '', true);
            if (!is_array($p)) continue;
            $withProfile++;
            $seen = isset($p['lastSeen']) ? (int)$p['lastSeen'] : 0;
            if ($seen && $now - $seen <= $day) $activeToday++;
            if ($seen && $now - $seen <= 7 * $day) $activeWeek++;
            if ($seen && $now - $seen > 30 * $day) $idleMonth++;
            if (!empty($p['colony'])) $colonies++;
            if (!empty($p['ships']) && is_array($p['ships'])) $ships += count($p['ships']);
            if (isset($p['credits'])) $creditsSum += (float)$p['credits'];
        }
        $worlds = load_json($worldsFile, array());
        $rankMap = load_json($ranksFile, array());
        $rankCount = array();
        foreach ($rankMap as $email => $rid) { $rankCount[$rid] = (isset($rankCount[$rid]) ? $rankCount[$rid] : 0) + 1; }
        $chat = load_json($chatFile, array());
        $chatDay = 0;
        foreach ($chat as $m) { if ($now - (int)$m['ts'] <= $day) $chatDay++; }
        $orders = load_json($ordersFile, array());
        $paid = 0; $paidSum = 0;
        foreach ($orders as $o) {
            if (isset($o['status']) && $o['status'] === 'paid') { $paid++; $paidSum += (float)(isset($o['amount']) ? $o['amount'] : 0); }
        }
        json_out(200, array(
            'users' => array(
                'total' => $total, 'newToday' => $newToday, 'newWeek' => $newWeek,
                'activeToday' => $activeToday, 'activeWeek' => $activeWeek, 'idleMonth' => $idleMonth,
                'withColony' => $colonies, 'ships' => $ships,
                'avgCredits' => $withProfile ? (int)round($creditsSum / $withProfile) : 0,
            ),
            'worlds' => array('abandoned' => count($worlds)),
            'ranks' => $rankCount,
            'chat' => array('today' => $chatDay, 'total' => count($chat)),
            'pay' => array('orders' => count($orders), 'paid' => $paid, 'sum' => $paidSum),
        ));

    case 'status':
        $base = dirname(dirname($dataDir));   // .../data (backups и logs лежат там)
        $backupDir = $base . '/backups';
        $backups = array();
        if (is_dir($backupDir)) {
            foreach (glob($backupDir . '/data-*.tar.gz') as $f) {
                $backups[] = array('name' => basename($f), 'size' => filesize($f), 'time' => gmdate('c', filemtime($f)));
            }
            usort($backups, function ($a, $b) { return strcmp($b['time'], $a['time']); });
        }
        $monitorFile = $base . '/logs/monitor.log';
        $lastCheck = null;
        $checks = 0;
        if (file_exists($monitorFile)) {
            $rows = @file($monitorFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $checks = is_array($rows) ? count($rows) : 0;
            $lastCheck = $checks ? end($rows) : null;
        }
        json_out(200, array(
            'ok' => true,
            'time' => gmdate('c'),
            'php' => PHP_VERSION,
            'users' => count(load_json($usersFile, array())),
            'backups' => count($backups),
            'lastBackup' => $backups ? $backups[0] : null,
            'monitor' => array('checks' => $checks, 'last' => $lastCheck),
            'diskFreeMb' => (int)(disk_free_space('/') / 1048576),
        ));


    // ---------------- ЧЁРНЫЙ РЫНОК ----------------

    case 'bm_sell':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $resource = isset($input['resource']) ? $input['resource'] : '';
        $qty = isset($input['qty']) ? (int)$input['qty'] : 0;
        $rates = bm_rates();
        if (!isset($rates[$resource])) json_out(400, array('error' => 'этот товар не принимают'));
        if ($qty < 100) json_out(400, array('error' => 'минимум 100 единиц'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $have = isset($profile['resources'][$resource]) ? (int)$profile['resources'][$resource] : 0;
        if ($have < $qty) json_out(400, array('error' => 'на складе только ' . $have));
        $crystals = max(1, (int)floor($qty * $rates[$resource] / 1000));
        $profile['resources'][$resource] = $have - $qty;
        if (!isset($profile['resources']['eternity'])) $profile['resources']['eternity'] = 0;
        $profile['resources']['eternity'] = (int)$profile['resources']['eternity'] + $crystals;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('crystals' => $crystals, 'resource' => $resource, 'left' => $profile['resources'][$resource]));


    // ---------------- КОРАБЛИ ----------------


    case 'ship_sell':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $index = isset($input['index']) ? (int)$input['index'] : -1;
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['ships'][$index])) json_out(400, array('error' => 'такого корабля нет'));
        $shipId = $profile['ships'][$index]['id'];
        $ships = ship_table();
        $refund = isset($ships[$shipId]) ? (int)round($ships[$shipId]['price'] * 0.6) : 0;
        array_splice($profile['ships'], $index, 1);
        $profile['credits'] = (isset($profile['credits']) ? (float)$profile['credits'] : 0) + $refund;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('refund' => $refund, 'ships' => count($profile['ships']), 'credits' => $profile['credits']));


    // ---------------- СТРОЙКА ----------------



    // ---------------- МОДУЛИ КОЛОНИИ ----------------



    // ---------------- ОЧЕРЕДЬ СТРОЙКИ ----------------

    case 'build_start':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $kind = isset($input['kind']) ? $input['kind'] : '';
        $id = isset($input['id']) ? $input['id'] : '';
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (!isset($profile['buildQueue']) || !is_array($profile['buildQueue'])) $profile['buildQueue'] = array();
        if (count($profile['buildQueue']) >= 4) json_out(400, array('error' => 'все верфи заняты: 4 стройки'));
        if ($kind === 'ship' && docks_free($profile) < 1) {
            json_out(429, array('error' => 'нет свободного дока: все ' . docks_count($profile)
                . ' заняты постройкой или модернизацией. Постройте ещё док ('
                . number_format(docks_upgrade_cost($profile), 0, '', ' ') . ' кр)'));
        }
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        $title = '';
        $level = 0;

        if ($kind === 'factory') {
            if (!isset($profile['colony']) || !is_array($profile['colony'])) {
                json_out(400, array('error' => 'сооружения строят только в своей системе — сначала колония'));
            }
            $table = factory_table();
            if (!isset($table[$id])) json_out(400, array('error' => 'неизвестное сооружение'));
            if (!isset($profile['factories']) || !is_array($profile['factories'])) $profile['factories'] = array();
            // уровень считаем с учётом того, что уже стоит в очереди на это же сооружение
            $pending = 0;
            foreach ($profile['buildQueue'] as $q) {
                if ($q['kind'] === 'factory' && $q['id'] === $id) $pending++;
            }
            $level = (isset($profile['factories'][$id]) ? (int)$profile['factories'][$id] : 0) + $pending + 1;
            if ($level > 3) json_out(400, array('error' => 'максимальный уровень'));
            $price = $table[$id]['cost'] * $level;
            $steelNeed = $table[$id]['steel'] * $level;
            $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
            if ($credits < $price) json_out(400, array('error' => 'нужно ' . $price . ' кредитов'));
            if ($steel < $steelNeed) json_out(400, array('error' => 'нужно ' . $steelNeed . ' т стали'));
            $profile['credits'] = $credits - $price;
            $profile['resources']['steel'] = $steel - $steelNeed;
        } elseif ($kind === 'ship') {
            $ships = ship_table();
            if (!isset($ships[$id])) json_out(400, array('error' => 'неизвестный корабль'));
            $ship = $ships[$id];
            if ($credits < $ship['price']) json_out(400, array('error' => 'не хватает кредитов: нужно ' . $ship['price']));
            foreach ($ship['parts'] as $res => $need) {
                $have = isset($profile['resources'][$res]) ? (int)$profile['resources'][$res] : 0;
                if ($have < $need) json_out(400, array('error' => 'не хватает ' . res_name($res) . ': нужно ' . $need));
            }
            $profile['credits'] = $credits - $ship['price'];
            foreach ($ship['parts'] as $res => $need) {
                $profile['resources'][$res] = (int)$profile['resources'][$res] - $need;
            }
            $level = 0;
        } elseif ($kind === 'module') {
            $def = module_price($id);
            if (!$def) json_out(400, array('error' => 'неизвестный модуль'));
            if ($credits < $def['credits']) json_out(400, array('error' => 'нужно ' . $def['credits'] . ' кредитов'));
            if ($def['steel'] > 0) {
                $steel = isset($profile['resources']['steel']) ? (int)$profile['resources']['steel'] : 0;
                if ($steel < $def['steel']) json_out(400, array('error' => 'нужно ' . $def['steel'] . ' т стали'));
            }
            if ($def['chips'] > 0) {
                $chips = isset($profile['resources']['chips']) ? (int)$profile['resources']['chips'] : 0;
                if ($chips < $def['chips']) json_out(400, array('error' => 'нужно ' . $def['chips'] . ' чипов'));
            }
            $profile['credits'] = $credits - $def['credits'];
            if ($def['steel'] > 0) $profile['resources']['steel'] = (int)$profile['resources']['steel'] - $def['steel'];
            if ($def['chips'] > 0) $profile['resources']['chips'] = (int)$profile['resources']['chips'] - $def['chips'];
            $level = 0;
        } else {
            json_out(400, array('error' => 'неизвестный тип стройки'));
        }

        $titles = build_titles();
        $title = isset($titles[$id]) ? $titles[$id] : $id;
        $seconds = build_seconds($kind, $id, $level);
        if ($kind === 'ship') $seconds = (int)max(20, round($seconds / shipyard_speed($profile)));
        $item = array(
            'uid' => bin2hex(random_bytes(4)),
            'kind' => $kind,
            'id' => $id,
            'module' => $kind === 'module' ? $id : '',
            'level' => $level,
            'title' => $title,
            'startedAt' => time(),
            'endsAt' => time() + $seconds,
            'seconds' => $seconds,
        );
        quest_mark($profile, $kind === 'ship' ? 'ship' : ($kind === 'factory' ? 'build' : ''));
        $profile['buildQueue'][] = $item;
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('queued' => $item, 'queue' => $profile['buildQueue'], 'credits' => $profile['credits']));

    case 'build_status':
        if (!$me) json_out(401, array('error' => 'нужно войти в игру'));
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        build_norm_queue($profile);
        $applied = build_flush($profile);
        if (count($applied)) { profile_store($users, $idx, $profile); save_json($usersFile, $users); }
        $now = time();
        $queue = array();
        foreach ($profile['buildQueue'] as $item) {
            $item['remaining'] = max(0, (int)$item['endsAt'] - $now);
            $queue[] = $item;
        }
        json_out(200, array(
            'queue' => $queue,
            'applied' => $applied,
            'credits' => isset($profile['credits']) ? $profile['credits'] : 0,
            'factories' => isset($profile['factories']) ? $profile['factories'] : array(),
            'ships' => isset($profile['ships']) ? count($profile['ships']) : 0,
            'resources' => array(
                'steel' => isset($profile['resources']['steel']) ? $profile['resources']['steel'] : 0,
                'eternity' => isset($profile['resources']['eternity']) ? $profile['resources']['eternity'] : 0,
            ),
        ));

    case 'build_accelerate':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $uid = isset($input['uid']) ? $input['uid'] : '';
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        $found = -1;
        foreach ($profile['buildQueue'] as $i => $item) { if ($item['uid'] === $uid) { $found = $i; break; } }
        if ($found < 0) json_out(404, array('error' => 'стройка не найдена'));
        build_norm_queue($profile);
        $remaining = max(0, (int)$profile['buildQueue'][$found]['endsAt'] - time());
        // 1 кристалл за минуту, но не больше 240 (4 часа) — иначе сломанная
        // запись очереди превращала цену в миллиарды кристаллов
        $crystals = max(1, min(240, (int)ceil($remaining / 60)));
        $have = isset($profile['resources']['eternity']) ? (int)$profile['resources']['eternity'] : 0;
        if ($have < $crystals) json_out(400, array('error' => 'нужно ' . $crystals . ' кристаллов Вечности'));
        $profile['resources']['eternity'] = $have - $crystals;
        $profile['buildQueue'][$found]['endsAt'] = time();
        $applied = build_flush($profile);
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        json_out(200, array('crystals' => $crystals, 'applied' => $applied, 'eternity' => $profile['resources']['eternity']));


    // ---------------- БРОШЕННЫЕ МИРЫ ----------------

    case 'worlds_abandoned':
        $worlds = load_json($worldsFile, array());
        $out = array();
        foreach ($worlds as $w) {
            $days = (time() - (int)$w['abandonedAt']) / 86400;
            $rich = max(0, min(1, 1 - ($days - 30) / 60));
            $snap = isset($w['snapshot']) && is_array($w['snapshot']) ? $w['snapshot'] : array();
            $out[] = array(
                'id' => $w['id'],
                'name' => $w['name'],
                'owner' => $w['owner'],
                'days' => (int)round($days),
                'richness' => round($rich, 2),
                'population' => isset($snap['population']) ? (int)$snap['population'] : 0,
                'factories' => isset($snap['factories']) ? $snap['factories'] : array(),
                'ships' => isset($snap['ships']) ? (int)$snap['ships'] : 0,
                'reservedUntil' => isset($w['reservedUntil']) ? (int)$w['reservedUntil'] : 0,
                'reserved' => (isset($w['reservedUntil']) ? (int)$w['reservedUntil'] : 0) > time(),
            );
        }
        json_out(200, array('worlds' => $out));

    case 'colony_colonize':
        if ($method !== 'POST' || !$me) json_out(401, array('error' => 'нужно войти в игру'));
        $wid = isset($input['worldId']) ? $input['worldId'] : '';
        $idx = find_user($users, $me['Email']);
        $profile = profile_of($users, $idx);
        if (isset($profile['colony']) && is_array($profile['colony'])) json_out(400, array('error' => 'у вас уже есть колония'));
        $worlds = load_json($worldsFile, array());
        $found = -1;
        foreach ($worlds as $i => $w) { if ($w['id'] === $wid) { $found = $i; break; } }
        if ($found < 0) json_out(404, array('error' => 'мир уже занят или не найден'));
        $isOwner = norm($worlds[$found]['owner']) === norm($me['Email']);
        $reservedUntil = isset($worlds[$found]['reservedUntil']) ? (int)$worlds[$found]['reservedUntil'] : 0;
        $reserved = $reservedUntil > time();
        if ($reserved && !$isOwner) {
            json_out(400, array('error' => 'мир зарезервирован за прежним хозяином до ' . date('d.m.Y', $reservedUntil)));
        }
        // вернувшемуся хозяину в период резерва — бесплатно, остальным 200 000
        $cost = ($isOwner && $reserved) ? 0 : 300000;
        $credits = isset($profile['credits']) ? (float)$profile['credits'] : 0;
        if ($credits < $cost) json_out(400, array('error' => 'нужно ' . $cost . ' кредитов'));

        $w = $worlds[$found];
        $days = (time() - (int)$w['abandonedAt']) / 86400;
        $rich = max(0, min(1, 1 - ($days - 30) / 60));
        $snap = isset($w['snapshot']) && is_array($w['snapshot']) ? $w['snapshot'] : array();

        $pop = max(2000, (int)round((isset($snap['population']) ? (int)$snap['population'] : 50000) * $rich * 0.05));
        // Постройки не работают: это руины, их нужно восстанавливать отдельно.
        $ruins = array();
        if (isset($snap['factories']) && is_array($snap['factories'])) {
            foreach ($snap['factories'] as $fid => $lvl) {
                if (mt_rand(0, 1000) / 1000 <= $rich) {
                    // недавно брошенный мир (rich >= 0.75) позволяет поднять сразу 2 уровня
                    $ruins[] = array('id' => $fid, 'max' => $rich >= 0.75 ? 2 : 1);
                }
            }
        }
        $factories = array();
        $res = array();
        if (isset($snap['resources']) && is_array($snap['resources'])) {
            foreach ($snap['resources'] as $k => $v) {
                if ((float)$v > 0) $res[$k] = (int)round((float)$v * $rich * 0.1);
            }
        }

        $colony = colony_defaults();
        $colony['name'] = $w['name'];
        $colony['population'] = $pop;
        $colony['happiness'] = 45;
        $colony['founder'] = norm($me['Email']);
        $colony['inherited'] = array('from' => $w['owner'], 'days' => (int)round($days), 'richness' => $rich, 'ruins' => $ruins);

        $profile['credits'] = $credits - $cost;
        $colony['ruins'] = $ruins;
        $profile['colony'] = $colony;
        $profile['factories'] = $factories;
        if (!isset($profile['resources']) || !is_array($profile['resources'])) $profile['resources'] = array();
        foreach ($res as $k => $v) { $profile['resources'][$k] = (isset($profile['resources'][$k]) ? (int)$profile['resources'][$k] : 0) + $v; }

        array_splice($worlds, $found, 1);
        // прежний хозяин потерял колонию — при следующем входе начнёт с нуля
        if (!$isOwner) {
            $oldIdx = find_user($users, $w['owner']);
            if ($oldIdx >= 0) {
                $op = json_decode($users[$oldIdx]['Profile'], true);
                if (!is_array($op)) $op = array();
                $op['resetPending'] = true;
                $op['resetBy'] = norm($me['Email']);
                $users[$oldIdx]['Profile'] = json_encode($op, JSON_UNESCAPED_UNICODE);
            }
        }
        profile_store($users, $idx, $profile);
        save_json($usersFile, $users);
        save_json($worldsFile, $worlds);
        json_out(200, array('colony' => $colony, 'credits' => $profile['credits'], 'ruins' => $ruins, 'resources' => $res, 'cost' => $cost));

    default:
        json_out(404, array('error' => 'unknown endpoint'));
}
