<?php
// ============================================================================
//  BOT_DB.PHP — журнал ботов и база проблем в SQLite.
//
//  Зачем: JSON-логи неудобно фильтровать и они не переживают параллельную
//  запись. Теперь каждый бот пишет в таблицы bot_log и bot_issue.
//
//  Таблицы:
//    bot_log   — все действия ботов (civ, mob, engineer): кто, что, когда;
//    bot_issue — агрегированные проблемы: код, важность, счётчик, статус.
// ============================================================================

function bot_db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $path = isset($GLOBALS['botDbPath']) && $GLOBALS['botDbPath']
        ? $GLOBALS['botDbPath']
        : '/var/www/u3699164/data/galaktika.sqlite';
    try {
        $pdo = new PDO('sqlite:' . $path);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec("CREATE TABLE IF NOT EXISTS bot_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            bot TEXT NOT NULL,
            kind TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'info',
            action TEXT NOT NULL,
            payload TEXT
        )");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_bot_log_ts ON bot_log(ts)");
        $pdo->exec("CREATE TABLE IF NOT EXISTS bot_issue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot TEXT NOT NULL,
            code TEXT NOT NULL,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            context TEXT,
            count INTEGER NOT NULL DEFAULT 1,
            first_ts INTEGER NOT NULL,
            last_ts INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            UNIQUE(bot, code)
        )");
    } catch (Exception $e) {
        $pdo = false;
    }
    return $pdo;
}

function bot_log($bot, $kind, $action, $payload = null, $level = 'info') {
    $pdo = bot_db();
    if (!$pdo) return false;
    try {
        $stmt = $pdo->prepare("INSERT INTO bot_log(ts,bot,kind,level,action,payload) VALUES(?,?,?,?,?,?)");
        $stmt->execute(array(time(), $bot, $kind, $level, $action,
            is_array($payload) ? json_encode($payload, JSON_UNESCAPED_UNICODE) : (string)$payload));
        return true;
    } catch (Exception $e) { return false; }
}

// Записать/обновить проблему: одинаковый (bot, code) суммируется
function bot_issue($bot, $code, $severity, $message, $context = null) {
    $pdo = bot_db();
    if (!$pdo) return false;
    $now = time();
    try {
        $stmt = $pdo->prepare("INSERT INTO bot_issue(bot,code,severity,message,context,count,first_ts,last_ts,status)
            VALUES(?,?,?,?,?,1,?,?,'open')
            ON CONFLICT(bot,code) DO UPDATE SET
                count=count+1, last_ts=excluded.last_ts, message=excluded.message,
                severity=excluded.severity, context=excluded.context, status='open'");
        $stmt->execute(array($bot, $code, $severity, $message,
            is_array($context) ? json_encode($context, JSON_UNESCAPED_UNICODE) : (string)$context, $now, $now));
        return true;
    } catch (Exception $e) { return false; }
}

// Закрыть проблему (когда проверка больше не находит её)
function bot_issue_close($bot, $code, $status = 'fixed') {
    $pdo = bot_db();
    if (!$pdo) return false;
    try {
        $stmt = $pdo->prepare("UPDATE bot_issue SET status=?, last_ts=? WHERE bot=? AND code=?");
        $stmt->execute(array($status, time(), $bot, $code));
        return true;
    } catch (Exception $e) { return false; }
}

function bot_issues($status = 'open', $limit = 50) {
    $pdo = bot_db();
    if (!$pdo) return array();
    try {
        $stmt = $pdo->prepare("SELECT * FROM bot_issue WHERE status=? ORDER BY
            CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            last_ts DESC LIMIT ?");
        $stmt->execute(array($status, (int)$limit));
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) { return array(); }
}

function bot_log_recent($limit = 50, $bot = null, $level = null) {
    $pdo = bot_db();
    if (!$pdo) return array();
    $sql = "SELECT * FROM bot_log WHERE 1=1";
    $args = array();
    if ($bot) { $sql .= " AND bot=?"; $args[] = $bot; }
    if ($level) { $sql .= " AND level=?"; $args[] = $level; }
    $sql .= " ORDER BY id DESC LIMIT ?";
    $args[] = (int)$limit;
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($args);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) { return array(); }
}

function bot_log_stats() {
    $pdo = bot_db();
    if (!$pdo) return array('total' => 0, 'by_bot' => array(), 'errors24' => 0);
    try {
        $total = (int)$pdo->query("SELECT COUNT(*) FROM bot_log")->fetchColumn();
        $rows = $pdo->query("SELECT bot, COUNT(*) c FROM bot_log GROUP BY bot")->fetchAll(PDO::FETCH_ASSOC);
        $byBot = array();
        foreach ($rows as $r) $byBot[$r['bot']] = (int)$r['c'];
        $err = (int)$pdo->query("SELECT COUNT(*) FROM bot_log WHERE level IN ('error','critical') AND ts > " . (time() - 86400))->fetchColumn();
        return array('total' => $total, 'by_bot' => $byBot, 'errors24' => $err);
    } catch (Exception $e) { return array('total' => 0, 'by_bot' => array(), 'errors24' => 0); }
}

// Ротация: держим последние N записей журнала
function bot_log_prune($keep = 50000) {
    $pdo = bot_db();
    if (!$pdo) return 0;
    try {
        $maxId = (int)$pdo->query("SELECT MAX(id) FROM bot_log")->fetchColumn();
        if ($maxId <= $keep) return 0;
        return $pdo->exec("DELETE FROM bot_log WHERE id <= " . ($maxId - $keep));
    } catch (Exception $e) { return 0; }
}
