// Тесты ядра систем: изоляция, валидация, атомарная подмена, отсутствие регрессий.
// node galaktika/tools/system_runtime_test.js
'use strict';
const path = require('path');
const jsDir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');
const R = require(path.join(jsDir, 'system-runtime.js'));
global.SceneModel = require(path.join(jsDir, 'scene-model.js'));

const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

function sys(id, extra) {
    return Object.assign({
        id: id, px_per_au: 185, time_scale: 1,
        bodies: [
            { id: 'sun', class: 'star', radius_km: 696340 },
            { id: 'p1', class: 'planet', a: 1, P: 365, e: 0.01, radius_km: 6371 },
            { id: 'p2', class: 'planet', a: 2, P: 700, e: 0.05, radius_km: 3390 }
        ],
        ships: [{ id: 'light', vmax_c: 0.25 }],
        agents: [{ id: 'a1', class: 'light', role: 'trade', count: 3 }]
    }, extra || {});
}

// 1) корректная система регистрируется
check('регистрация корректной', R.register(sys('sol')) === 'sol', JSON.stringify(R.lastError()));

// 2) вторая система не ломает первую
check('регистрация второй', R.register(sys('war')) === 'war', JSON.stringify(R.lastError()));
check('обе в списке', R.list().length === 2, JSON.stringify(R.list()));

// 3) битые данные отклоняются, рабочая остаётся активной
R.activate('sol');
const bad = R.register({ id: 'bad', bodies: [{ id: 'x', class: 'unknown' }] });
check('битая отклонена', bad === null, JSON.stringify(R.lastError() && R.lastError().errors.slice(0, 2)));
check('активная не сменилась', R.currentId() === 'sol', R.currentId());

// 4) нет звезды — отклонение
check('без звезды отклонена', R.register({ id: 'nostar', bodies: [{ id: 'p', class: 'planet', P: 10 }] }) === null);
// 5) дубль id — отклонение
check('дубль id отклонён', R.register({ id: 'dup', bodies: [
    { id: 'sun', class: 'star' }, { id: 'sun', class: 'planet', P: 1 }] }) === null);
// 6) луна с несуществующим родителем — отклонение
check('луна без родителя отклонена', R.register({ id: 'orph', bodies: [
    { id: 'sun', class: 'star' }, { id: 'm', class: 'moon', parent: 'nowhere', P: 1 }] }) === null);
// 7) агент с неизвестным классом — отклонение
check('агент без класса отклонён', R.register({ id: 'ag', bodies: [{ id: 'sun', class: 'star' }],
    ships: [], agents: [{ id: 'a', class: 'nope' }] }) === null);

// 8) атомарная подмена: перерегистрация sol новыми данными
const v2 = sys('sol', { px_per_au: 200 });
check('подмена sol', R.register(v2) === 'sol');
const f = R.frame(0, { scale: 1, tilt: 0, spin: 0, cx: 0, cy: 0 });
check('кадр из активной', f.length === 3, f.length + ' тел');
const p1 = f.find(b => b.id === 'p1');
check('масштаб применился', p1 && Math.abs(p1.orbit.r - 200) < 5, p1 && p1.orbit.r.toFixed(1));
check('масштаб не утёк', global.SceneModel.pxPerAu === 185, global.SceneModel.pxPerAu);

// 9) переключение на вторую и обратно — без потерь
R.activate('war');
check('переключение на war', R.currentId() === 'war');
R.activate('sol');
check('возврат на sol', R.currentId() === 'sol' && R.frame(0, { scale: 1 }).length === 3);

// 10) активация несуществующей — false, текущая не меняется
check('активация неизвестной', R.activate('nope') === false && R.currentId() === 'sol');

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
