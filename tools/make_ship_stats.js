// ЕДИНЫЙ ИСТОЧНИК характеристик кораблей (C-08).
// Читает клиентскую таблицу SHIPS из js/solar.js — она объявлена источником правды —
// и генерирует:
//   deploy-host/site/lib/ship_stats.php   (серверная таблица: hp/dmg/speed/price)
//   reports/ship_stats_client.json        (эталон для теста сверки)
// Боевые проекции (арена, живой бой) перенесены 1:1 и баланс не меняют:
//   SHIP_COMBAT_STATS ← api.php:combat_ship_table()  (hull 900..12000 — другая единица)
//   BATTLE_CLASS_HP   ← battle_core.php:BATTLE_HP     (3 класса движения)
// Запуск: node galaktika/tools/make_ship_stats.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const solarPath = path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js', 'solar.js');
const src = fs.readFileSync(solarPath, 'utf8');

// ---- 1. Вырезаем объект SHIPS по балансу скобок ----
const start = src.indexOf('const SHIPS = {');
if (start < 0) { console.error('SHIPS не найден в solar.js'); process.exit(1); }
const open = src.indexOf('{', start);
let depth = 0, end = -1;
for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error('не закрыт объект SHIPS'); process.exit(1); }
const block = src.slice(open, end + 1);
const blockHash = crypto.createHash('sha256').update(block).digest('hex');

// ---- 2. Разбиваем на записи верхнего уровня: id: { ... } ----
const entries = [];
let i = 1; // после {
while (i < block.length - 1) {
    const m = /([A-Za-z_][\w]*)\s*:\s*\{/.exec(block.slice(i));
    if (!m) break;
    const entryStart = i + m.index;
    const braceAt = block.indexOf('{', entryStart);
    let d = 0, close = -1;
    for (let k = braceAt; k < block.length; k++) {
        if (block[k] === '{') d++;
        else if (block[k] === '}') { d--; if (d === 0) { close = k; break; } }
    }
    if (close < 0) { console.error('не закрыта запись ' + m[1]); process.exit(1); }
    entries.push({ id: m[1], body: block.slice(braceAt, close + 1) });
    i = close + 1;
}

// ---- 3. Поля ----
function num(re, body, what, id) {
    const mm = re.exec(body);
    if (!mm) { console.error('нет поля ' + what + ' у ' + id); process.exit(1); }
    return Number(mm[1]);
}
const ships = [];
for (const e of entries) {
    const b = e.body;
    const name = /name:\s*'([^']*)'/.exec(b);
    const gunBlock = /guns:\s*\[([\s\S]*?)\]/.exec(b);
    if (!name || !gunBlock) { console.error('нет name/guns у ' + e.id); process.exit(1); }
    const gunDmg = (gunBlock[1].match(/d:\s*(\d+)/g) || []).map(x => Number(x.replace(/\D+/g, '')));
    const dmg = gunDmg.reduce((a, x) => a + x, 0);
    const parts = {};
    const pm = /parts:\s*\{([^}]*)\}/.exec(b);
    if (pm) {
        const re = /([a-z_]+)\s*:\s*(\d+)/g;
        let q;
        while ((q = re.exec(pm[1]))) parts[q[1]] = Number(q[2]);
    }
    ships.push({
        id: e.id,
        name: name[1],
        hp: num(/hull:\s*(\d+)/, b, 'hull', e.id),
        shield: num(/shield:\s*(\d+)/, b, 'shield', e.id),
        dmg: dmg,
        speed: num(/speed:\s*([\d.]+)/, b, 'speed', e.id),
        price: num(/price:\s*(\d+)/, b, 'price', e.id),
        guns: gunDmg.length,
        parts: parts
    });
}

if (ships.length !== 9) { console.error('ожидалось 9 моделей, найдено ' + ships.length); process.exit(1); }
for (const s of ships) {
    if (!(s.hp > 0 && s.dmg > 0 && s.price > 0 && s.speed > 0)) {
        console.error('неполные характеристики: ' + JSON.stringify(s)); process.exit(1);
    }
}

// ---- 4. Боевые проекции: 1:1 из текущих серверных таблиц (баланс не меняется) ----
const COMBAT = {
    jet_scout:          { name: 'Разведчик «Искра»',     hull: 900,   shield: 300,  armor: 0.10, evade: 0.25, energy: 60,  slots: 1 },
    jet_hauler:         { name: 'Тягач «Мул»',           hull: 1800,  shield: 200,  armor: 0.20, evade: 0.05, energy: 70,  slots: 1 },
    ion_courier:        { name: 'Курьер «Стриж»',        hull: 1200,  shield: 500,  armor: 0.15, evade: 0.18, energy: 80,  slots: 2 },
    ion_corsair:        { name: 'Корсар «Клык»',         hull: 1600,  shield: 700,  armor: 0.20, evade: 0.15, energy: 100, slots: 2 },
    ion_prospector:     { name: 'Геолог «Бур»',          hull: 2000,  shield: 400,  armor: 0.30, evade: 0.05, energy: 90,  slots: 1 },
    plasma_interceptor: { name: 'Перехватчик «Сабля»',   hull: 1400,  shield: 800,  armor: 0.15, evade: 0.30, energy: 110, slots: 2 },
    plasma_lancer:      { name: 'Ланцер «Пика»',         hull: 2200,  shield: 1100, armor: 0.25, evade: 0.12, energy: 130, slots: 3 },
    grav_frigate:       { name: 'Фрегат «Щит»',          hull: 4200,  shield: 2000, armor: 0.35, evade: 0.08, energy: 170, slots: 4 },
    grav_colossus:      { name: 'Колосс «Титан»',        hull: 12000, shield: 5500, armor: 0.45, evade: 0.02, energy: 260, slots: 5 }
};
const BATTLE_CLASS = { fighter: 40, light: 30, hauler: 20 };

