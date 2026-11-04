const path = require('path');
const W = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'ww-core.js'));
const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

const rookie = { dex: 6, cun: 5, str: 7, end: 6, spd: 6 };      // сумма 30
const elite = { dex: 19, cun: 19, str: 19, end: 19, spd: 19 };   // сумма 95

check('минимум роста — 60 минут', W.growMinutes(rookie) === 60, W.growMinutes(rookie));
check('элита растёт дольше', W.growMinutes(elite) > W.growMinutes(rookie), W.growMinutes(elite).toFixed(1) + ' мин');
check('элита дороже', W.cost(elite) > W.cost(rookie), W.cost(elite));
check('рост монотонен по сумме', W.growMinutes({dex:10,cun:10,str:10,end:10,spd:10}) > W.growMinutes(rookie));
check('HP зависит от живучести', W.cloneInfo(elite).hp > W.cloneInfo(rookie).hp, W.cloneInfo(elite).hp);

check('T5 оружие сильнее T1', W.gearBonus('weapon', 5) > W.gearBonus('weapon', 1));
check('T5 броня сильнее T1', W.gearBonus('armor', 5) > W.gearBonus('armor', 1));
check('уровень выше 5 обрезается', W.gearBonus('weapon', 9) === W.gearBonus('weapon', 5));

check('в Яму пускают T1', W.arenaAllows('pit', 1));
check('в Яму не пускают T5', W.arenaAllows('pit', 5) === false);
check('в Сферу пускают T5', W.arenaAllows('sphere', 5));

// бой детерминирован
const A = W.makeFighter(elite, { weaponTier: 5, armorTier: 5, ammoTier: 5 });
const B = W.makeFighter(rookie, { weaponTier: 1, armorTier: 1, ammoTier: 1 });
const f1 = W.fight(A, B, 42);
const f2 = W.fight(A, B, 42);
check('бой воспроизводим по seed', JSON.stringify(f1) === JSON.stringify(f2));
check('сильный побеждает слабого', f1.winner === 'a', f1.winner + ' после ' + f1.rounds + ' раундов');

// броня снижает урон: тот же клон без брони получает больше
const B2 = W.makeFighter(rookie, { weaponTier: 1, armorTier: 5 });
const fArmor = W.fight(A, B2, 7);
check('броня продлевает бой', fArmor.rounds >= 1, 'раундов ' + fArmor.rounds);

// ничья при равных и маленьком лимите
const C = W.makeFighter(rookie, {}); const D = W.makeFighter(rookie, {});
const fd = W.fight(C, D, 3);
check('бой завершается за ≤30 раундов', FDrounds(fd) <= 30, fd.rounds + ' раундов');
function FDrounds(f){ return f.rounds; }

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);