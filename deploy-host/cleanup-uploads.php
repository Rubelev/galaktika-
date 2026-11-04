<?php
// Уборка вложений пожеланий: удаляет файлы, на которые уже не ссылаются записи,
// и брошенные куски загрузок старше часа. Запускается по cron раз в час.
$dataDir = '/var/www/u3699164/data/www/galaktika-data';
if (!is_dir($dataDir)) { fwrite(STDERR, "нет каталога данных\n"); exit(1); }

$feedbackFile = $dataDir . '/feedback.json';
$uploadDir = __DIR__ . '/uploads/feedback';
$tmpDir = $dataDir . '/uploads-tmp';

$list = array();
if (is_file($feedbackFile)) {
    $raw = file_get_contents($feedbackFile);
    $list = json_decode($raw, true);
    if (!is_array($list)) $list = array();
}

// какие файлы ещё нужны: только у непрочитанных пожеланий
$keep = array();
foreach ($list as $f) {
    if (!empty($f['filesRemoved'])) continue;
    if (!isset($f['status']) || !in_array($f['status'], array('new', 'review'), true)) continue;
    if (empty($f['attachments']) || !is_array($f['attachments'])) continue;
    foreach ($f['attachments'] as $att) {
        if (!empty($att['url'])) $keep[basename($att['url'])] = true;
    }
}

$removed = 0;
if (is_dir($uploadDir)) {
    foreach (glob($uploadDir . '/*') as $path) {
        $name = basename($path);
        if ($name === '.htaccess') continue;
        if (isset($keep[$name])) continue;
        if (@unlink($path)) $removed++;
    }
}

$tmpRemoved = 0;
if (is_dir($tmpDir)) {
    foreach (glob($tmpDir . '/*.part') as $part) {
        if (time() - filemtime($part) > 3600) { if (@unlink($part)) $tmpRemoved++; }
    }
}

echo date('c') . " ok: файлов удалено " . $removed . ", частей загрузок " . $tmpRemoved . "\n";
