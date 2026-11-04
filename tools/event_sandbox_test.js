// Тесты движка сценариев: порядок, предметы, автопроход, валидация.
const path = require('path');
const S = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'event-sandbox.js'));
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

const sc = S.SCENARIOS['station-accident'];
check('сценарий валиден', S.validate(sc).ok, JSON.stringify(S.validate(sc).errors));

let st = S.create(sc);
check('нельзя взять предохранитель первым', S.can(sc, st, 'take-fuse').ok === false, S.can(sc, st, 'take-fuse').error);
check('первый шаг доступен', S.apply(sc, st, 'find-warehouse').ok);
check('предохранитель взят', S.apply(sc, st, 'take-fuse').ok && st.items.fuse);
check('нельзя чинить без инструментов', S.can(sc, st, 'repair-main').ok === false);
check('инструменты взяты', S.apply(sc, st, 'take-tools').ok && st.items.tools);
check('главный терминал', S.apply(sc, st, 'repair-main').ok);
check('вспомогательный', S.apply(sc, st, 'repair-aux').ok);
check('щитовая', S.apply(sc, st, 'run-shield').ok);
check('питание', S.apply(sc, st, 'power-on').ok && st.stage === 'done');

const auto = S.autoPlay(sc);
check('автопроход завершён', auto.ok, 'шагов ' + auto.steps);
check('в автопроходе нет ошибок', auto.transcript.every(t => t.ok), JSON.stringify(auto.transcript.filter(t => !t.ok)));

const sc2 = S.SCENARIOS['coolant-leak'];
check('второй сценарий валиден', S.validate(sc2).ok);
const auto2 = S.autoPlay(sc2);
check('второй сценарий проходится', auto2.ok, 'шагов ' + auto2.steps);

const bad = { id: 'bad', steps: [{ id: 'a', requires: ['nope'] }] };
check('битый сценарий отклонён', S.validate(bad).ok === false, JSON.stringify(S.validate(bad).errors));

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);