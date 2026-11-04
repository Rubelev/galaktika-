// Приёмка экономики еды: деликатес ≥ ×10 к аналогу, источники существуют,
// рецепты положительные, синтетика покрывает базовые потребности.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');
const sb = { window: {}, console, Math, JSON };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(dir, 'food.js'), 'utf8'), sb, { filename: 'food.js' });
const FOOD = sb.window.FOOD;
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

const kinds = FOOD.kinds, recipes = FOOD.recipes;
const cls = k => k.food_class || k.cls;
const synth = kinds.filter(k => cls(k) === 'synthetic');
const deli = kinds.filter(k => cls(k) === 'delicacy');

check('позиций всего 12', kinds.length === 12, kinds.length);
check('синтетики 4', synth.length === 4, synth.length);
check('деликатесов 8', deli.length === 8, deli.length);

const price = Object.fromEntries(kinds.map(k => [k.id, k.base_price]));
let worst = null;
deli.forEach(d => {
  const base = price[d.equivalent];
  const m = d.base_price / base;
  if (!worst || m < worst.m) worst = { id: d.id, m };
  check('деликатес ' + d.id + ' ≥ ×10', m >= 10, '×' + m.toFixed(2));
});
check('минимальный множитель ≥10', worst && worst.m >= 10, worst ? (worst.id + ' ×' + worst.m.toFixed(2)) : '-');

check('у синтетики есть источник', synth.every(k => k.source_body), synth.map(k => k.source_body).join(','));
check('у деликатесов есть источник', deli.every(k => k.source_body), deli.map(k => k.source_body).join(','));
check('рецептов ≥ 8', recipes.length >= 8, recipes.length);
check('все входы положительные', recipes.every(r => Number(r.qty) > 0), '');
const energy = recipes.filter(r => Number(r.energy) > 0).length;
check('энергия указана в рецептах', energy >= 4, energy + ' рецептов с кВт·ч');
check('у каждого синтетика есть рецепт', synth.every(k => recipes.some(r => r.output === k.id)),
  synth.filter(k => !recipes.some(r => r.output === k.id)).map(k => k.id).join(',') || 'все покрыты');
check('деликатесы НЕ производятся рецептом', deli.every(k => !recipes.some(r => r.output === k.id)), 'только натуральные');

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log('\n=== ИТОГ ===\nпроверок: ' + res.length + ' | успешно: ' + (res.length - failed.length) + ' | провалов: ' + failed.length);
process.exit(failed.length ? 1 : 0);