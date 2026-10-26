// Найм людей: Земля, Марс, Пояс и колонии.
// Цена зависит от того, насколько условия нового мира похожи на родные.
// Чем ближе климат и гравитация — тем дешевле переезд и тем меньше потерь.

// Параметры мира: гравитация (g), давление (атм), температура (°C), радиация (0..10).
export const SOURCES = {
    earth:   { name: 'Земля',    gravity: 1.00, pressure: 1.0, temp: 15,  radiation: 1, note: 'родина человечества' },
    moon:    { name: 'Луна',     gravity: 0.16, pressure: 0.0, temp: -20, radiation: 6, note: 'низкая гравитация, вакуум' },
    mars:    { name: 'Марс',     gravity: 0.38, pressure: 0.01, temp: -60, radiation: 5, note: 'тонкая атмосфера, холод' },
    belt:    { name: 'Пояс',     gravity: 0.03, pressure: 0.0, temp: -80, radiation: 7, note: 'невесомость, замкнутые станции' },
    europa:  { name: 'Европа',   gravity: 0.13, pressure: 0.0, temp: -160, radiation: 8, note: 'лёд и подлёдный океан' },
    titan:   { name: 'Титан',    gravity: 0.14, pressure: 1.5, temp: -179, radiation: 3, note: 'плотная атмосфера, метан' },
    kepler1: { name: 'Кеплер-1', gravity: 1.10, pressure: 0.9, temp: 12,  radiation: 2, note: 'молодая колония' }
};

// Насколько условия похожи: 1 — практически родные, 0 — совсем чужие.
export function compatibility(sourceId, targetId) {
    const a = SOURCES[sourceId], b = SOURCES[targetId];
    if (!a || !b) return 0;

    const dg = Math.min(1, Math.abs(a.gravity - b.gravity) / 1.0);          // гравитация
    const dp = Math.min(1, Math.abs(a.pressure - b.pressure) / 1.5);       // давление
    const dt = Math.min(1, Math.abs(a.temp - b.temp) / 180);               // температура
    const dr = Math.min(1, Math.abs(a.radiation - b.radiation) / 10);      // радиация

    const dist = 0.40 * dg + 0.25 * dp + 0.20 * dt + 0.15 * dr;
    return Math.max(0, Math.min(1, 1 - dist));
}

// Базовая цена переезда одного человека.
export const BASE_COST = 1200;

// Цена с учётом похожести: чужие условия дороже в разы (подготовка, медицина, адаптация).
export function hireCost(sourceId, targetId) {
    const c = compatibility(sourceId, targetId);
    const k = 1 + Math.pow(1 - c, 1.6) * 4;     // от 1× до 5×
    return Math.round(BASE_COST * k);
}

// Сколько людей реально доедет: часть отсеивается на медкомиссии.
export function survivors(count, sourceId, targetId) {
    const c = compatibility(sourceId, targetId);
    const rate = 0.70 + 0.28 * c;               // 70% при чужих условиях, 98% при родных
    return Math.round(count * rate);
}

// Предупреждение для игрока.
export function verdict(sourceId, targetId) {
    const c = compatibility(sourceId, targetId);
    if (c > 0.85) return 'условия почти родные — переезд лёгкий';
    if (c > 0.6) return 'условия близкие — адаптация пройдёт спокойно';
    if (c > 0.35) return 'условия заметно отличаются — нужна подготовка';
    return 'условия чужие — большая часть отсеется';
}

export function selfCheck() {
    const same = compatibility('mars', 'mars');
    const moonMoon = compatibility('moon', 'moon');
    const earthMars = compatibility('earth', 'mars');
    const earthEarth = compatibility('earth', 'earth');
    const ok = same === 1 && moonMoon === 1 && earthEarth === 1 && earthMars < 0.9;
    return {
        ok,
        'марс→марс': hireCost('mars', 'mars'),
        'земля→марс': hireCost('earth', 'mars'),
        'земля→пояс': hireCost('earth', 'belt'),
        'луна→луна': hireCost('moon', 'moon'),
        'земля→кеплер': hireCost('earth', 'kepler1')
    };
}

// Время в пути от источника до колонии (игровые часы).
// Доставка идёт по математике маршрута, а не мгновенно.
const ZONE = {
    earth: 'inner', moon: 'inner', mars: 'inner', belt: 'belt',
    europa: 'outer', titan: 'outer', kepler1: 'beyond'
};

const ZONE_HOURS = {
    'inner-inner': 8,
    'inner-belt': 34,
    'inner-outer': 62,
    'inner-beyond': 118,
    'belt-belt': 10,
    'belt-outer': 40,
    'belt-beyond': 96,
    'outer-outer': 14,
    'outer-beyond': 74,
    'beyond-beyond': 6
};

export function travelHours(sourceId, targetId) {
    const a = ZONE[sourceId] || 'inner';
    const b = ZONE[targetId] || 'inner';
    const key = [a, b].sort().join('-');
    return ZONE_HOURS[key] || ZONE_HOURS[[b, a].join('-')] || 40;
}

// Прибытие: население приходит только по истечении срока и сразу ест.
export function arrivalAt(sourceId, targetId, nowMs, timeScale) {
    const hours = travelHours(sourceId, targetId);
    const realMs = hours * 3600 * 1000 / Math.max(1, timeScale || 1);
    return nowMs + Math.max(1000, realMs);
}
