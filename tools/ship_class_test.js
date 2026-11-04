// Шаг 2.1: физика классов читается из каталога (ship_class)
const fs = require('fs'), path = require('path'), vm = require('vm');
const jsDir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

function load(withCatalog, mutate) {
    const sandbox = { window: {}, console, performance: { now: () => Date.now() }, Date, Math, isFinite, JSON, document: { createElement: () => ({ style: {} }), querySelector: () => null, addEventListener: () => {} } };
    sandbox.window.window = sandbox.window;
    sandbox.document.addEventListener = function(){};
    vm.createContext(sandbox);
    if (withCatalog) {
        const cat = JSON.parse(fs.readFileSync(path.join(jsDir, 'catalog.js'), 'utf8').split('window.CATALOG = ')[1].replace(/;\s*$/, ''));
        if (mutate) mutate(cat);
        sandbox.window.CATALOG = cat;
    }
    vm.runInContext(fs.readFileSync(path.join(jsDir, 'motion.js'), 'utf8'), sandbox, { filename: 'motion.js' });
    return sandbox.window.Motion;
}

const m1 = load(true);
check('каталог прочитан', !!m1 && !!m1.PHYS, m1 && JSON.stringify(m1.PHYS.light));
const cat = JSON.parse(fs.readFileSync(path.join(jsDir, 'catalog.js'), 'utf8').split('window.CATALOG = ')[1].replace(/;\s*$/, ''));
const light = cat.ships.find(s => s.id === 'light');
check('класс light из каталога', m1.PHYS.light.a === Number(light.accel) && m1.PHYS.light.vc === Number(light.vmax_c),
    JSON.stringify(m1.PHYS.light) + ' vs ' + JSON.stringify(light));
const t1 = m1.kinSec(1000000, 'light');

const m2 = load(true, c => { c.ships.find(s => s.id === 'light').accel = Number(light.accel) * 2; });
const t2 = m2.kinSec(1000000, 'light');
check('изменение класса меняет время', t2 < t1, t1.toFixed(1) + ' → ' + t2.toFixed(1) + ' с');

const m3 = load(false);
check('без каталога — запасные значения', m3.PHYS.light.a === 80 && m3.PHYS.light.vc === 0.25, JSON.stringify(m3.PHYS.light));

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);