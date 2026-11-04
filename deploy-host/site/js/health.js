// Здоровье населения: болезни по расам, медицинские модули и смертность.
// Модель простая: чем меньше модулей на человека, тем выше доля больных.

export const MODULE_CAPACITY = 5000000;   // один медмодуль на 5 млн человек

// Болезни по расам. incidence — базовая доля больных без медицины,
// mortality — доля умерших среди больных за год.
export const DISEASES = {
    earth: [
        { id: 'resp', name: 'Дыхательная астма', incidence: 0.030, mortality: 0.02, note: 'наследие старых городов' },
        { id: 'metab', name: 'Метаболический синдром', incidence: 0.045, mortality: 0.015, note: 'избыток пищи, мало движения' },
        { id: 'viral', name: 'Сезонный вирус', incidence: 0.025, mortality: 0.005, note: 'плотность 12 млрд' },
        { id: 'onco', name: 'Онкология', incidence: 0.008, mortality: 0.25, note: 'лечится дорого' }
    ],
    mars: [
        { id: 'boneloss', name: 'Потеря костной массы', incidence: 0.050, mortality: 0.01, note: 'низкая гравитация' },
        { id: 'psych', name: 'Сенсорная депривация', incidence: 0.040, mortality: 0.004, note: 'жизнь в тишине' },
        { id: 'rad', name: 'Радиационная болезнь', incidence: 0.012, mortality: 0.20, note: 'работа на поверхности' },
        { id: 'hypox', name: 'Хроническая гипоксия', incidence: 0.020, mortality: 0.05, note: 'регенерация воздуха' }
    ],
    belt: [
        { id: 'osteo', name: 'Остеопороз невесомости', incidence: 0.065, mortality: 0.012, note: 'кости без нагрузки' },
        { id: 'cardio', name: 'Сердечная атрофия', incidence: 0.035, mortality: 0.06, note: 'сердцу не нужно качать кровь вверх' },
        { id: 'immune', name: 'Иммунодефицит', incidence: 0.020, mortality: 0.08, note: 'замкнутые станции' },
        { id: 'joint', name: 'Суставные усиления', incidence: 0.015, mortality: 0.01, note: 'осложнения имплантов' }
    ]
};

// Сколько модулей нужно на население.
export function modulesNeeded(pop) {
    return Math.max(0, Math.ceil(pop / MODULE_CAPACITY));
}

// Доля больных: при полном покрытии модулями падает до четверти базовой.
export function sickRate(pop, modules, race) {
    const list = DISEASES[race] || DISEASES.earth;
    const base = list.reduce((s, d) => s + d.incidence, 0);
    if (!pop) return 0;
    const need = modulesNeeded(pop);
    const cover = need === 0 ? 1 : Math.min(1, modules / need);
    const k = 1 - 0.75 * cover;              // 0 модулей — 1.0, полное покрытие — 0.25
    return Math.min(0.9, base * k);
}

// Умершие за год при таком уровне медицины.
export function deaths(pop, modules, race) {
    const list = DISEASES[race] || DISEASES.earth;
    const rate = sickRate(pop, modules, race);
    const avgMort = list.reduce((s, d) => s + d.incidence * d.mortality, 0) / Math.max(1e-6, list.reduce((s, d) => s + d.incidence, 0));
    return Math.round(pop * rate * avgMort);
}

// Стоимость модуля и его содержание.
export const MODULE_COST = 450000;
export const MODULE_UPKEEP = 12000;

export function selfCheck() {
    const need = modulesNeeded(12000000000) === 2400;
    const s0 = sickRate(10000000, 0, 'earth');
    const s2 = sickRate(10000000, 2, 'earth');
    const better = s2 < s0;
    return { ok: need && better && s0 > 0, need: modulesNeeded(12000000000), s0: +s0.toFixed(3), s2: +s2.toFixed(3) };
}
