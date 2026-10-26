// Производство и стройка: чистые расчёты времени, стоимости и прогресса.
// Вынесено из solar.js, чтобы баланс можно было проверять без игры.

// Время постройки уровня: каждый следующий дольше в 1.5 раза.
export function levelTime(baseMinutes, level) {
    return Math.max(1, Math.round(baseMinutes * Math.pow(1.5, level)));
}

// Сталь на уровень: крупная стройка эффективнее, расход падает.
export function levelSteel(baseSteel, level) {
    return Math.max(1, Math.round(baseSteel * Math.pow(0.9, level)));
}

// Рабочие руки на уровень: падают быстрее стали.
export function levelCrew(baseCrew, level) {
    return Math.max(0, Math.round(baseCrew * Math.pow(0.85, level)));
}

// Время постройки корабля с учётом дисциплин (точная механика и биоматериалы).
export function shipMinutes(baseMinutes, precisionLevel, biomatLevel) {
    const k = 1 - 0.03 * (precisionLevel || 0) - 0.02 * (biomatLevel || 0);
    return Math.max(1, Math.round(baseMinutes * Math.max(0.4, k)));
}

// Время постройки фабрики: база + уровень, ускорение подземным строительством.
export function factoryMinutes(baseMinutes, level, tunnelsLevel) {
    const k = 1 - 0.03 * (tunnelsLevel || 0);
    return Math.max(1, Math.round((baseMinutes + level) * Math.max(0.4, k)));
}

// Реальные минуты рейса: игровые часы сжимаются множителем.
export function tripMinutes(hours, scale) {
    const s = (typeof scale === 'number' && scale > 0) ? scale : 60;
    return Math.max(1, Math.round(hours * 60 / s));
}

// Прогресс стройки в процентах.
export function progress(startMs, endMs, nowMs) {
    const total = endMs - startMs;
    if (total <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((nowMs - startMs) / total * 100)));
}

// Самопроверка для смоука и отладки.
export function selfCheck() {
    const t1 = levelTime(5, 0) === 5;
    const t2 = levelTime(5, 4) > levelTime(5, 3);
    const s1 = levelSteel(80, 0) === 80;
    const s2 = levelSteel(80, 4) < s1;
    const c1 = levelCrew(10, 4) < levelCrew(10, 0);
    const p1 = progress(0, 1000, 250) === 25;
    return { ok: t1 && t2 && s1 && s2 && c1 && p1, level5: levelTime(5, 4), steel5: levelSteel(80, 4) };
}
