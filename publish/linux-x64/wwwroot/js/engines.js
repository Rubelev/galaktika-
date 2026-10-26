// Двигатели: чертежи, уровни, дополнительный контур.
// Расчёт скорости и расхода держим отдельно от интерфейса.

export const ENGINES = {
    jet: {
        name: 'Реактивный',
        code: 'Д-1 «Факел»',
        thrust: 2.4, vmax: 3.2, fuel: 1.0,
        note: 'простой и дешёвый, жрёт топливо, хорош на коротких плечах',
        blueprint: [
            'Камера сгорания с керамической футеровкой',
            'Турбонасос высокого давления',
            'Сопло Лаваля с регулируемым критическим сечением',
            'Бак керосина и окислителя, раздельные магистрали'
        ]
    },
    ion: {
        name: 'Ионный',
        code: 'Д-2 «Шёпот»',
        thrust: 0.8, vmax: 2.4, fuel: 0.3,
        note: 'тихий и экономный, разгон медленный — марсианская школа',
        blueprint: [
            'Ионизационная камера на ксеноне',
            'Магнитная решётка ускорения',
            'Электростатический экран, гасящий шум',
            'Реактор питания и система охлаждения'
        ]
    },
    plasma: {
        name: 'Плазменный',
        code: 'Д-3 «Копьё»',
        thrust: 4.2, vmax: 5.6, fuel: 1.6,
        note: 'быстрый, дорогой, греется — для перехватчиков',
        blueprint: [
            'Токамак-инжектор плазмы',
            'Магнитные дюзы с изменяемой геометрией',
            'Теплообменник на жидком металле',
            'Аварийный сброс плазмы в вакуум'
        ]
    },
    grav: {
        name: 'Гравитационный',
        code: 'Д-4 «Безмолвие»',
        thrust: 1.6, vmax: 2.8, fuel: 0.5,
        note: 'работает без выхлопа, не требует топлива на манёвр, но дорог',
        blueprint: [
            'Гравитационный контур на антиматерии',
            'Сверхпроводящие катушки, охлаждение до 4 K',
            'Компенсатор перегрузок для экипажа',
            'Резонансный стабилизатор курса'
        ]
    }
};

export const MAX_LEVEL = 5;
export const MAX_EXTRA_ENGINES = 3;

// Скорость: базовый ход × уровень × дополнительный контур.
export function speed(type, level, extra) {
    const e = ENGINES[type] || ENGINES.jet;
    const lv = Math.max(1, Math.min(MAX_LEVEL, level || 1));
    const ex = Math.max(0, Math.min(MAX_EXTRA_ENGINES, extra || 0));
    return Math.round(e.vmax * (1 + 0.15 * (lv - 1)) * (1 + 0.18 * ex) * 100) / 100;
}

// Расход: каждый уровень и каждый контур повышают аппетит.
export function fuelUse(type, level, extra) {
    const e = ENGINES[type] || ENGINES.jet;
    const lv = Math.max(1, Math.min(MAX_LEVEL, level || 1));
    const ex = Math.max(0, Math.min(MAX_EXTRA_ENGINES, extra || 0));
    return Math.round(e.fuel * (1 + 0.10 * (lv - 1)) * (1 + 0.35 * ex) * 100) / 100;
}

// Цена уровня: растёт вместе с классом двигателя.
export function upgradeCost(type, level) {
    const e = ENGINES[type] || ENGINES.jet;
    return Math.round(25000 * (level || 1) * (1 + e.vmax / 4));
}

// Цена дополнительного контура: дорого, потому что это второй двигатель.
export function extraCost(type, extra) {
    const e = ENGINES[type] || ENGINES.jet;
    return Math.round(60000 * (extra + 1) * (1 + e.thrust / 3));
}

export function selfCheck() {
    const s1 = speed('jet', 1, 0) === 3.2;
    const s2 = speed('jet', 5, 0) > s1;
    const s3 = speed('jet', 1, 3) > s1;
    const f1 = fuelUse('jet', 1, 0) === 1;
    const f2 = fuelUse('jet', 1, 3) > f1;
    return { ok: s1 && s2 && s3 && f1 && f2, top: speed('plasma', 5, 3) };
}
