// Экономика: чистые функции ценообразования и дефицита.
// Вынесено из solar.js, чтобы цены можно было считать и проверять отдельно.
// Мир здесь — объект вида { id, needs: {...}, produces: {...}, pop }.

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Отношение спроса к предложению для одного товара по всем мирам.
export function marketIndex(good, worlds) {
    let demand = 0, supply = 0;
    (worlds || []).forEach(w => {
        demand += (w.needs && w.needs[good]) || 0;
        supply += (w.produces && w.produces[good]) || 0;
    });
    return { demand: demand, supply: supply, ratio: demand / Math.max(supply, 0.15) };
}

// Множитель цены: степень 0.6 не даёт рынку улетать в космос.
export function priceFactor(ratio) {
    return clamp(Math.pow(ratio, 0.6), 0.4, 3);
}

// Итоговая цена товара с учётом дрейфа (0.5..2.0).
export function priceOf(base, ratio, drift) {
    const d = (typeof drift === 'number' && drift > 0) ? drift : 1;
    return Math.max(1, Math.round(base * priceFactor(ratio) * d));
}

// Покрытие спроса предложением в процентах.
export function coverage(demand, supply) {
    if (demand <= 0) return 100;
    return Math.round(supply / demand * 100);
}

// Сколько тонн не хватает миру по каждому товару.
export function deficit(world) {
    const out = {};
    const needs = world.needs || {};
    const produces = world.produces || {};
    Object.keys(needs).forEach(g => {
        const gap = (needs[g] || 0) - (produces[g] || 0);
        if (gap > 0) out[g] = gap;
    });
    return out;
}

// Простая проверка модели: используется смоук-тестом и при отладке.
export function selfCheck() {
    const w = [
        { id: 'a', needs: { water: 2 }, produces: { water: 1 } },
        { id: 'b', needs: { water: 1 }, produces: { water: 0 } }
    ];
    const idx = marketIndex('water', w);
    const ok1 = idx.demand === 3 && idx.supply === 1;
    const ok2 = priceFactor(2) > 1 && priceFactor(0.2) < 1;
    const ok3 = coverage(3, 1) === 33;
    return { ok: ok1 && ok2 && ok3, index: idx, factor: priceFactor(idx.ratio) };
}
