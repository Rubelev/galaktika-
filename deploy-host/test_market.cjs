// Проверка рынка без браузера
const fs = require('fs');
const vm = require('vm');

const sandbox = {
    window: {},
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
    document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), addEventListener() {}, body: { appendChild() {} } },
    setInterval() {},
    console
};
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), sandbox);

const M = sandbox.window.MarketMath;
const assert = (cond, label) => { console.log((cond ? 'OK   ' : 'FAIL ') + label); if (!cond) process.exitCode = 1; };

let st = M.create();
assert(M.price(st, 'grain') === 4, 'цена зерна на нормальном складе = базовая 4');

// дефицит поднимает цену
st.stock.grain = 0;
assert(M.price(st, 'grain') > 4, 'при пустом складе дороже: ' + M.price(st, 'grain').toFixed(2));
assert(M.price(st, 'grain') <= 10.01, 'но не выше 2.5× базовой');

// избыток снижает
st.stock.grain = M.GOODS.grain.norm * 2;
assert(M.price(st, 'grain') < 4, 'при двойном запасе дешевле: ' + M.price(st, 'grain').toFixed(2));

// покупка уменьшает склад и возвращает сумму
st = M.create();
const before = st.stock.grain;
let r = M.trade(st, 'grain', 1000, true);
assert(r.ok && r.sum > 0, 'покупка 1000 кг прошла, сумма ' + Math.round(r.sum));
assert(st.stock.grain === before - 1000, 'склад NPC уменьшился на 1000');

// продажа возвращает товар на склад
r = M.trade(st, 'grain', 500, false);
assert(r.ok, 'продажа прошла');
assert(st.stock.grain === before - 500, 'склад NPC вырос на 500');

// нельзя купить больше, чем есть
r = M.trade(st, 'grain', st.stock.grain + 1, true);
assert(!r.ok, 'нельзя купить больше склада: ' + r.reason);

// склады восстанавливаются со временем
st = M.create();
st.stock.grain = 0;
M.step(st, 24);
assert(st.stock.grain > 0, 'за сутки склад пополнился до ' + Math.round(st.stock.grain));
assert(st.stock.grain < M.GOODS.grain.norm, 'восстановление не мгновенное');

// спред: покупка дороже продажи
st = M.create();
assert(M.buyPrice(st, 'water') > M.sellPrice(st, 'water'), 'спред рынка соблюдён');

console.log('готово');