// ---- 5. PHP ----
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const phpVal = v => {
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === 'string') return q(v);
    if (Array.isArray(v)) return 'array(' + v.map(phpVal).join(', ') + ')';
    if (v && typeof v === 'object') {
        return 'array(' + Object.keys(v).map(k => q(k) + ' => ' + phpVal(v[k])).join(', ') + ')';
    }
    return 'null';
};
// ---- 5. Имена: серверные модели называются РОВНО как в SHIPS (C-10).
// id не меняются (сохранения игроков), меняется только отображаемое имя.
const clientName = Object.fromEntries(ships.map(s => [s.id, s.name]));
for (const id in COMBAT) {
    if (clientName[id]) COMBAT[id].name = clientName[id];
}
const ratios = ships.map(s => COMBAT[s.id].hull / s.hp);
const minR = Math.min.apply(null, ratios), maxR = Math.max.apply(null, ratios);
const rTxt = (Math.round(minR * 10) / 10) + '×…' + (Math.round(maxR * 10) / 10) + '×';

const lines = [];
lines.push('<?php');
lines.push('// ============================================================================');
lines.push('//  SHIP_STATS.PHP — ЕДИНЫЙ ИСТОЧНИК характеристик кораблей (C-08/C-10).');
lines.push('//  СГЕНЕРИРОВАНО: tools/make_ship_stats.js из клиентской таблицы SHIPS');
lines.push('//  (src/galaktika.Web/wwwroot/js/solar.js). Руками не править — правка');
lines.push('//  откатится при следующей генерации; меняйте SHIPS и перегенерируйте.');
lines.push('//');
lines.push('//  ДВЕ ШКАЛЫ, ОДИН ИСТОЧНИК (решение владельца: не сводить, C-08):');
lines.push('//    SHIP_STATS        — карточка/цена/витрина: hp (=hull) 40…620, dmg (сумма guns.d),');
lines.push('//                        speed, price 18 000…320 000. Это клиентская шкала.');
lines.push('//    SHIP_COMBAT_STATS — боевая арена: hull 900…12 000, shield, armor/evade/energy/slots.');
lines.push('//                        ОТДЕЛЬНАЯ боевая шкала, не «hp»: отношение к карточке ' + rTxt + '.');
lines.push('//    BATTLE_CLASS_HP   — живой бой: 3 класса движения (fighter 40, light 30, hauler 20).');
lines.push('//  Сводить арену и карточку в одну величину — отдельное решение владельца баланса,');
lines.push('//  в C-08 сознательно НЕ делалось (это изменило бы исходы боёв).');
lines.push('//  Имена серверных моделей = имена в SHIPS (C-10), id не менялись.');
lines.push('// ============================================================================');
lines.push('');
lines.push('const SHIP_STATS_SOURCE = ' + q('solar.js SHIPS sha256:' + blockHash) + ';');
lines.push('const SHIP_STATS_GENERATED = ' + q(new Date().toISOString().slice(0, 19) + 'Z') + ';');
lines.push('');
lines.push('const SHIP_STATS = ' + phpVal(Object.fromEntries(ships.map(s => [s.id, {
    name: s.name, hp: s.hp, shield: s.shield, dmg: s.dmg, speed: s.speed, price: s.price,
    guns: s.guns, parts: s.parts
}]))) + ';');
lines.push('');
lines.push('const SHIP_COMBAT_STATS = ' + phpVal(COMBAT) + ';');
lines.push('');
lines.push('const BATTLE_CLASS_HP = ' + phpVal(BATTLE_CLASS) + ';');
lines.push('');
lines.push('function ship_stat($id) { return isset(SHIP_STATS[$id]) ? SHIP_STATS[$id] : null; }');
lines.push('function ship_combat_stat($id) { return isset(SHIP_COMBAT_STATS[$id]) ? SHIP_COMBAT_STATS[$id] : null; }');
lines.push('function battle_class_hp($cls) { return isset(BATTLE_CLASS_HP[$cls]) ? BATTLE_CLASS_HP[$cls] : BATTLE_CLASS_HP[\'fighter\']; }');
lines.push('');
const phpPath = path.join(ROOT, 'deploy-host', 'site', 'lib', 'ship_stats.php');
fs.writeFileSync(phpPath, lines.join('\n'), 'utf8');

// ---- 6. Фикстура для теста: клиентские значения ----
const fixture = {
    source: 'solar.js SHIPS',
    sha256: blockHash,
    ships: ships.map(s => ({ id: s.id, name: s.name, hp: s.hp, dmg: s.dmg, price: s.price, speed: s.speed, guns: s.guns, parts: s.parts }))
};
const fxPath = path.join(ROOT, 'reports', 'ship_stats_client.json');
fs.writeFileSync(fxPath, JSON.stringify(fixture, null, 1), 'utf8');

console.log('моделей: ' + ships.length + ' | клиентская шкала и боевые проекции записаны');
console.log('  ' + phpPath);
console.log('  ' + fxPath);
console.log('  sha256 SHIPS-блока: ' + blockHash.slice(0, 16) + '…');
console.log('  ' + ships.map(s => s.id + ': hp=' + s.hp + ' dmg=' + s.dmg + ' speed=' + s.speed + ' price=' + s.price).join('\n  '));
