// Замер РЕАЛЬНОГО движения по кадрам страницы (не по теории).
// Запуск: node galaktika/tools/measure_live.js
// Требует: galaktika/reports/_token.txt и Google Chrome.
// Метод: два кадра с ?freeze=<секунды>, парсим маркеры бортов, считаем скорость.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const KM_PER_PX = 149600000 / 185;

function dump(freezeSec) {
    const url = `https://warbattleuniverse.com/?shot=1&onb=1&freeze=${freezeSec}&token=${token}&r=${Date.now()}`;
    const file = path.join(OUT, `_meas_${freezeSec}.html`);
    const html = execFileSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
        '--virtual-time-budget=12000', '--dump-dom', url],
        { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString('utf8');
    fs.writeFileSync(file, html, 'utf8');
    return html;
}

function markers(html) {
    const out = {};
    const re = /title="([^"]+)"[^>]*data-seed="(\d+)"[^>]*data-core-x="(-?[\d.]+)"[^>]*data-core-y="(-?[\d.]+)"/g;
    let m;
    while ((m = re.exec(html))) {
        const [, title, seed, x, y] = m;
        out[seed] = { title, x: parseFloat(x), y: parseFloat(y) };
    }
    return out;
}

const a = markers(dump(0));
const b = markers(dump(600));
const keys = Object.keys(a).filter(k => b[k]);
if (!keys.length) {
    console.log('НЕ НАЙДЕНО маркеров с координатами — сцена не построилась в кадре');
    process.exit(0);
}

const rows = [];
for (const k of keys) {
    const d = Math.hypot(b[k].x - a[k].x, b[k].y - a[k].y);
    const v = d * KM_PER_PX / 600;         // км/с
    rows.push({ title: a[k].title, seed: k, px: d, vKmS: v, c: v / 299792 });
}
rows.sort((x, y) => y.vKmS - x.vKmS);
console.log('=== ЗАМЕР ЖИВОГО ДВИЖЕНИЯ (600 игровых секунд) ===');
console.log(`маркеров: ${rows.length}`);
for (const r of rows) {
    console.log(`  ${String(Math.round(r.vKmS)).padStart(8)} км/с  ${r.c.toFixed(3)} c   ${r.title.slice(0, 34)}`);
}
const over = rows.filter(r => r.c > 0.25);
console.log(over.length ? `\nБЫСТРЕЕ 0,25 c: ${over.length}` : '\nвсе в пределах 0,25 c');
