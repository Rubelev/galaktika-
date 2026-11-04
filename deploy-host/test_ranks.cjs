// Проверка званий без браузера
const fs = require('fs');
const vm = require('vm');

const sandbox = {
    window: {},
    document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), addEventListener() {}, body: { appendChild() {} } },
    setInterval() {},
    console
};
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), sandbox);

const M = sandbox.window.RanksMath;
const assert = (cond, label) => { console.log((cond ? 'OK   ' : 'FAIL ') + label); if (!cond) process.exitCode = 1; };

const base = (patch) => Object.assign({ credits: 0, fleet: {}, factories: {}, colony: null }, patch);

assert(M.evaluate(base({})).index === 0, 'новичок — стажёр');
assert(M.evaluate(base({ credits: 250000 })).index === 1, '200k кр → Торговец');
assert(M.evaluate(base({ credits: 250000 })).bonus === 5000, 'награда за Торговца 5000');

const owner = base({ credits: 250000, fleet: { transport: 3, fighter: 2 } });
assert(M.evaluate(owner).index === 2, '5 кораблей → Владелец флота');
assert(M.evaluate(owner).bonus === 15000, 'награды суммируются: 5000+10000');

const ind = base({ credits: 250000, fleet: { transport: 3, fighter: 2 }, factories: { a: 1, b: 2, c: 1 }, colony: { population: 150000, happiness: 70 } });
assert(M.evaluate(ind).index === 3, '3 постройки и колония 150k → Промышленник');

const gov = base({ credits: 250000, fleet: { a: 5 }, factories: { a: 1, b: 1, c: 1 }, colony: { population: 600000, happiness: 65 } });
assert(M.evaluate(gov).index === 4, 'колония 600k и счастье 65 → Губернатор');

const lowHappy = base({ credits: 250000, fleet: { a: 5 }, factories: { a: 1, b: 1, c: 1 }, colony: { population: 600000, happiness: 40 } });
assert(M.evaluate(lowHappy).index === 3, 'при счастье 40% губернатором не стать');

const legend = base({ credits: 12000000, fleet: { a: 15 }, factories: { a: 1, b: 1, c: 1 }, colony: { population: 3200000, happiness: 90 } });
assert(M.evaluate(legend).index === 6, 'все условия → Легенда Галактики');
assert(M.evaluate(legend).bonus === 5000 + 10000 + 20000 + 40000 + 80000 + 150000, 'полная сумма наград');

// уже повышенный ранг не откатывается
const already = base({ credits: 250000, rankId: 'owner' });
assert(M.evaluate(already).index === 2, 'ранг не понижается, если условия упали');

console.log('готово');
