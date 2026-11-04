// Проверка математики колонии без браузера: подставляем заглушки window/document
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(process.argv[2], 'utf8');
const sandbox = {
    window: {},
    document: {
        readyState: 'complete',
        getElementById: () => null,
        createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
        addEventListener() {},
        body: { appendChild() {} }
    },
    setInterval() {},
    console
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const M = sandbox.window.ColonyMath;
const assert = (cond, label) => {
    console.log((cond ? 'OK   ' : 'FAIL ') + label);
    if (!cond) process.exitCode = 1;
};

let c = M.create('kepler', 'Тест');
assert(c.population === 50000, 'стартовое население 50 000');
assert(c.taxRate === 0.1, 'ставка налога 10%');

// сутки при полном снабжении
let res = { grain: 1e9, water: 1e6 };
let r = M.step(c, res, 1);
assert(r.deficit === 0, 'дефицита нет');
assert(r.credits > 0, 'налоги начислены: ' + Math.round(r.credits));
assert(c.population > 50000, 'население выросло: ' + Math.round(c.population));
assert(res.grain < 1e9, 'зерно израсходовано');

// голод: еды нет
let c2 = M.create();
let res2 = { grain: 0, water: 1e6 };
let before = c2.population, happ = c2.happiness;
let r2 = M.step(c2, res2, 5);
assert(r2.deficit > 0.99, 'дефицит еды зафиксирован');
assert(c2.happiness < happ, 'счастье упало с ' + happ + ' до ' + Math.round(c2.happiness));
assert(c2.population < before, 'население сократилось');

// запас дней
let c3 = M.create();
let res3 = { grain: c3.population * M.FOOD_PER_PERSON_DAY * 10, water: c3.population * M.WATER_PER_PERSON_DAY * 4 };
assert(Math.abs(M.daysLeft(c3, res3) - 4) < 0.01, 'запасов ровно на 4 дня');

// потолок населения
let c4 = M.create();
c4.population = M.CAP - 1000;
c4.happiness = 100;
M.step(c4, { grain: 1e12, water: 1e12 }, 30);
assert(c4.population <= M.CAP, 'потолок 5 млн не превышен');

// налоги масштабируются ставкой
let c5 = M.create(); c5.taxRate = 0.3;
let r5 = M.step(c5, { grain: 1e9, water: 1e6 }, 1);
let c6 = M.create(); c6.taxRate = 0.1;
let r6 = M.step(c6, { grain: 1e9, water: 1e6 }, 1);
assert(r5.credits > r6.credits, 'ставка 30% даёт больше налогов, чем 10%');

console.log('готово');
