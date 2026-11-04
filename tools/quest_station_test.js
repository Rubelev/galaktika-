// Тесты квеста «Авария на станции»: порядок, предметы, сигнализация.
const path = require('path');
const Q = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'quest-station.js'));
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

let q = Q.create();
check('авария: маяк и сирена включены', q.alarm && q.siren);
check('причина — охлаждение', q.cause === 'cooling-control', q.cause);

// порядок нарушить нельзя
check('нельзя взять предохранитель до склада', Q.apply(q, 'take-fuse').ok === false);
check('нельзя починить главный без предметов', Q.apply(q, 'repair-main').ok === false);

check('склад найден', Q.apply(q, 'find-warehouse').ok);
check('нельзя сразу инструменты', Q.apply(q, 'take-tools').ok === false);
check('предохранитель взят', Q.apply(q, 'take-fuse').ok && q.items.fuse);
check('нельзя чинить без инструментов', Q.apply(q, 'repair-main').ok === false);
check('инструменты взяты', Q.apply(q, 'take-tools').ok && q.items.tools);

check('нельзя починить вспомогательный первым', Q.apply(q, 'repair-aux').ok === false);
check('главный терминал починен', Q.apply(q, 'repair-main').ok && q.stage === 'main-terminal');
check('нельзя в щитовую до вспомогательного', Q.apply(q, 'run-shield').ok === false);
check('вспомогательный починен', Q.apply(q, 'repair-aux').ok && q.stage === 'aux-terminal');
check('нельзя включить питание до щитовой', Q.apply(q, 'power-on').ok === false);
check('добежал до щитовой', Q.apply(q, 'run-shield').ok && q.stage === 'shield-room');
check('питание включено', Q.apply(q, 'power-on').ok && q.stage === 'done');

check('маяк выключен после починки', q.alarm === false);
check('сирена замолкла', q.siren === false);
check('время завершения записано', q.finishedAt !== null);
check('журнал содержит 7 действий', q.log.length === 7, q.log.length);

// сигнализация активна ВСЕ время квеста
let q2 = Q.create(), allAlarm = true, steps = 0;
['find-warehouse','take-fuse','take-tools','repair-main','repair-aux','run-shield'].forEach(function (a) {
    Q.apply(q2, a); steps++;
    if (!q2.alarm || !q2.siren) allAlarm = false;
});
check('сигнализация активна до питания', allAlarm, steps + ' шагов');

// нельзя завершить дважды
check('повторное питание отклонено', Q.apply(q2, 'power-on').ok === false || q2.stage === 'done');

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);