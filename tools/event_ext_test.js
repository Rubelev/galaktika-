const path = require('path');
const S = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'event-sandbox.js'));
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

const ro = S.SCENARIOS['reactor-overheat'];
check('реактор: сценарий валиден', S.validate(ro).ok, JSON.stringify(S.validate(ro).errors));

let st = S.create(ro);
const t0 = Date.now();
S.tick(ro, st, t0 + 600001);
check('таймер провалил событие', st.failed === true, st.failReason);
check('после провала шаги недоступны', S.can(ro, st, 'open-valve').ok === false, S.can(ro, st, 'open-valve').error);

let st2 = S.create(ro);
S.apply(ro, st2, 'take-extinguisher');
check('огнетушитель взят', st2.items.ext === true);
S.apply(ro, st2, 'open-valve');
check('клапан открыт и огнетушитель израсходован', st2.items.ext === false, 'ext=' + st2.items.ext);
check('ветвление: сброс пара доступен через первый путь', S.can(ro, st2, 'vent').ok === true);
S.apply(ro, st2, 'vent');
check('реактор запущен', S.apply(ro, st2, 'restart').ok && st2.stage === 'done');

// второй путь: замкнуть насос
let st3 = S.create(ro);
S.apply(ro, st3, 'take-extinguisher');
S.apply(ro, st3, 'bypass-pump');
check('второй путь: сброс пара доступен', S.can(ro, st3, 'vent').ok === true);
check('запуск после второго пути', S.apply(ro, st3, 'vent').ok && S.apply(ro, st3, 'restart').ok);

// таймер не срабатывает, если успел
let st4 = S.create(ro);
S.apply(ro, st4, 'take-extinguisher');
S.tick(ro, st4, t0 + 900000);
check('успел — провала нет', st4.failed === false);

// автопроход старого сценария не сломан
const auto = S.autoPlay(S.SCENARIOS['station-accident']);
check('старый сценарий проходится', auto.ok, 'шагов ' + auto.steps);

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);