// Приёмка завода еды: тренд «энергия вниз, выпуск вверх», покрытие людей,
// у каждого этапа есть сырьё, стоимость растёт, тиры не пропущены.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');
const sb = { window: {}, console, Math, JSON };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(dir, 'food-factory.js'), 'utf8'), sb, { filename: 'food-factory.js' });
const F = sb.window.FOOD_FACTORY;
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

check('этапов 4', F.length === 4, F.length);
check('тиры 1..4 без пропусков', F.map(f => f.tier).join(',') === '1,2,3,4', F.map(f => f.tier).join(','));

let monoEnergy = true, monoOutput = true, monoCost = true;
for (let i = 1; i < F.length; i++) {
    if (F[i].kwh_kg >= F[i - 1].kwh_kg) monoEnergy = false;
    if (F[i].kg_day <= F[i - 1].kg_day) monoOutput = false;
    if (F[i].cost <= F[i - 1].cost) monoCost = false;
}
check('энергия падает с этапом', monoEnergy, F.map(f => f.kwh_kg).join(' → '));
check('выпуск растёт с этапом', monoOutput, F.map(f => f.kg_day).join(' → '));
check('стоимость растёт', monoCost, F.map(f => Math.round(f.cost / 1e6) + 'М').join(' → '));

// каждый этап имеет хотя бы один источник углерода и энергии
F.forEach(f => {
    const hasCarbon = f.inputs.co2 > 0 || f.inputs.methane > 0;
    check('T' + f.tier + ' имеет источник углерода', hasCarbon, JSON.stringify(f.inputs));
    check('T' + f.tier + ' энергия > 0', f.kwh_kg > 0, f.kwh_kg);
});

// сколько людей кормит один завод (0,3 кг/чел/сутки — как в colony.js)
const people = F.map(f => Math.round(f.kg_day / 0.3));
check('T1 кормит ~1700', Math.abs(people[0] - 1667) <= 5, people[0]);
check('T4 кормит ~30000', Math.abs(people[3] - 30000) <= 5, people[3]);
check('рост покрытия людей', people.every((v, i) => i === 0 || v > people[i - 1]), people.join(' → '));

// суточная энергия завода и на человека
const ePerPerson = F.map(f => (f.kwh_kg * 0.3).toFixed(1));
check('энергия на человека в сутки ≤ 6 кВт·ч', F.every(f => f.kwh_kg * 0.3 <= 6), ePerPerson.join(' / '));

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log('\n=== ИТОГ ===\nпроверок: ' + res.length + ' | успешно: ' + (res.length - failed.length) + ' | провалов: ' + failed.length);
process.exit(failed.length ? 1 : 0);