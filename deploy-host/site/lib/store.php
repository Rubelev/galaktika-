<?php
// ============================================================================
//  STORE.PHP — состояние игры в SQLite (этап 1 шардинга).
//
//  Зачем: JSON-файл нельзя безопасно писать из двух процессов, а без этого
//  не бывает ни второго сервера, ни шарда по системе.
//
//  Как устроено:
//    • таблица users(email, role, salt, hash, profile, updated_at) — истина;
//    • users.json остаётся СНИМКОМ (для аудита и аварийного отката);
//    • load_json/save_json в api.php для users.json прозрачно ходят сюда,
//      поэтому 70+ мест вызова править не нужно;
//    • при первом запуске данные импортируются из users.json.
// ============================================================================

const STORE_DB = '/var/www/u3699164/data/galaktika.sqlite';

function store_db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    try {
        $pdo = new PDO('sqlite:' . STORE_DB);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec("PRAGMA journal_mode=WAL");
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            role TEXT,
            salt TEXT,
            hash TEXT,
            profile TEXT,
            updated_at INTEGER
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
        // ДОКУМЕНТЫ: произвольные JSON-состояния (presence, market, chat, orders…)
        $pdo->exec("CREATE TABLE IF NOT EXISTS docs (
            name TEXT PRIMARY KEY,
            data TEXT,
            updated_at INTEGER
        )");
    } catch (Exception $e) {
        $pdo = false;      // SQLite недоступен — работаем как раньше, через JSON
    }
    return $pdo;
}

// Импорт из users.json при первом запуске
function store_import($users) {
    $pdo = store_db();
    if (!$pdo) return 0;
    $n = 0;
    $stmt = $pdo->prepare("INSERT OR REPLACE INTO users(email,role,salt,hash,profile,updated_at) VALUES(?,?,?,?,?,?)");
    foreach ((array)$users as $u) {
        if (!isset($u['Email'])) continue;
        $email = strtolower(trim($u['Email']));
        $profile = isset($u['Profile']) ? $u['Profile'] : '{}';
        $stmt->execute(array($email, isset($u['Role']) ? $u['Role'] : 'user',
            isset($u['Salt']) ? $u['Salt'] : '', isset($u['Hash']) ? $u['Hash'] : '',
            $profile, time()));
        $n++;
    }
    $pdo->prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('imported',?)")->execute(array((string)time()));
    return $n;
}

// Чтение пользователей из SQLite (формат совместим с прежним массивом)
function store_users_load($fallback = array()) {
    $pdo = store_db();
    if (!$pdo) return $fallback;
    try {
        $rows = $pdo->query("SELECT email,role,salt,hash,profile FROM users ORDER BY email")->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) return $fallback;      // пусто — вызывающий загрузит JSON и потом импортирует
        $out = array();
        foreach ($rows as $r) {
            $out[] = array('Email' => $r['email'], 'Role' => $r['role'],
                           'Salt' => $r['salt'], 'Hash' => $r['hash'], 'Profile' => $r['profile']);
        }
        return $out;
    } catch (Exception $e) {
        return $fallback;
    }
}

// Запись пользователей в SQLite (полная синхронизация)
function store_users_save($users) {
    $pdo = store_db();
    if (!$pdo) return false;
    try {
        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM users");
        $stmt = $pdo->prepare("INSERT OR REPLACE INTO users(email,role,salt,hash,profile,updated_at) VALUES(?,?,?,?,?,?)");
        foreach ((array)$users as $u) {
            if (!isset($u['Email'])) continue;
            $stmt->execute(array(strtolower(trim($u['Email'])),
                isset($u['Role']) ? $u['Role'] : 'user',
                isset($u['Salt']) ? $u['Salt'] : '',
                isset($u['Hash']) ? $u['Hash'] : '',
                isset($u['Profile']) ? $u['Profile'] : '{}',
                time()));
        }
        $pdo->commit();
        return true;
    } catch (Exception $e) {
        try { $pdo->rollBack(); } catch (Exception $x) { }
        return false;
    }
}

function store_count() {
    $pdo = store_db();
    if (!$pdo) return -1;
    try { return (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(); }
    catch (Exception $e) { return -1; }
}

function store_available() { return store_db() !== false; }


// ---------- универсальные документы (presence, market, chat, orders, builds…) ----------
function store_doc_load($name, $fallback = null) {
    $pdo = store_db();
    if (!$pdo) return $fallback;
    try {
        $stmt = $pdo->prepare("SELECT data FROM docs WHERE name = ?");
        $stmt->execute(array($name));
        $raw = $stmt->fetchColumn();
        if ($raw === false || $raw === null) return $fallback;
        $data = json_decode($raw, true);
        return is_array($data) ? $data : $fallback;
    } catch (Exception $e) { return $fallback; }
}

function store_doc_save($name, $data) {
    $pdo = store_db();
    if (!$pdo) return false;
    try {
        $stmt = $pdo->prepare("INSERT OR REPLACE INTO docs(name,data,updated_at) VALUES(?,?,?)");
        $stmt->execute(array($name, json_encode($data, JSON_UNESCAPED_UNICODE), time()));
        return true;
    } catch (Exception $e) { return false; }
}

function store_doc_count() {
    $pdo = store_db();
    if (!$pdo) return -1;
    try { return (int)$pdo->query("SELECT COUNT(*) FROM docs")->fetchColumn(); }
    catch (Exception $e) { return -1; }
}

function store_doc_names() {
    $pdo = store_db();
    if (!$pdo) return array();
    try { return $pdo->query("SELECT name FROM docs ORDER BY name")->fetchAll(PDO::FETCH_COLUMN); }
    catch (Exception $e) { return array(); }
}
